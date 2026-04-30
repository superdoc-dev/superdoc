#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_API_URL = 'https://labs-api.superdoc.workers.dev';
const DEFAULT_BROWSERS = ['chromium', 'firefox', 'webkit'];
const DEFAULT_POLL_INTERVAL_SECONDS = 10;
const DEFAULT_SHARD_COUNT = 64;
const CUSTOM_API_URL_OPT_IN_ENV = 'SUPERDOC_ALLOW_CUSTOM_LABS_API_URL';
const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const OFFICIAL_LABS_API_HOSTS = new Set(['labs-api.superdoc.workers.dev', 'labs.superdoc.dev']);
const PACKAGE_ARTIFACT_PATH = path.join('packages', 'superdoc', 'superdoc.tgz');
const TERMINAL_RUN_STATUSES = new Set(['action_required', 'cancelled', 'failed', 'succeeded', 'superseded']);
const ANSI_ESCAPE_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/gu;
const MAX_RECENT_EVENTS = 6;
const MAX_FAILURE_LOG_LINES = 8;
const PROGRESS_BAR_WIDTH = 28;
const AUTHENTICATION_HELP_MESSAGE = [
  'Cloud behavior tests require Labs auth.',
  'Set CLOUDFLARE_API_TOKEN to a Cloudflare user API token, or run `npx wrangler login`.',
].join(' ');

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main() {
  const options = parseArgs(stripPnpmSeparator(process.argv.slice(2)));
  if (options.help) {
    printHelp();
    return;
  }

  const token = readCloudflareBearerToken();
  const apiUrl = resolveApiUrl();
  const packageSource = options.npmVersion
    ? createNpmPackageSource(options.npmVersion)
    : await buildAndUploadPackageSource(apiUrl, token);

  const createResponse = await labsApiFetch(apiUrl, '/v1/superdoc/test-runs', token, {
    body: JSON.stringify({
      browsers: options.browsers,
      failFast: options.failFast,
      ...(options.grep ? { grep: options.grep } : {}),
      packageSource,
      ...(options.pr !== undefined ? { pullRequestNumber: options.pr } : {}),
      screenshots: options.screenshots,
      shardCount: options.shardCount,
      suite: 'behavior',
      timeoutMinutes: options.timeoutMinutes,
      trace: options.trace,
    }),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  });

  if (options.json || !options.wait) {
    console.log(JSON.stringify(createResponse, null, 2));
    return;
  }

  const finalRun = await waitForRun(apiUrl, token, createResponse.run.runId, {
    includeShardDetails: options.verbose,
    intervalSeconds: options.intervalSeconds,
    packageSource,
    timeoutSeconds: options.timeoutSeconds,
  });

  if (finalRun.status !== 'succeeded') {
    process.exitCode = 1;
  }
}

