/**
 * One-shot screenshot capture for a single .docx, mirroring layout:export-one.
 *
 * Boots the visual harness vite server, drives chromium directly (no test
 * runner), writes one PNG per rendered page plus a metadata.json alongside.
 * A generic primitive for downstream evaluation tooling that compares
 * SuperDoc page images against external references.
 */
import { chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const VISUAL_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(VISUAL_ROOT, '..', '..');
const SUPERDOC_DIST = path.join(REPO_ROOT, 'packages', 'superdoc', 'dist');
const HARNESS_PORT = 9989;
const HARNESS_URL = `http://localhost:${HARNESS_PORT}`;
const VITE_BOOT_TIMEOUT_MS = 30_000;
const DEFAULT_PIPELINE: Pipeline = 'presentation';
const DEFAULT_TIMEOUT_MS = 30_000;
const STABILIZE_MS = 1000;

type Pipeline = 'headless' | 'presentation';

interface Args {
  inputPath: string;
  outputDir: string;
  pipeline: Pipeline;
  timeoutMs: number;
}

function printHelp(): void {
  console.log(
    [
      'Usage:',
      '  pnpm layout:screenshot-one -- --input <path> --output <dir> [options]',
      '',
      'Options:',
      '  --input <path>      Absolute or relative path to a single .docx file',
      '  --output <dir>      Output directory for page-NNN.png + metadata.json',
      `  --pipeline <mode>   Layout pipeline: headless | presentation (default: ${DEFAULT_PIPELINE})`,
      `  --timeout-ms <ms>   Per-document load timeout (default: ${DEFAULT_TIMEOUT_MS})`,
      '  -h, --help          Show this help',
      '',
      'Output:',
      '  <output>/page-001.png',
      '  <output>/page-002.png',
      '  ...',
      '  <output>/metadata.json',
    ].join('\n'),
  );
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    inputPath: '',
    outputDir: '',
    pipeline: DEFAULT_PIPELINE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  const requireValue = (name: string, value: string | undefined): string => {
    if (!value || value.startsWith('-')) {
      throw new Error(`Missing value for ${name}.`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--input') {
      args.inputPath = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === '--output') {
      args.outputDir = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === '--pipeline') {
      const value = requireValue(arg, next).toLowerCase();
      if (value !== 'headless' && value !== 'presentation') {
        throw new Error(`Invalid value for --pipeline: "${next}".`);
      }
      args.pipeline = value;
      i += 1;
      continue;
    }
    if (arg === '--timeout-ms') {
      const value = Number(requireValue(arg, next));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid value for --timeout-ms: "${next}".`);
      }
      args.timeoutMs = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option "${arg}". Run with --help for usage.`);
    }
    if (!args.inputPath) {
      args.inputPath = arg;
      continue;
    }
    throw new Error(`Unexpected positional argument "${arg}". Run with --help for usage.`);
  }

  if (!args.inputPath) throw new Error('Missing required option --input.');
  if (!args.outputDir) throw new Error('Missing required option --output.');
  return args;
}

async function assertDocxInput(inputPath: string): Promise<void> {
  const stat = await fs.stat(inputPath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`Input DOCX file does not exist: ${inputPath}`);
  }
  if (!inputPath.toLowerCase().endsWith('.docx')) {
    throw new Error(`Input file must end with .docx: ${inputPath}`);
  }
}

async function assertSuperDocBuilt(): Promise<void> {
  // The vite harness imports `superdoc/style.css`, which is only published
  // after the build. Skipping this check produces an opaque vite 500 instead
  // of an actionable error for the caller.
  const stylePath = path.join(SUPERDOC_DIST, 'style.css');
  const stat = await fs.stat(stylePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(
      `SuperDoc build artifacts not found (${stylePath} missing). Run \`pnpm --filter superdoc build:es\` from the repo root first.`,
    );
  }
}

async function clearStalePageImages(outputDir: string): Promise<void> {
  // Reusing an output directory across runs would otherwise leave page-NNN.png
  // files from a longer prior run, which downstream consumers would mistake
  // for current output. metadata.json is overwritten unconditionally below.
  const entries = await fs.readdir(outputDir).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((name) => /^page-\d{3,}\.png$/.test(name))
      .map((name) => fs.unlink(path.join(outputDir, name)).catch(() => undefined)),
  );
}

