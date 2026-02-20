/**
 * Run visual comparisons.
 *
 * Usage:
 *   pnpm compare
 *   pnpm compare 1.4.0
 *   pnpm compare 1.4.0 --target 1.5.0-next.5
 *   pnpm compare 1.4.0 --target 1.5.0-next.5 --compare-baselines
 *   pnpm compare --filter layout
 *   pnpm compare --exclude samples
 *   pnpm compare --match sd-1401
 */

import fs from 'node:fs';
import path from 'node:path';
import { colors } from './terminal.js';
import { getSuperdocVersion } from './generate-refs.js';
import {
  isPathLikeVersion,
  normalizeVersionLabel,
  normalizeVersionSpecifier,
  parseVersionInput,
} from './version-utils.js';
import { findMissingDocuments } from './compare.js';
import { resolveBrowserNames, resolveBaselineFolderForBrowser, type BrowserName } from './browser-utils.js';
import { runCommand, isPortOpen, HARNESS_PORT, HARNESS_URL } from './harness-utils.js';
import { ensureBaselineDownloaded, getLatestBaselineVersion, refreshBaselineSubset } from './r2-baselines.js';
import {
  buildStorageArgs,
  findLatestBaselineLocal,
  getBaselineLocalRoot as getBaselineLocalRootForMode,
  parseStorageFlags,
  resolveDocsDir,
  type StorageMode,
} from './storage-flags.js';

const BASELINES_DIR = 'baselines';
const SCREENSHOTS_DIR = 'screenshots';

interface CompareAllArgs {
  baselineVersion?: string;
  targetVersion?: string;
  threshold?: number;
  filters: string[];
  matches: string[];
  excludes: string[];
  folder?: string;
  output?: string;
  includeWord?: boolean;
  compareBaselines?: boolean;
  browsers: BrowserName[];
  browserArg?: string;
  scaleFactor: number;
  refreshBaselines: boolean;
  mode: StorageMode;
  docsDir?: string;
}

function parseArgs(): CompareAllArgs {
  const args = process.argv.slice(2);
  let baselineVersion: string | undefined;
  let targetVersion: string | undefined;
  let threshold: number | undefined;
  const filters: string[] = [];
  const matches: string[] = [];
  const excludes: string[] = [];
  let folder: string | undefined;
  let output: string | undefined;
  let includeWord = false;
  let compareBaselines = false;
  let browserArg: string | undefined;
  let scaleFactor = 1.5;
  let refreshBaselines = false;
  const storage = parseStorageFlags(args);
  const docsDir = resolveDocsDir(storage.mode, storage.docsDir);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--target' && args[i + 1]) {
      targetVersion = args[i + 1];
      i++;
    } else if (arg === '--threshold' && args[i + 1]) {
      threshold = Number.parseFloat(args[i + 1]);
      i++;
    } else if (arg === '--filter' && args[i + 1]) {
      const rawFilter = args[i + 1].trim();
      if (rawFilter) {
        filters.push(rawFilter);
      }
      i++;
    } else if (arg === '--match' && args[i + 1]) {
      const rawMatch = args[i + 1].trim();
      if (rawMatch) {
        matches.push(rawMatch);
      }
      i++;
    } else if (arg === '--exclude' && args[i + 1]) {
      const rawExclude = args[i + 1].trim();
      if (rawExclude) {
        excludes.push(rawExclude);
      }
      i++;
    } else if (arg === '--folder' && args[i + 1]) {
      folder = args[i + 1];
      i++;
    } else if (arg === '--output' && args[i + 1]) {
      output = args[i + 1];
      i++;
    } else if (arg === '--scale-factor' && args[i + 1]) {
      const raw = Number.parseFloat(args[i + 1]);
      if (Number.isFinite(raw) && raw > 0) {
        scaleFactor = raw;
      } else {
        console.warn(colors.warning(`⚠ Invalid --scale-factor "${args[i + 1]}"; using default 1.5.`));
      }
      i++;
    } else if (arg === '--include-word') {
      includeWord = true;
    } else if (arg === '--compare-baselines') {
      compareBaselines = true;
    } else if (arg === '--browser' && args[i + 1]) {
      browserArg = args[i + 1];
      i++;
    } else if (arg === '--refresh-baselines') {
      refreshBaselines = true;
    } else if (arg === '--docs' && args[i + 1]) {
      i++;
    } else if (!arg.startsWith('--') && !baselineVersion) {
      baselineVersion = arg;
    }
  }

  const browsers = resolveBrowserNames(browserArg);

  return {
    baselineVersion,
    targetVersion,
    threshold,
    filters,
    matches,
    excludes,
    folder,
    output,
    includeWord,
    compareBaselines,
    browsers,
    browserArg,
    scaleFactor,
    refreshBaselines,
    mode: storage.mode,
    docsDir,
  };
}