async function buildAndUploadPackageSource(apiUrl, token) {
  const packageStartedAt = Date.now();
  console.log('Preparing behavior test package');
  console.log(`RUN  package  ${formatCommand(['pnpm', 'run', 'pack:es'])}`);
  runCommandCaptured('pnpm', ['run', 'pack:es'], process.cwd());

  const artifactPath = path.resolve(process.cwd(), PACKAGE_ARTIFACT_PATH);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Expected package artifact at ${PACKAGE_ARTIFACT_PATH} after pnpm run pack:es.`);
  }

  const artifactBytes = fs.readFileSync(artifactPath);
  console.log(
    `OK   package  ${PACKAGE_ARTIFACT_PATH} ${formatFileSize(artifactBytes.byteLength).padStart(9)} ${formatDuration(
      Date.now() - packageStartedAt,
    ).padStart(8)}`,
  );

  const uploadStartedAt = Date.now();
  console.log(`RUN  upload   ${PACKAGE_ARTIFACT_PATH}`);
  const uploadResponse = await labsApiFetch(apiUrl, '/v1/superdoc/test-runs/package-artifacts', token, {
    body: artifactBytes,
    headers: {
      'content-type': 'application/gzip',
      'x-superdoc-package-file-name': path.basename(artifactPath),
    },
    method: 'POST',
  });

  const uploadedSource = uploadResponse.packageSource;
  console.log(
    `OK   upload   ${uploadedSource.sha256.slice(0, 12)} ${formatDuration(Date.now() - uploadStartedAt).padStart(8)}`,
  );
  return uploadedSource;
}

function createNpmPackageSource(version) {
  return {
    kind: 'npm_version',
    packageName: 'superdoc',
    version,
  };
}

function runCommandCaptured(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const logs = [...normalizeOutputLines(result.stdout), ...normalizeOutputLines(result.stderr)].slice(-14);
    const detail = logs.length ? `\nLast output:\n${logs.map((line) => `  ${line}`).join('\n')}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}.${detail}`);
  }
}

async function waitForRun(apiUrl, token, runId, options) {
  const deadline = Date.now() + options.timeoutSeconds * 1000;
  const interactive = isInteractiveOutput();
  const color = supportsColor();
  let renderedLines = 0;
  let lastProgressSignature = null;

  if (interactive) {
    process.stdout.write('\x1B[?25l');
  }

  try {
    while (true) {
      const state = await getSuperdocTestRunState(apiUrl, token, runId);
      const now = new Date();
      const renderOptions = {
        color,
        includeShardDetails: options.includeShardDetails,
        now,
        packageSource: options.packageSource,
        ...(process.stdout.columns ? { width: process.stdout.columns } : {}),
      };

      if (TERMINAL_RUN_STATUSES.has(state.run.status)) {
        if (interactive) {
          renderedLines = renderInteractiveBehaviorRunState(state, renderedLines, renderOptions);
        } else {
          console.log(renderBehaviorRunView(state, renderOptions));
        }
        return state.run;
      }

      if (interactive) {
        renderedLines = renderInteractiveBehaviorRunState(state, renderedLines, renderOptions);
      } else {
        const signature = behaviorRunProgressSignature(state);
        if (signature !== lastProgressSignature) {
          console.log(renderBehaviorRunProgressUpdate(state, { color, now }));
          lastProgressSignature = signature;
        }
      }

      if (Date.now() >= deadline) {
        throw new Error(`Timed out after ${options.timeoutSeconds} seconds while waiting for run ${runId}.`);
      }

      await sleep(options.intervalSeconds * 1000);
    }
  } finally {
    if (interactive) {
      process.stdout.write('\x1B[?25h');
    }
  }
}

async function getSuperdocTestRunState(apiUrl, token, runId) {
  const encodedRunId = encodeURIComponent(runId);
  const [runResponse, eventsResponse, workItemsResponse] = await Promise.all([
    labsApiFetch(apiUrl, `/v1/superdoc/test-runs/${encodedRunId}`, token, { method: 'GET' }),
    labsApiFetch(apiUrl, `/v1/superdoc/test-runs/${encodedRunId}/events`, token, { method: 'GET' }),
    labsApiFetch(apiUrl, `/v1/superdoc/test-runs/${encodedRunId}/work-items`, token, { method: 'GET' }),
  ]);
  return {
    events: eventsResponse.events ?? [],
    run: runResponse.run,
    workItems: workItemsResponse.workItems ?? [],
  };
}

function renderInteractiveBehaviorRunState(state, renderedLines, options) {
  clearRenderedBlock(renderedLines);
  const rendered = renderBehaviorRunView(state, options);
  process.stdout.write(`${rendered}\n`);
  return rendered.split('\n').length;
}

function clearRenderedBlock(renderedLines) {
  if (!renderedLines || !isInteractiveOutput()) {
    return;
  }
  process.stdout.moveCursor(0, -renderedLines);
  for (let index = 0; index < renderedLines; index += 1) {
    process.stdout.clearLine(0);
    if (index < renderedLines - 1) {
      process.stdout.moveCursor(0, 1);
    }
  }
  if (renderedLines > 1) {
    process.stdout.moveCursor(0, -(renderedLines - 1));
  }
}

function renderBehaviorRunView(input, options = {}) {
  const now = options.now ?? new Date();
  const width = Math.max(72, options.width ?? 100);
  const palette = createPalette(Boolean(options.color));
  const summary = summarizeBehaviorRun(input);
  const packageSource = options.packageSource ?? input.run.input?.packageSource;
  const heading = `${palette.bold('SuperDoc Behavior Tests')}  ${formatRunStatus(input.run.status, palette)}`;
  const lines = [
    heading,
    '',
    formatField('Run', input.run.runId, palette),
    formatField('Package', packageSource ? formatPackageSource(packageSource) : 'unknown', palette),
    formatField('Browsers', formatBrowserList(input.run, input.workItems), palette),
    formatField('Shards', formatShardPlan(input.run, summary.expectedTotal), palette),
    formatField('Elapsed', formatRunElapsed(input.run, now), palette),
    '',
    formatField('Current', describeCurrentState(input.run, summary), palette),
    formatField('Progress', formatProgress(summary, palette), palette),
    formatField('Summary', formatCounts(summary.counts, palette), palette),
    '',
    palette.bold('By Browser'),
    ...summary.browserSummaries.map((browserSummary) => formatBrowserSummary(browserSummary, palette)),
  ];

  if (summary.recentEvents.length > 0) {
    lines.push('', palette.bold('Recent'));
    lines.push(...summary.recentEvents.map((event) => truncateVisible(formatEvent(event, palette), width)));
  }

  if (summary.firstFailedWorkItem) {
    lines.push('', palette.bold(palette.red('First Failure')));
    lines.push(...formatFailure(summary.firstFailedWorkItem, palette, width));
  }

  if (options.includeShardDetails && input.workItems.length > 0) {
    lines.push('', palette.bold('Shard Details'));
    lines.push(...formatShardDetails(input.workItems, palette, width));
  }

  return lines.map((line) => truncateVisible(line, width)).join('\n');
}

function renderBehaviorRunProgressUpdate(input, options = {}) {
  const palette = createPalette(Boolean(options.color));
  const summary = summarizeBehaviorRun(input);
  const elapsed = formatRunElapsed(input.run, options.now ?? new Date());
  return [
    formatClock(options.now ?? new Date()),
    formatRunStatus(input.run.status, palette),
    `${summary.terminalTotal}/${summary.expectedTotal} complete`,
    `${summary.counts.succeeded} passed`,
    `${summary.counts.failed} failed`,
    `${summary.counts.running} running`,
    `${summary.counts.queued} queued`,
    elapsed,
  ].join('  ');
}

function behaviorRunProgressSignature(input) {
  const summary = summarizeBehaviorRun(input);
  return [
    input.run.status,
    summary.latestPhase ?? '',
    summary.terminalTotal,
    summary.expectedTotal,
    summary.counts.succeeded,
    summary.counts.failed,
    summary.counts.skipped,
    summary.counts.superseded,
    summary.counts.running,
    summary.counts.queued,
  ].join(':');
}

function summarizeBehaviorRun(input) {
  const expectedTotal = getExpectedTotal(input.run, input.workItems);
  const syntheticQueuedCount =
    input.workItems.length === 0 && !TERMINAL_RUN_STATUSES.has(input.run.status) ? expectedTotal : 0;
  const counts = countStatuses(input.workItems, syntheticQueuedCount);
  const terminalTotal = counts.succeeded + counts.failed + counts.skipped + counts.superseded;
  return {
    browserSummaries: summarizeBrowsers(input.run, input.workItems),
    counts,
    expectedTotal,
    firstFailedWorkItem: findFirstFailedWorkItem(input.workItems),
    latestPhase: findLatestPhase(input.events),
    recentEvents: selectRecentEvents(input.events),
    terminalTotal,
  };
}

function summarizeBrowsers(run, workItems) {
  const browsers = getBrowsers(run, workItems);
  const expectedShardCount = getExpectedShardCount(run);
  return browsers.map((browser) => {
    const items = workItems.filter((workItem) => workItem.browser === browser);
    const syntheticQueuedCount =
      items.length === 0 && expectedShardCount > 0 && !TERMINAL_RUN_STATUSES.has(run.status) ? expectedShardCount : 0;
    return {
      browser,
      counts: countStatuses(items, syntheticQueuedCount),
      total: Math.max(items.length, syntheticQueuedCount),
    };
  });
}

function countStatuses(workItems, syntheticQueuedCount = 0) {
  const counts = {
    failed: 0,
    queued: syntheticQueuedCount,
    running: 0,
    skipped: 0,
    succeeded: 0,
    superseded: 0,
  };

  for (const workItem of workItems) {
    if (workItem.status === 'succeeded') counts.succeeded += 1;
    else if (workItem.status === 'failed') counts.failed += 1;
    else if (workItem.status === 'running') counts.running += 1;
    else if (workItem.status === 'queued') counts.queued += 1;
    else if (workItem.status === 'skipped') counts.skipped += 1;
    else if (workItem.status === 'superseded') counts.superseded += 1;
  }

  return counts;
}

function getExpectedTotal(run, workItems) {
  const inputTotal = getBrowsers(run, workItems).length * getExpectedShardCount(run);
  return Math.max(inputTotal, workItems.length, 1);
}

function getExpectedShardCount(run) {
  const value = Number(run.input?.shardCount);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_SHARD_COUNT;
}

function getBrowsers(run, workItems) {
  const browserSet = new Set();
  for (const browser of Array.isArray(run.input?.browsers) ? run.input.browsers : []) {
    if (browser && browser !== 'none') browserSet.add(browser);
  }
  for (const workItem of workItems) {
    if (workItem.browser && workItem.browser !== 'none') browserSet.add(workItem.browser);
  }
  if (browserSet.size === 0) {
    for (const browser of DEFAULT_BROWSERS) browserSet.add(browser);
  }
  return [...browserSet].sort(
    (left, right) => browserSortIndex(left) - browserSortIndex(right) || left.localeCompare(right),
  );
}

function findFirstFailedWorkItem(workItems) {
  return [...workItems].filter((workItem) => workItem.status === 'failed').sort(compareWorkItemsByTarget)[0] ?? null;
}

function findLatestPhase(events) {
  for (const event of [...events].sort(compareEventsDescending)) {
    const phase = readEventPhase(event);
    if (!phase) continue;
    if (phase === 'behavior.playwright.running' || phase === 'behavior.runner.claimed') continue;
    return phase;
  }
  return null;
}

function selectRecentEvents(events) {
  return [...events]
    .sort(compareEventsDescending)
    .filter((event) => {
      if (event.eventType === 'run.created' || event.eventType === 'run.reused') return false;
      if (event.message === 'Automation execution is running.') return false;
      const phase = readEventPhase(event);
      return phase !== 'behavior.playwright.running' && phase !== 'behavior.runner.claimed';
    })
    .slice(0, MAX_RECENT_EVENTS)
    .reverse();
}

function describeCurrentState(run, summary) {
  if (run.status === 'succeeded') return 'All behavior shards passed.';
  if (run.status === 'failed') return run.errorMessage ?? run.statusMessage ?? 'Behavior tests failed.';
  if (run.status === 'cancelled') return 'Run was cancelled.';
  if (run.status === 'action_required') return run.statusMessage ?? 'Run needs manual action.';
  if (run.status === 'superseded') return 'Run was superseded by a newer request.';
  if (summary.latestPhase) return describePhase(summary.latestPhase, summary);
  if (summary.counts.running > 0) return `Running Playwright on ${summary.counts.running} shard(s).`;
  if (summary.counts.queued > 0 && summary.terminalTotal === 0) return 'Waiting for Labs to start behavior shards.';
  if (summary.terminalTotal > 0) return 'Collecting remaining shard results.';
  return run.statusMessage ?? `Run is ${run.status}.`;
}

function describePhase(phase, summary) {
  switch (phase) {
    case 'behavior.renderer.preparing':
      return 'Preparing renderer artifact on a runner.';
    case 'behavior.renderer.ready':
      return 'Renderer artifact is ready.';
    case 'behavior.shard.starting':
      return 'Starting behavior shard tasks.';
    case 'behavior.playwright.starting':
      return 'Launching Playwright in cloud runners.';
    case 'behavior.playwright.completed':
      return 'Playwright finished; collecting shard results.';
    case 'behavior.artifacts.uploading':
      return 'Uploading traces, screenshots, logs, and manifests.';
    case 'behavior.artifacts.uploaded':
      return 'Artifacts uploaded; finalizing shard results.';
    case 'behavior.shard.completed':
      return 'Shard completed; waiting for the remaining shards.';
    case 'behavior.shard.failed':
      return 'A shard failed; collecting failure details.';
    default:
      if (summary.counts.running > 0) return `Running Playwright on ${summary.counts.running} shard(s).`;
      return phase.replace(/^behavior\./u, '').replaceAll('.', ' ');
  }
}

function formatField(label, value, palette) {
  return `${palette.dim(label.padEnd(9))} ${value}`;
}

function formatProgress(summary, palette) {
  const ratio = summary.expectedTotal > 0 ? summary.terminalTotal / summary.expectedTotal : 0;
  const filledWidth = Math.max(0, Math.min(PROGRESS_BAR_WIDTH, Math.round(ratio * PROGRESS_BAR_WIDTH)));
  const bar = `${'#'.repeat(filledWidth)}${'-'.repeat(PROGRESS_BAR_WIDTH - filledWidth)}`;
  return `${palette.cyan(`[${bar}]`)} ${summary.terminalTotal}/${summary.expectedTotal}`;
}

function formatCounts(counts, palette) {
  return [
    palette.green(`${counts.succeeded} passed`),
    palette.red(`${counts.failed} failed`),
    palette.yellow(`${counts.skipped} skipped`),
    palette.dim(`${counts.superseded} superseded`),
    palette.cyan(`${counts.running} running`),
    `${counts.queued} queued`,
  ].join('  ');
}

function formatBrowserSummary(summary, palette) {
  return `${summary.browser.padEnd(8)} ${formatCounts(summary.counts, palette)}`;
}

function formatBrowserList(run, workItems) {
  return getBrowsers(run, workItems).join(', ');
}

function formatShardPlan(run, expectedTotal) {
  const browsers = getBrowsers(run, []);
  const shardCount = getExpectedShardCount(run);
  return `${browsers.length} browser(s) x ${shardCount} shard(s) = ${expectedTotal}`;
}

function formatRunElapsed(run, now) {
  const started = Date.parse(run.startedAt ?? run.createdAt ?? now.toISOString());
  const ended = run.completedAt ? Date.parse(run.completedAt) : now.getTime();
  return formatDuration(ended - started);
}

function formatPackageSource(packageSource) {
  if (packageSource.kind === 'npm_version') {
    return `${packageSource.packageName}@${packageSource.version}`;
  }
  if (packageSource.kind === 'uploaded_tarball') {
    return `${packageSource.artifactKey} (${packageSource.sha256?.slice(0, 12) ?? 'sha unknown'})`;
  }
  return packageSource.kind ?? 'unknown';
}

function formatEvent(event, palette) {
  const time = event.createdAt ? formatClock(new Date(event.createdAt)) : '--:--:--';
  return `${palette.dim(time)}  ${event.message ?? event.eventType}`;
}

function formatFailure(workItem, palette, width) {
  const lines = [formatField('Shard', `${workItem.browser} shard ${workItem.shard}/${workItem.shardCount}`, palette)];
  if (workItem.errorCode) lines.push(formatField('Code', workItem.errorCode, palette));
  if (workItem.errorMessage || workItem.statusMessage) {
    lines.push(formatField('Reason', workItem.errorMessage ?? workItem.statusMessage, palette));
  }
  if (workItem.artifactManifestKey) {
    const artifact = workItem.artifactBucket
      ? `${workItem.artifactBucket}/${workItem.artifactManifestKey}`
      : workItem.artifactManifestKey;
    lines.push(formatField('Manifest', artifact, palette));
  } else if (workItem.artifactPrefix) {
    lines.push(formatField('Artifacts', workItem.artifactPrefix, palette));
  }
  if (workItem.logExcerpt) {
    lines.push(formatField('Log', '', palette).trimEnd());
    for (const line of normalizeOutputLines(workItem.logExcerpt).slice(0, MAX_FAILURE_LOG_LINES)) {
      lines.push(truncateVisible(`  ${line}`, width));
    }
  }
  return lines;
}

function formatShardDetails(workItems, palette, width) {
  return [...workItems].sort(compareWorkItemsByTarget).map((workItem) => {
    const name = `${workItem.browser} ${workItem.shard}/${workItem.shardCount}`.padEnd(18);
    const status = formatWorkItemStatus(workItem.status, palette).padEnd(workItem.status.length + 8);
    const duration = formatWorkItemDuration(workItem).padStart(8);
    const detail = workItem.errorMessage ?? workItem.statusMessage ?? '';
    return truncateVisible(`${name} ${status} ${duration}  ${detail}`, width);
  });
}

function formatRunStatus(status, palette) {
  switch (status) {
    case 'succeeded':
      return palette.green('passed');
    case 'failed':
    case 'action_required':
    case 'cancelled':
      return palette.red(status.replaceAll('_', ' '));
    case 'running':
      return palette.cyan('running');
    case 'queued':
      return palette.yellow('queued');
    case 'superseded':
      return palette.dim('superseded');
    default:
      return status;
  }
}

function formatWorkItemStatus(status, palette) {
  switch (status) {
    case 'succeeded':
      return palette.green('passed');
    case 'failed':
      return palette.red('failed');
    case 'running':
      return palette.cyan('running');
    case 'queued':
      return palette.yellow('queued');
    case 'skipped':
      return palette.yellow('skipped');
    case 'superseded':
      return palette.dim('superseded');
    default:
      return status;
  }
}

function formatWorkItemDuration(workItem) {
  if (typeof workItem.durationMs === 'number') {
    return formatDuration(workItem.durationMs);
  }
  if (workItem.startedAt && workItem.completedAt) {
    return formatDuration(Date.parse(workItem.completedAt) - Date.parse(workItem.startedAt));
  }
  return '';
}

function readEventPhase(event) {
  const data = event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data : {};
  return typeof data.phase === 'string' ? data.phase : null;
}

function compareEventsDescending(left, right) {
  return (
    String(right.createdAt).localeCompare(String(left.createdAt)) ||
    String(right.eventId).localeCompare(String(left.eventId))
  );
}

function compareWorkItemsByTarget(left, right) {
  return (
    browserSortIndex(left.browser) - browserSortIndex(right.browser) ||
    Number(left.shard) - Number(right.shard) ||
    Number(left.shardCount) - Number(right.shardCount)
  );
}

function browserSortIndex(browser) {
  const index = DEFAULT_BROWSERS.indexOf(browser);
  return index === -1 ? DEFAULT_BROWSERS.length : index;
}

function parseArgs(args) {
  const options = {
    browsers: [],
    failFast: true,
    grep: undefined,
    help: false,
    intervalSeconds: DEFAULT_POLL_INTERVAL_SECONDS,
    json: false,
    npmVersion: undefined,
    pr: undefined,
    screenshots: false,
    shardCount: DEFAULT_SHARD_COUNT,
    timeoutMinutes: 60,
    timeoutSeconds: 60 * 60 * 3,
    trace: false,
    verbose: false,
    wait: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const rawArg = args[index];
    const { name, value } = splitOption(rawArg);

    switch (name) {
      case '-h':
      case '--help':
        rejectInlineValue(name, value);
        options.help = true;
        break;
      case '--browser':
      case '--project':
        options.browsers.push(readOptionValue(args, index + 1, name, value));
        if (value === undefined) index += 1;
        break;
      case '--grep':
        options.grep = readOptionValue(args, index + 1, name, value);
        if (value === undefined) index += 1;
        break;
      case '--interval':
        options.intervalSeconds = parsePositiveInteger(readOptionValue(args, index + 1, name, value), name);
        if (value === undefined) index += 1;
        break;
      case '--json':
        rejectInlineValue(name, value);
        options.json = true;
        break;
      case '--no-fail-fast':
        rejectInlineValue(name, value);
        options.failFast = false;
        break;
      case '--no-wait':
        rejectInlineValue(name, value);
        options.wait = false;
        break;
      case '--npm-version':
        options.npmVersion = readOptionValue(args, index + 1, name, value);
        if (value === undefined) index += 1;
        break;
      case '--pr':
        options.pr = parsePositiveInteger(readOptionValue(args, index + 1, name, value), name);
        if (value === undefined) index += 1;
        break;
      case '--screenshots':
        rejectInlineValue(name, value);
        options.screenshots = true;
        break;
      case '--shard-count':
        options.shardCount = parsePositiveInteger(readOptionValue(args, index + 1, name, value), name);
        if (value === undefined) index += 1;
        break;
      case '--timeout':
        options.timeoutSeconds = parsePositiveInteger(readOptionValue(args, index + 1, name, value), name);
        if (value === undefined) index += 1;
        break;
      case '--timeout-minutes':
        options.timeoutMinutes = parsePositiveInteger(readOptionValue(args, index + 1, name, value), name);
        if (value === undefined) index += 1;
        break;
      case '--trace':
        rejectInlineValue(name, value);
        options.trace = true;
        break;
      case '--verbose':
        rejectInlineValue(name, value);
        options.verbose = true;
        break;
      default:
        throw new Error(`Unknown option: ${rawArg}`);
    }
  }

  options.browsers = normalizeBrowsers(options.browsers);
  return options;
}

function splitOption(rawArg) {
  const separatorIndex = rawArg.indexOf('=');
  if (separatorIndex === -1) {
    return { name: rawArg, value: undefined };
  }
  return {
    name: rawArg.slice(0, separatorIndex),
    value: rawArg.slice(separatorIndex + 1),
  };
}

function readOptionValue(args, index, name, inlineValue) {
  if (inlineValue !== undefined) {
    return inlineValue;
  }
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function rejectInlineValue(name, inlineValue) {
  if (inlineValue !== undefined) {
    throw new Error(`${name} does not accept a value.`);
  }
}

function normalizeBrowsers(values) {
  const browsers = values.length ? values : DEFAULT_BROWSERS;
  return browsers.map((value) => {
    const normalized = value.toLowerCase();
    if (DEFAULT_BROWSERS.includes(normalized)) {
      return normalized;
    }
    throw new Error(`Invalid browser "${value}". Use chromium, firefox, or webkit.`);
  });
}

function readCloudflareBearerToken() {
  if (process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    return process.env.CLOUDFLARE_API_TOKEN.trim();
  }

  const token = readWranglerOauthToken();
  if (token) {
    return token;
  }

  throw new Error(AUTHENTICATION_HELP_MESSAGE);
}

function readWranglerOauthToken() {
  for (const configPath of wranglerConfigCandidates()) {
    if (!fs.existsSync(configPath)) {
      continue;
    }

    const configText = fs.readFileSync(configPath, 'utf8');
    const token = /^oauth_token\s*=\s*"(?<token>[^"]+)"/m.exec(configText)?.groups?.token;
    if (token?.trim()) {
      return token.trim();
    }
  }

  return null;
}

function wranglerConfigCandidates() {
  const home = os.homedir();
  return [
    ...(process.env.XDG_CONFIG_HOME
      ? [path.join(process.env.XDG_CONFIG_HOME, '.wrangler', 'config', 'default.toml')]
      : []),
    ...(process.env.APPDATA ? [path.join(process.env.APPDATA, '.wrangler', 'config', 'default.toml')] : []),
    path.join(home, 'Library', 'Preferences', '.wrangler', 'config', 'default.toml'),
    path.join(home, '.config', '.wrangler', 'config', 'default.toml'),
    path.join(home, '.wrangler', 'config', 'default.toml'),
  ];
}

async function labsApiFetch(apiUrl, pathName, token, init) {
  const response = await fetch(`${apiUrl.replace(/\/+$/, '')}${pathName}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
  });
  const responseBody = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(responseBody) ?? `Labs API returned ${response.status}.`);
  }
  return responseBody;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(responseBody) {
  if (
    responseBody &&
    typeof responseBody === 'object' &&
    !Array.isArray(responseBody) &&
    responseBody.error &&
    typeof responseBody.error === 'object' &&
    typeof responseBody.error.message === 'string'
  ) {
    return responseBody.error.message;
  }
  if (typeof responseBody === 'string' && responseBody.trim()) {
    return responseBody.trim();
  }
  return null;
}