async function sha256OfFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk as Buffer))
      .on('end', () => resolve())
      .on('error', reject);
  });
  return hash.digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function spawnHarness(): Promise<ChildProcess> {
  const child = spawn('npx', ['vite', '--config', 'harness/vite.config.ts', 'harness/'], {
    cwd: VISUAL_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  // AIDEV-NOTE: vite stdout/stderr is silenced after boot to keep the script's
  // own log lines clean. If the harness fails to start, capture and surface
  // the last stderr buffer in the timeout error path.
  let lastStderr = '';
  const debugVite = process.env.LAYOUT_SCREENSHOT_DEBUG === '1';
  child.stderr?.on('data', (chunk) => {
    lastStderr = String(chunk).slice(-2000);
    if (debugVite) process.stderr.write(`[vite stderr] ${chunk}`);
  });
  child.stdout?.on('data', (chunk) => {
    if (debugVite) process.stdout.write(`[vite stdout] ${chunk}`);
  });

  const start = Date.now();
  while (Date.now() - start < VITE_BOOT_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(`Harness vite exited early (code ${child.exitCode}). Last stderr:\n${lastStderr}`);
    }
    try {
      const response = await fetch(HARNESS_URL);
      if (response.ok) return child;
    } catch {
      // not ready
    }
    await sleep(200);
  }
  child.kill('SIGKILL');
  throw new Error(
    `Harness vite did not become ready on ${HARNESS_URL} within ${VITE_BOOT_TIMEOUT_MS}ms. Last stderr:\n${lastStderr}`,
  );
}

async function killHarness(child: ChildProcess): Promise<void> {
  if (child.killed || child.exitCode !== null) return;
  child.kill('SIGINT');
  await sleep(200);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((a) => a !== '--'));
  const inputPath = path.resolve(args.inputPath);
  const outputDir = path.resolve(args.outputDir);

  await assertDocxInput(inputPath);
  await assertSuperDocBuilt();
  await fs.mkdir(outputDir, { recursive: true });
  await clearStalePageImages(outputDir);

  const docxSha256 = await sha256OfFile(inputPath);

  const harness = await spawnHarness();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1200 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    if (process.env.LAYOUT_SCREENSHOT_DEBUG === '1') {
      page.on('console', (msg) => {
        console.error(`[browser ${msg.type()}] ${msg.text()}`);
      });
      page.on('pageerror', (err) => {
        console.error(`[browser error] ${err.message}`);
      });
    }

    const layoutFlag = args.pipeline === 'headless' ? '0' : '1';
    await page.goto(`${HARNESS_URL}?layout=${layoutFlag}&hideCaret=1&hideSelection=1`);

    // First init: empty SuperDoc instance from main.ts. Wait for that flip
    // to ready before loading the file, otherwise the file-input change
    // race-conditions with the empty-doc construction.
    await page.waitForFunction('window.superdocReady === true', null, {
      polling: 100,
      timeout: args.timeoutMs,
    });

    // AIDEV-NOTE: harness/main.ts re-runs init() on file-input change and
    // sets superdocReady=false at the start. Reset the flag ourselves first
    // so the wait below cannot pass on the stale (empty-doc) ready state.
    await page.evaluate(() => {
      (window as unknown as { superdocReady: boolean }).superdocReady = false;
    });

    await page.locator('input[type="file"]').setInputFiles(inputPath);

    await page.waitForFunction('window.superdocReady === true', null, {
      polling: 100,
      timeout: args.timeoutMs,
    });

    await page.evaluate(() => document.fonts.ready);
    await sleep(STABILIZE_MS);

    const cssPath = path.join(VISUAL_ROOT, 'screenshot.css');
    const css = await fs.readFile(cssPath, 'utf8');
    await page.addStyleTag({ content: css });

    const pages = page.locator('.superdoc-page[data-page-index]');
    const pageCount = await pages.count();

    if (pageCount === 0) {
      throw new Error(
        'No rendered pages found (.superdoc-page[data-page-index] returned 0). The harness loaded but the document produced no paginated output.',
      );
    }

    // AIDEV-NOTE: a partial capture corrupts the artifact bundle silently
    // for downstream consumers (a visual judge would compare missing pages
    // as drift). Throw on any scroll/screenshot failure rather than break,
    // so the caller sees a non-zero exit instead of a "successful" run with
    // fewer images than pages.
    let captured = 0;
    for (let i = 0; i < pageCount; i += 1) {
      const pageEl = pages.nth(i);
      try {
        await pageEl.scrollIntoViewIfNeeded({ timeout: 5_000 });
      } catch (cause) {
        throw new Error(
          `Failed to scroll page ${i + 1}/${pageCount} into view; partial capture aborted (${captured}/${pageCount} pages written).`,
          { cause: cause instanceof Error ? cause : undefined },
        );
      }
      const fileName = `page-${String(i + 1).padStart(3, '0')}.png`;
      await pageEl.screenshot({ path: path.join(outputDir, fileName), timeout: 15_000 });
      captured += 1;
    }

    if (captured !== pageCount) {
      throw new Error(`Captured ${captured} of ${pageCount} pages; partial capture aborted.`);
    }

    const viewport = page.viewportSize() ?? { width: 1600, height: 1200 };

    await context.close();

    const metadata = {
      capturedAt: new Date().toISOString(),
      docxAbsolutePath: inputPath,
      docxSha256,
      pipeline: args.pipeline,
      pageCount: captured,
      viewport: { width: viewport.width, height: viewport.height },
    };

    await fs.writeFile(path.join(outputDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

    console.log(`[layout:screenshot-one] ${inputPath} -> ${outputDir} (${captured} page${captured === 1 ? '' : 's'})`);
  } finally {
    await browser.close().catch(() => {});
    await killHarness(harness);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[layout:screenshot-one] ${message}`);
  process.exitCode = 1;
});