async function resolveBaselineSelection(
  mode: StorageMode,
  baselineRoot: string,
  baselineVersion?: string,
): Promise<{ label: string; spec: string } | null> {
  if (baselineVersion) {
    if (isPathLikeVersion(baselineVersion)) {
      throw new Error('Path baselines are not supported. Use a version label like 1.4.0.');
    }
    const info = parseVersionInput(baselineVersion);
    return { label: info.label, spec: info.spec };
  }

  const latest =
    mode === 'local' ? findLatestBaselineLocal(baselineRoot) : await getLatestBaselineVersion(BASELINES_DIR);
  if (!latest) {
    return null;
  }
  return { label: latest, spec: normalizeVersionSpecifier(latest) };
}

async function runVersionSwitch(version: string): Promise<void> {
  await runCommand(['exec', 'tsx', 'scripts/set-superdoc-version.ts', version]);
}

async function runGenerateVisualResults(
  outputFolder: string,
  filters: string[],
  matches: string[],
  excludes: string[],
  browser: BrowserName,
  scaleFactor: number,
  storageArgs: string[],
): Promise<void> {
  const args = ['exec', 'tsx', 'scripts/generate-refs.ts', '--output', outputFolder];
  for (const filter of filters) {
    args.push('--filter', filter);
  }
  for (const match of matches) {
    args.push('--match', match);
  }
  for (const exclude of excludes) {
    args.push('--exclude', exclude);
  }
  if (scaleFactor !== 1) {
    args.push('--scale-factor', String(scaleFactor));
  }
  args.push('--browser', browser);
  if (storageArgs.length > 0) {
    args.push(...storageArgs);
  }
  await runCommand(args);
}

async function runGenerateVisualResultsForDocs(
  outputFolder: string,
  docs: string[],
  excludes: string[],
  browser: BrowserName,
  scaleFactor: number,
  storageArgs: string[],
): Promise<void> {
  const args = ['exec', 'tsx', 'scripts/generate-refs.ts', '--output', outputFolder];
  args.push('--append');
  for (const doc of docs) {
    args.push('--doc', doc);
  }
  for (const exclude of excludes) {
    args.push('--exclude', exclude);
  }
  if (scaleFactor !== 1) {
    args.push('--scale-factor', String(scaleFactor));
  }
  args.push('--browser', browser);
  if (storageArgs.length > 0) {
    args.push(...storageArgs);
  }
  await runCommand(args);
}

async function runBaselineLocal(options: {
  versionSpec?: string;
  filters: string[];
  matches: string[];
  excludes: string[];
  browserArg?: string;
  scaleFactor: number;
  storageArgs: string[];
}): Promise<void> {
  const args = ['exec', 'tsx', 'scripts/baseline-visual.ts'];
  if (options.versionSpec) {
    args.push(options.versionSpec);
  }
  for (const filter of options.filters) {
    args.push('--filter', filter);
  }
  for (const match of options.matches) {
    args.push('--match', match);
  }
  for (const exclude of options.excludes) {
    args.push('--exclude', exclude);
  }
  if (options.scaleFactor !== 1) {
    args.push('--scale-factor', String(options.scaleFactor));
  }
  if (options.browserArg) {
    args.push('--browser', options.browserArg);
  }
  if (options.storageArgs.length > 0) {
    args.push(...options.storageArgs);
  }
  await runCommand(args);
}

async function fillMissingVisualDocs(
  resultsFolderName: string,
  baselineFolder: string,
  filters: string[],
  matches: string[],
  excludes: string[],
  browser: BrowserName,
  scaleFactor: number,
  providerOptions: { mode: StorageMode; docsDir?: string },
  storageArgs: string[],
): Promise<void> {
  const resultsFolder = path.join(SCREENSHOTS_DIR, resultsFolderName, browser);
  const { missingDocs, unknownKeys } = await findMissingDocuments(
    baselineFolder,
    resultsFolder,
    filters,
    matches,
    excludes,
    providerOptions,
  );

  if (unknownKeys.length > 0) {
    console.warn(colors.warning(`Warning: baseline docs not found in corpus: ${unknownKeys.join(', ')}`));
  }

  if (missingDocs.length > 0) {
    console.log(colors.muted(`Filling ${missingDocs.length} missing doc(s)...`));
    await runGenerateVisualResultsForDocs(resultsFolderName, missingDocs, excludes, browser, scaleFactor, storageArgs);
  }
}