function resolveApiUrl() {
  const configuredApiUrl = process.env.SUPERDOC_LABS_API_URL || process.env.LABS_API_URL;
  const rawApiUrl = configuredApiUrl || DEFAULT_API_URL;
  const normalizedApiUrl = rawApiUrl.trim().replace(/\/+$/, '');
  let parsedApiUrl;

  try {
    parsedApiUrl = new URL(normalizedApiUrl);
  } catch {
    throw new Error(`Invalid Labs API URL: ${rawApiUrl}`);
  }

  if (!configuredApiUrl) {
    return normalizedApiUrl;
  }

  const isOfficialLabsHost = parsedApiUrl.protocol === 'https:' && OFFICIAL_LABS_API_HOSTS.has(parsedApiUrl.hostname);
  if (isOfficialLabsHost) {
    return normalizedApiUrl;
  }

  const isLocalApiHost = LOCAL_API_HOSTS.has(parsedApiUrl.hostname) || parsedApiUrl.hostname.endsWith('.localhost');
  if (isLocalApiHost && isCustomApiUrlOptedIn()) {
    return normalizedApiUrl;
  }

  if (!isCustomApiUrlOptedIn()) {
    throw new Error(
      `Custom Labs API URLs require ${CUSTOM_API_URL_OPT_IN_ENV}=1. ` +
        'This prevents Cloudflare bearer tokens from being sent to unexpected hosts.',
    );
  }

  throw new Error(
    `Refusing to send Labs auth to ${parsedApiUrl.hostname}. ` +
      'Use the production Labs API, an official Labs host, or an opted-in localhost URL.',
  );
}