async function runCompareVisual(
  resultsFolder: string,
  baselineVersion: string,
  threshold?: number,
  filters: string[] = [],
  matches: string[] = [],
  excludes: string[] = [],
  includeWord?: boolean,
  browser?: BrowserName,
  baselineRoot?: string,
  storageArgs: string[] = [],
): Promise<void> {
  const args = ['exec', 'tsx', 'scripts/compare.ts', baselineVersion, '--folder', resultsFolder];
  if (baselineRoot) {
    args.push('--baseline-root', baselineRoot);
  }
  for (const filter of filters) {
    args.push('--filter', filter);
  }
  for (const match of matches) {
    args.push('--match', match);
  }
  for (const exclude of excludes) {
    args.push('--exclude', exclude);
  }
  if (typeof threshold === 'number' && !Number.isNaN(threshold) && threshold > 0) {
    args.push('--threshold', String(threshold));
  }
  if (includeWord) {
    args.push('--include-word');
  }
  if (browser) {
    args.push('--browser', browser);
  }
  if (storageArgs.length > 0) {
    args.push(...storageArgs);
  }
  await runCommand(args);
}

async function runCompareBaselineToBaselineVisual(
  baselineVersion: string,
  targetVersion: string,
  threshold?: number,
  filters: string[] = [],
  matches: string[] = [],
  excludes: string[] = [],
  includeWord?: boolean,
  browser?: BrowserName,
  baselineRoot?: string,
  storageArgs: string[] = [],
): Promise<void> {
  const args = ['exec', 'tsx', 'scripts/compare.ts', baselineVersion, '--folder', targetVersion];
  if (baselineRoot) {
    args.push('--baseline-root', baselineRoot);
    args.push('--results-root', baselineRoot);
  }
  for (const filter of filters) {
    args.push('--filter', filter);
  }
  for (const match of matches) {
    args.push('--match', match);
  }
  for (const exclude of excludes) {
    args.push('--exclude', exclude);
  }
  if (typeof threshold === 'number' && !Number.isNaN(threshold) && threshold > 0) {
    args.push('--threshold', String(threshold));
  }
  if (includeWord) {
    args.push('--include-word');
  }
  if (browser) {
    args.push('--browser', browser);
  }
  if (storageArgs.length > 0) {
    args.push(...storageArgs);
  }
  await runCommand(args);
}