function isCustomApiUrlOptedIn() {
  return ['1', 'true', 'yes'].includes(
    String(process.env[CUSTOM_API_URL_OPT_IN_ENV] ?? '')
      .trim()
      .toLowerCase(),
  );
}

function parsePositiveInteger(value, optionName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} expects a positive integer, received "${value}".`);
  }
  return parsed;
}

function stripPnpmSeparator(args) {
  return args[0] === '--' ? args.slice(1) : args;
}

function normalizeOutputLines(value) {
  return String(value ?? '')
    .split(/\r\n|\n|\r/u)
    .map((line) => stripAnsi(line).replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

function stripAnsi(value) {
  return String(value ?? '').replace(ANSI_ESCAPE_PATTERN, '');
}

function truncateVisible(value, width) {
  const visible = stripAnsi(value);
  if (visible.length <= width) {
    return value;
  }
  if (width <= 3) {
    return visible.slice(0, width);
  }
  return `${visible.slice(0, width - 3)}...`;
}

function formatClock(date) {
  return [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':');
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return 'unknown';
  }
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return 'unknown';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(kib < 10 ? 1 : 0)} KiB`;
  }
  const mib = kib / 1024;
  return `${mib.toFixed(mib < 10 ? 1 : 0)} MiB`;
}

function formatCommand(command) {
  return command.map(shellQuote).join(' ');
}