async function main(): Promise<void> {
  const passThrough = process.argv.slice(2);
  const hasTarget = passThrough.includes('--target');
  if (!hasTarget) {
    await runCommand(['exec', 'tsx', 'scripts/compare.ts', ...passThrough]);
    return;
  }

  const {
    baselineVersion,
    targetVersion,
    threshold,
    filters,
    matches,
    excludes,
    folder,
    output,
    includeWord,
    compareBaselines,
    browsers,
    browserArg,
    scaleFactor,
    refreshBaselines,
    mode,
    docsDir,
  } = parseArgs();
  const storageArgs = buildStorageArgs(mode, docsDir);

  if (!targetVersion) {
    console.error(colors.error('Missing --target value.'));
    process.exit(1);
  }

  if (compareBaselines && isPathLikeVersion(targetVersion)) {
    console.error(colors.error('Baseline comparison requires a version label for --target (not a path).'));
    process.exit(1);
  }

  if (folder || output) {
    console.error(colors.error('Cannot use --target with --folder or --output.'));
    process.exit(1);
  }

  const baselineDir = getBaselineLocalRootForMode(mode, BASELINES_DIR);
  let baselineSelection = await resolveBaselineSelection(mode, baselineDir, baselineVersion);
  if (!baselineSelection && mode === 'local') {
    const current = getSuperdocVersion();
    baselineSelection = {
      label: normalizeVersionLabel(current),
      spec: normalizeVersionSpecifier(current),
    };
  }
  const baselineToUse = baselineSelection?.label ?? null;

  if (!baselineToUse) {
    if (mode === 'local') {
      console.error(
        colors.error(`No baselines found in ${baselineDir}. Run "pnpm baseline --local --docs <path>" first.`),
      );
    } else {
      console.error(colors.error('No baselines found in R2. Run "pnpm baseline" first.'));
    }
    process.exit(1);
  }

  const ensureVisualBaseline = async (version: string, versionSpec?: string, force: boolean = false): Promise<void> => {
    if (mode === 'local') {
      const baselinePath = path.join(baselineDir, version);
      if (!fs.existsSync(baselinePath)) {
        console.log(colors.info(`📸 Visual baseline ${version} not found locally. Generating...`));
        const browserArg = browsers.length > 0 ? browsers.join(',') : undefined;
        await runBaselineLocal({
          versionSpec,
          filters,
          matches,
          excludes,
          browserArg,
          scaleFactor,
          storageArgs,
        });
      }
      if (!fs.existsSync(baselinePath)) {
        throw new Error(`No baseline found for version ${version} in ${baselineDir}.`);
      }
      console.log(colors.success(`✓ Visual baselines: ${version} ${colors.muted('(local)')}`));
      return;
    }
    const hasFilters = filters.length > 0 || matches.length > 0 || excludes.length > 0;
    const browserFilters = browserArg ? browsers : undefined;
    if (refreshBaselines) {
      if (hasFilters || browserFilters) {
        const refreshed = await refreshBaselineSubset({
          prefix: BASELINES_DIR,
          version,
          localRoot: baselineDir,
          filters,
          matches,
          excludes,
          browsers: browserFilters,
        });
        if (refreshed.matched === 0) {
          console.warn(colors.warning('No visual baseline files matched the filters to refresh.'));
        } else {
          console.log(
            colors.success(
              `↻ Refreshed ${refreshed.downloaded} visual baseline file(s) for ${version} ${colors.muted('(R2)')}`,
            ),
          );
        }
        return;
      }
      force = true;
    }
    const result = await ensureBaselineDownloaded({
      prefix: BASELINES_DIR,
      version,
      localRoot: baselineDir,
      force,
    });
    if (!result.fromCache) {
      console.log(
        colors.success(`✓ Visual baselines: ${version} ${colors.muted(`(downloaded ${result.downloaded} files)`)}`),
      );
    } else {
      console.log(colors.success(`✓ Visual baselines: ${version} ${colors.muted('(cached)')}`));
    }
  };

  if (compareBaselines) {
    const targetInfo = parseVersionInput(targetVersion);
    const targetLabel = targetInfo.label;

    await ensureVisualBaseline(baselineToUse, baselineVersion ? baselineSelection?.spec : undefined);
    await ensureVisualBaseline(targetLabel, normalizeVersionSpecifier(targetLabel));

    console.log('');
    console.log(colors.header('━━━ 📊 BASELINE COMPARISON ━━━'));
    console.log(colors.muted(`Baseline: ${baselineToUse} → Target: ${targetLabel}`));
    console.log('');

    for (const browser of browsers) {
      console.log(colors.muted(`Browser: ${browser}`));

      console.log(colors.header('━━━ 🖼️  VISUAL DIFF ━━━'));
      await runCompareBaselineToBaselineVisual(
        baselineToUse,
        targetLabel,
        threshold,
        filters,
        matches,
        excludes,
        includeWord,
        browser,
        baselineDir,
        storageArgs,
      );
      console.log('');
    }
    return;
  }

  if (await isPortOpen(HARNESS_PORT)) {
    console.error(colors.error(`Harness is already running at ${HARNESS_URL}. Stop it before using --target.`));
    process.exit(1);
  }

  const targetInfo = parseVersionInput(targetVersion);
  const targetLabel = targetInfo.label;
  const targetSpec = targetInfo.spec;

  console.log(colors.muted(`Switching to ${targetSpec}...`));
  await runVersionSwitch(targetSpec);
  console.log(colors.muted(`Generating visual results: ${targetLabel}`));
  for (const browser of browsers) {
    await runGenerateVisualResults(targetLabel, filters, matches, excludes, browser, scaleFactor, storageArgs);
  }
  await ensureVisualBaseline(baselineToUse, baselineVersion ? baselineSelection?.spec : undefined);
  for (const browser of browsers) {
    const baselineFolderForBrowser = resolveBaselineFolderForBrowser(path.join(baselineDir, baselineToUse), browser);
    await fillMissingVisualDocs(
      targetLabel,
      baselineFolderForBrowser,
      filters,
      matches,
      excludes,
      browser,
      scaleFactor,
      { mode, docsDir },
      storageArgs,
    );
  }

  console.log('');
  console.log(colors.header('━━━ 🖼️  VISUAL DIFF ━━━'));
  for (const browser of browsers) {
    if (browsers.length > 1) console.log(colors.muted(`Browser: ${browser}`));
    await runCompareVisual(
      targetLabel,
      baselineToUse,
      threshold,
      filters,
      matches,
      excludes,
      includeWord,
      browser,
      baselineDir,
      storageArgs,
    );
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(colors.error(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