function shellQuote(value) {
  if (/^[a-zA-Z0-9_./:@=-]+$/u.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function isInteractiveOutput() {
  return Boolean(
    process.stdout.isTTY && process.stdout.clearLine && process.stdout.cursorTo && process.stdout.moveCursor,
  );
}

function supportsColor() {
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') {
    return true;
  }
  return Boolean(process.stdout.isTTY);
}

function createPalette(enabled) {
  const wrap = (open, close) => (value) => (enabled ? `\x1B[${open}m${value}\x1B[${close}m` : String(value));
  return {
    bold: wrap(1, 22),
    cyan: wrap(36, 39),
    dim: wrap(2, 22),
    green: wrap(32, 39),
    red: wrap(31, 39),
    yellow: wrap(33, 39),
  };
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function printHelp() {
  console.log(`Usage: pnpm test:behavior -- [options]

Build the SuperDoc package locally, upload the package artifact to Labs, and run
the cloud behavior tests against that exact artifact.

With no flags, this command uses the production Labs API, uploads the local
SuperDoc package tarball, queues a Labs renderer build for the harness, runs
all browser projects with ${DEFAULT_SHARD_COUNT} shards each, waits for completion, and streams
a compact progress view.

Authentication:
  Set CLOUDFLARE_API_TOKEN to a Cloudflare user API token, or run npx
  wrangler login before using this command.
  Custom localhost API URLs require ${CUSTOM_API_URL_OPT_IN_ENV}=1; arbitrary
  hosts are rejected so bearer tokens are not sent outside Labs.

Options:
  --npm-version <version>      Run behavior tests against a published npm version instead of a local package
  --browser <browser>          Browser project to run; repeatable
  --project <browser>          Alias for --browser
  --grep <pattern>             Playwright grep pattern
  --pr <number>                Pull request number for run metadata
  --shard-count <count>        Cloud shard count (default: ${DEFAULT_SHARD_COUNT})
  --timeout-minutes <minutes>  Per-shard timeout minutes (default: 60)
  --trace                      Collect Playwright traces in cloud artifacts
  --screenshots                Collect Playwright screenshots in cloud artifacts
  --no-fail-fast               Continue queued shards after a shard fails
  --no-wait                    Create the run and return immediately
  --interval <seconds>         Polling interval while waiting (default: ${DEFAULT_POLL_INTERVAL_SECONDS})
  --timeout <seconds>          Maximum wait duration (default: 10800)
  --verbose                    Show detailed shard rows while waiting
  --json                       Print raw JSON create response
  -h, --help                   Display help`);
}
