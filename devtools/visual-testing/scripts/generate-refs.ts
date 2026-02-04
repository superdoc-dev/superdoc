/**
 * Generate reference screenshots for SuperDoc visual testing.
 *
 * This script:
 * 1. Loads document list from the corpus registry
 * 2. Opens each document in the harness
 * 3. Captures per-page screenshots
 * 4. Saves them preserving the folder structure
 *
 * Usage:
 *   pnpm generate                       # screenshots/v.VERSION/ (npm) or screenshots/DATE-v.VERSION/ (local)
 *   pnpm generate --filter sdt          # Only process documents in sdt/ folder
 *   pnpm generate --filter basic --filter layout
 *   pnpm generate --exclude samples     # Skip documents in samples/ folder
 *   pnpm generate --match sd-1401       # Match substring anywhere in path
 *   pnpm generate --output my-run       # Write results to screenshots/my-run
 *   pnpm generate --append              # Keep existing output folder when using --output
 *   pnpm generate --skip-existing       # Skip docs that already have screenshots
 *   pnpm generate --fail-on-error       # Exit non-zero when any document fails
 *   pnpm generate --parallel 8          # Use 8 parallel workers (default: CPU cores / 2, max: 10)
 *   pnpm generate --scale-factor 1.5    # Set Playwright deviceScaleFactor (default: 1.5)
 *   pnpm baseline                       # Baseline screenshots → baselines/v.VERSION/ (skips existing docs)
 *   pnpm baseline 1.4.0                 # Override version label → baselines/v.1.4.0/
 *   pnpm baseline --filter sdt          # Only process documents in sdt/ folder
 *   pnpm baseline --force               # Regenerate all (removes existing baseline first)
 *   pnpm baseline --fail-on-error       # Exit non-zero when any document fails
 *   pnpm baseline --parallel 6          # Use 6 parallel workers
 *   pnpm baseline --scale-factor 1.5    # Set Playwright deviceScaleFactor (default: 1.5)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page, Browser } from '@playwright/test';
import { colors } from './terminal.js';
import {
  buildDocRelativePath,
  createCorpusProvider,
  type CorpusFilters,
  type CorpusProvider,
} from './corpus-provider.js';
import { isPathLikeVersion, normalizeVersionLabel, versionLabelFromPath } from './version-utils.js';
import { getBrowserType, resolveBrowserNames, type BrowserName } from './browser-utils.js';
import { ensureHarnessRunning, stopHarness, HARNESS_URL } from './harness-utils.js';
import { getBaselineOutputRoot, parseStorageFlags, resolveDocsDir, type StorageMode } from './storage-flags.js';

// Configuration
const SCREENSHOTS_DIR = 'screenshots';
const BASE_URL = HARNESS_URL;
const VALID_EXTENSIONS = new Set(['.docx']);
const VIEWPORT = { width: 1600, height: 1200 };
const STABLE_WAIT_MS = 800;
const EXTRA_WAIT_MS = 800;

// Timeouts (in ms) - generous for large documents
const TIMEOUT_EDITOR_READY = 10_000;
const TIMEOUT_SUPERDOC_READY = 120_000; // 2 min for large docs to load
const TIMEOUT_FONTS = 60_000;
const TIMEOUT_LAYOUT_STABLE = 120_000; // 2 min for large docs to render

/**
 * Check if SuperDoc is installed from a local file (not npm).
 */
export function isLocalSuperdocInstall(): boolean {
  try {
    const pkgPath = path.resolve(process.cwd(), 'packages/harness/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const spec = pkg.dependencies?.superdoc || '';
    return spec.startsWith('file:') || spec.startsWith('workspace:') || spec.startsWith('link:');
  } catch {
    return false;
  }
}

/**
 * Get the installed SuperDoc version from node_modules.
 * This reads the actual installed package, not the specifier.
 */
export function getSuperdocVersion(): string {
  try {
    // Read from installed node_modules - this always has the real version
    const installedPkgPath = path.resolve(process.cwd(), 'packages/harness/node_modules/superdoc/package.json');
    if (fs.existsSync(installedPkgPath)) {
      const installedPkg = JSON.parse(fs.readFileSync(installedPkgPath, 'utf-8'));
      return installedPkg.version || 'unknown';
    }

    // Fallback: try to parse from harness package.json specifier
    const pkgPath = path.resolve(process.cwd(), 'packages/harness/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const spec = pkg.dependencies?.superdoc || 'unknown';

    // For npm versions, strip ^ or ~
    if (!spec.startsWith('file:')) {
      return spec.replace(/^[\^~]/, '');
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Generate a folder name for comparison screenshots.
 * - npm versions: v.{version} (immutable, no timestamp needed)
 * - local versions: YYYY-MM-DD-HH-mm-ss-v.{version} (needs timestamp for each run)
 * - forceTimestamp: always include timestamp
 */
export function generateResultsFolderName(version?: string, date: Date = new Date(), forceTimestamp = false): string {
  if (version && isPathLikeVersion(version)) {
    return versionLabelFromPath(version);
  }

  const ver = version || getSuperdocVersion();
  const isLocal = isLocalSuperdocInstall();
  const label = normalizeVersionLabel(ver);

  // npm versions are immutable, so just use version like baselines unless forced
  if (!forceTimestamp && !isLocal) {
    return label;
  }

  // Local (or forced) versions need timestamp to differentiate runs
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const timestamp = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
  return `${timestamp}-${label}`;
}

/**
 * Generate a baseline folder name (version only, no timestamp).
 * Format: v.{version}
 */
export function generateBaselineFolderName(version?: string): string {
  const ver = version || getSuperdocVersion();
  return normalizeVersionLabel(ver);
}

/**
 * Get the temporary root directory for baseline generation.
 *
 * @param version - Optional version override
 * @returns Absolute path to the baseline staging directory
 */
export function getBaselineRootDir(version?: string, mode: StorageMode = 'cloud'): string {
  const baselineFolderName = generateBaselineFolderName(version);
  return getBaselineOutputRoot(mode, 'visual', baselineFolderName);
}

interface DocumentInfo {
  /** Relative path from corpus (e.g., 'basic/simple.docx') */
  relativePath: string;
  /** Absolute file path */
  absolutePath: string;
  /** Output directory for screenshots (preserves folder structure) */
  outputDir: string;
  /** Base name for screenshots (without extension) */
  baseName: string;
  /** Corpus document id */
  doc_id?: string;
  /** Corpus document revision */
  doc_rev?: string;
  /** Whether the document must be fetched before use */
  needsFetch?: boolean;
}

/**
 * Find documents from the corpus registry.
 */
export async function findDocumentsFromCorpus(
  provider: CorpusProvider,
  outputDir: string,
  filters: CorpusFilters,
): Promise<DocumentInfo[]> {
  const docs = await provider.listDocs(filters);
  const documents: DocumentInfo[] = [];

  for (const doc of docs) {
    const relativePath = buildDocRelativePath(doc);
    const ext = path.extname(doc.filename).toLowerCase();
    if (!VALID_EXTENSIONS.has(ext)) {
      continue;
    }

    const relativeDir = path.dirname(relativePath);
    const baseName = path.basename(doc.filename, ext);
    const sanitizedBaseName = sanitizeFilename(baseName);

    documents.push({
      relativePath,
      absolutePath: '',
      outputDir: path.join(outputDir, relativeDir, sanitizedBaseName),
      baseName: sanitizedBaseName,
      doc_id: doc.doc_id,
      doc_rev: doc.doc_rev,
      needsFetch: true,
    });
  }

  return documents.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' }));
}

/**
 * Sanitize a filename for use in screenshot names.
 * Replaces non-alphanumeric characters with hyphens and lowercases.
 *
 * @param name - Filename to sanitize
 * @returns Sanitized filename safe for filesystem use
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * Wait for web fonts to finish loading in the page.
 *
 * @param page - Playwright page instance
 * @param timeout - Maximum time to wait in milliseconds
 */
async function waitForFontsReady(page: Page, timeout = TIMEOUT_FONTS): Promise<void> {
  await page.waitForFunction(() => !document.fonts || document.fonts.status === 'loaded', null, {
    polling: 100,
    timeout,
  });
}

/**
 * Wait for the layout engine to stabilize (no dimension changes).
 * Monitors the editor container's dimensions and scroll sizes.
 *
 * @param page - Playwright page instance
 * @param stableMs - Duration dimensions must remain stable
 * @param timeout - Maximum time to wait in milliseconds
 */
async function waitForLayoutStable(
  page: Page,
  stableMs = STABLE_WAIT_MS,
  timeout = TIMEOUT_LAYOUT_STABLE,
): Promise<void> {
  await page.waitForFunction(
    ({ stableMs }) => {
      const root = document.querySelector('.superdoc-layout') || document.querySelector('div.super-editor');
      if (!root) return false;

      const rect = root.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return false;

      const current = {
        w: rect.width,
        h: rect.height,
        scrollW: root.scrollWidth,
        scrollH: root.scrollHeight,
      };

      const prev = (window as unknown as { __layoutPrevState?: typeof current }).__layoutPrevState || current;
      const now = performance.now();
      const delta =
        Math.abs(prev.w - current.w) +
        Math.abs(prev.h - current.h) +
        Math.abs(prev.scrollW - current.scrollW) +
        Math.abs(prev.scrollH - current.scrollH);

      if (delta > 1) {
        (window as unknown as { __layoutPrevState: typeof current }).__layoutPrevState = current;
        (window as unknown as { __layoutStableSince: number }).__layoutStableSince = now;
        return false;
      }

      (window as unknown as { __layoutPrevState: typeof current }).__layoutPrevState = current;
      const stableSince = (window as unknown as { __layoutStableSince?: number }).__layoutStableSince;
      if (!stableSince) {
        (window as unknown as { __layoutStableSince: number }).__layoutStableSince = now;
      }

      return now - ((window as unknown as { __layoutStableSince: number }).__layoutStableSince || now) > stableMs;
    },
    { stableMs },
    { polling: 100, timeout },
  );
}

/**
 * Wait for the rendered page count to remain stable.
 * Ensures pagination has finished before capturing.
 *
 * @param page - Playwright page instance
 * @param stableMs - Duration page count must remain stable
 * @param timeout - Maximum time to wait in milliseconds
 */
async function waitForPageCountStable(
  page: Page,
  stableMs = STABLE_WAIT_MS,
  timeout = TIMEOUT_LAYOUT_STABLE,
): Promise<void> {
  await page.waitForFunction(
    ({ stableMs }) => {
      const count = document.querySelectorAll('.superdoc-page[data-page-index]').length;
      const state =
        (window as unknown as { __pageCountState?: { count: number; since: number } }).__pageCountState ??
        ({ count, since: performance.now() } as { count: number; since: number });
      const now = performance.now();

      if (state.count !== count) {
        state.count = count;
        state.since = now;
        (window as unknown as { __pageCountState?: { count: number; since: number } }).__pageCountState = state;
        return false;
      }

      (window as unknown as { __pageCountState?: { count: number; since: number } }).__pageCountState = state;
      return now - state.since > stableMs;
    },
    { stableMs },
    { polling: 100, timeout },
  );
}

/**
 * Capture per-page screenshots for a document.
 * Loads the document in the harness, waits for rendering, and screenshots each page.
 *
 * @param page - Playwright page instance
 * @param doc - Document info with paths and metadata
 * @param provider - Corpus provider for fetching the document
 * @returns Array of captured screenshot file paths
 */
async function captureDocument(page: Page, doc: DocumentInfo, provider: CorpusProvider): Promise<string[]> {
  const capturedFiles: string[] = [];

  // Navigate to harness with layout engine enabled
  await page.goto(`${BASE_URL}/?layout=1&hideCaret=1&hideSelection=1`);

  // Wait for editor to be ready
  await page.waitForSelector('div.super-editor', { timeout: TIMEOUT_EDITOR_READY });

  // Upload the document
  if (doc.needsFetch) {
    if (!doc.doc_id || !doc.doc_rev) {
      throw new Error(`Missing corpus metadata for ${doc.relativePath}`);
    }
    doc.absolutePath = await provider.fetchDoc(doc.doc_id, doc.doc_rev);
    doc.needsFetch = false;
  }

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(doc.absolutePath);

  // Wait for SuperDoc to process the document
  await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
    polling: 100,
    timeout: TIMEOUT_SUPERDOC_READY,
  });

  // Trigger layout recalculation
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));

  // Wait for fonts and layout to stabilize
  await waitForFontsReady(page);
  await waitForLayoutStable(page);
  await waitForPageCountStable(page);

  // Extra wait for any final rendering
  await page.waitForTimeout(EXTRA_WAIT_MS);

  // Find all rendered pages
  const pages = page.locator('.superdoc-page[data-page-index]');
  const pageCount = await pages.count();

  if (pageCount === 0) {
    console.warn(colors.warning(`  ⚠ No pages found for ${doc.relativePath}`));
    return capturedFiles;
  }

  // Ensure output directory exists
  fs.mkdirSync(doc.outputDir, { recursive: true });

  // Capture each page
  for (let i = 0; i < pageCount; i++) {
    const pageLocator = pages.nth(i);
    const pageNum = String(i + 1).padStart(3, '0');
    const filename = `p${pageNum}.png`;
    const outputPath = path.join(doc.outputDir, filename);

    await pageLocator.screenshot({
      path: outputPath,
      animations: 'disabled',
    });

    capturedFiles.push(outputPath);
  }

  return capturedFiles;
}

/**
 * Get default parallelism based on CPU cores.
 * Uses cores / 2 to avoid resource contention, capped at 10.
 */
function getDefaultParallelism(): number {
  const cpuCount = os.cpus().length;
  // Use cores / 2, minimum 1, maximum 10
  return Math.min(10, Math.max(1, Math.floor(cpuCount / 2)));
}

/**
 * Parse command line arguments.
 */
function parseArgs(): {
  isBaseline: boolean;
  version?: string;
  parallel: number;
  force: boolean;
  filters: string[];
  matches: string[];
  excludes: string[];
  output?: string;
  skipExisting: boolean;
  failOnError: boolean;
  append: boolean;
  browsers: BrowserName[];
  scaleFactor: number;
  mode: StorageMode;
  docsDir?: string;
} {
  const args = process.argv.slice(2);
  const isBaseline = args.includes('--baseline');
  const force = args.includes('--force');
  const skipExisting = args.includes('--skip-existing');
  const failOnError = args.includes('--fail-on-error');
  const append = args.includes('--append');
  const storage = parseStorageFlags(args);
  const docsDir = resolveDocsDir(storage.mode, storage.docsDir);

  // Find version argument (first non-flag argument)
  let version: string | undefined;
  let parallel = getDefaultParallelism();
  const filters: string[] = [];
  const matches: string[] = [];
  const excludes: string[] = [];
  let output: string | undefined;
  let browserArg: string | undefined;
  let scaleFactor = 1.5;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--parallel' && args[i + 1]) {
      parallel = Math.min(10, Math.max(1, parseInt(args[i + 1], 10) || parallel));
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
    } else if (arg === '--browser' && args[i + 1]) {
      browserArg = args[i + 1];
      i++;
    } else if (arg === '--docs' && args[i + 1]) {
      i++;
    } else if (!arg.startsWith('--')) {
      version = arg;
    }
  }

  const browsers = resolveBrowserNames(browserArg);

  return {
    isBaseline,
    version,
    parallel,
    force,
    filters,
    matches,
    excludes,
    output,
    skipExisting,
    failOnError,
    append,
    browsers,
    scaleFactor,
    mode: storage.mode,
    docsDir,
  };
}

/**
 * Check if a document already has screenshots captured.
 */
function hasExistingScreenshots(doc: DocumentInfo): boolean {
  if (!fs.existsSync(doc.outputDir)) return false;
  const files = fs.readdirSync(doc.outputDir);
  return files.some((f) => f.endsWith('.png'));
}

/**
 * Worker that processes documents from a shared queue.
 */
async function processDocumentQueue(
  workerId: number,
  page: Page,
  queue: DocumentInfo[],
  results: { screenshots: number; skipped: number; errors: Array<{ doc: string; error: string }> },
  skipExisting: boolean,
  provider: CorpusProvider,
): Promise<void> {
  while (true) {
    const doc = queue.shift();
    if (!doc) break;

    // Skip if document already has screenshots (for baseline mode)
    if (skipExisting && hasExistingScreenshots(doc)) {
      console.log(colors.muted(`[${workerId}] ⏭ ${doc.relativePath} (already exists)`));
      results.skipped++;
      continue;
    }

    console.log(colors.info(`[${workerId}] 📄 ${doc.relativePath}`));

    try {
      const screenshots = await captureDocument(page, doc, provider);
      results.screenshots += screenshots.length;
      console.log(colors.success(`[${workerId}]    ✓ ${screenshots.length} page(s) captured`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(colors.error(`[${workerId}]    ✗ Error: ${message}`));
      results.errors.push({ doc: doc.relativePath, error: message });
    }
  }
}

type ParsedArgs = ReturnType<typeof parseArgs>;

async function runForBrowser(browser: BrowserName, options: ParsedArgs): Promise<number> {
  const {
    isBaseline,
    version,
    parallel,
    force,
    filters,
    matches,
    excludes,
    output,
    skipExisting,
    failOnError,
    append,
    scaleFactor,
    mode,
    docsDir,
  } = options;

  // Determine output directory based on mode
  let outputDir: string;
  let modeLabel: string;

  let baselineRoot: string | undefined;
  if (isBaseline) {
    baselineRoot = getBaselineRootDir(version, mode);
    outputDir = path.join(baselineRoot, browser);
    modeLabel = 'baseline';

    // Force flag removes entire baseline to regenerate
    if (force && fs.existsSync(outputDir)) {
      console.log(colors.warning(`🧹 Removing existing baseline: ${outputDir}`));
      fs.rmSync(outputDir, { recursive: true });
    }
    if (output) {
      console.warn(colors.warning('⚠ Ignoring --output in baseline mode.'));
    }
  } else {
    const resultsFolderName = output || generateResultsFolderName(version);
    outputDir = path.isAbsolute(resultsFolderName)
      ? path.join(resultsFolderName, browser)
      : path.join(SCREENSHOTS_DIR, resultsFolderName, browser);
    modeLabel = 'comparison';

    // Clear existing screenshots folder to ensure fresh results (unless appending)
    if (fs.existsSync(outputDir)) {
      if (append) {
        console.log(colors.muted(`↪️  Reusing existing screenshots: ${outputDir}`));
      } else {
        console.log(colors.warning(`🧹 Clearing existing screenshots: ${outputDir}`));
        fs.rmSync(outputDir, { recursive: true });
      }
    }
  }

  const provider = await createCorpusProvider({ mode, docsDir });

  console.log(colors.info('🔍 Finding documents...'));
  const documents = await findDocumentsFromCorpus(provider, outputDir, { filters, matches, excludes });
  if (filters.length > 0) {
    console.log(colors.info(`🔎 Filter: "${filters.join(', ')}"`));
  }
  if (matches.length > 0) {
    console.log(colors.info(`🔎 Match: "${matches.join(', ')}"`));
  }
  if (excludes.length > 0) {
    console.log(colors.info(`🔎 Exclude: "${excludes.join(', ')}"`));
  }

  if (documents.length === 0) {
    console.log(colors.warning('No documents found in corpus.'));
    return 0;
  }

  console.log(colors.info(`Found ${documents.length} document(s)`));
  if (isBaseline) {
    if (mode === 'local') {
      console.log(colors.info(`📁 Output (baseline): ${outputDir}`));
    } else {
      console.log(colors.info('📁 Output (baseline): uploading to R2'));
    }
  } else {
    console.log(colors.info(`📁 Output (${modeLabel}): ${outputDir}`));
  }

  // Determine actual parallelism (don't use more workers than documents)
  const workerCount = Math.min(parallel, documents.length);
  console.log(colors.info(`🚀 Launching browser with ${workerCount} parallel worker(s)...\n`));

  // Launch browser
  const browserType = getBrowserType(browser);
  const browserInstance: Browser = await browserType.launch({
    headless: true,
  });

  // Create shared results object
  const results = {
    screenshots: 0,
    skipped: 0,
    errors: [] as Array<{ doc: string; error: string }>,
  };

  // Create document queue (workers will pull from this)
  const queue = [...documents];

  // Skip existing documents in baseline mode (unless --force)
  const shouldSkipExisting = (isBaseline && !force) || skipExisting;

  // Create workers (each with its own browser context and page)
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    const context = await browserInstance.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: scaleFactor,
    });
    const page = await context.newPage();
    workers.push(processDocumentQueue(i + 1, page, queue, results, shouldSkipExisting, provider));
  }

  // Wait for all workers to complete
  await Promise.all(workers);

  await browserInstance.close();

  // Summary
  console.log('\n' + colors.muted('─'.repeat(50)));
  const processedDocs = documents.length - results.errors.length - results.skipped;
  if (results.screenshots > 0) {
    if (isBaseline) {
      console.log(
        colors.success(`✅ Baseline: ${results.screenshots} screenshot(s) from ${processedDocs} document(s)`),
      );
    } else {
      console.log(colors.success(`✅ Captured ${results.screenshots} screenshot(s) from ${processedDocs} document(s)`));
    }
    if (!isBaseline) {
      console.log(colors.info(`📁 Saved to: ${outputDir}`));
    }
  } else if (results.skipped === 0) {
    console.log(colors.muted(`No documents matched the filter.`));
  }
  if (results.skipped > 0) {
    console.log(colors.muted(`⏭ Skipped ${results.skipped} document(s) (already exist)`));
  }

  if (results.errors.length > 0) {
    console.log(colors.warning(`\n⚠ ${results.errors.length} error(s):`));
    for (const { doc, error } of results.errors) {
      console.log(colors.error(`  - ${doc}: ${error}`));
    }
    if (failOnError) {
      return 1;
    }
  }

  return 0;
}

/**
 * Main entry point.
 */
async function main(): Promise<number> {
  const options = parseArgs();
  let exitCode = 0;

  for (const browser of options.browsers) {
    console.log(colors.info(`\n🌐 Browser: ${browser}`));
    const code = await runForBrowser(browser, options);
    if (code !== 0) {
      exitCode = 1;
      if (options.failOnError) {
        return code;
      }
    }
  }

  return exitCode;
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const runWithHarness = async (): Promise<number> => {
    const { child, started } = await ensureHarnessRunning();
    try {
      return await main();
    } finally {
      if (started && child) {
        await stopHarness(child);
      }
    }
  };

  runWithHarness()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(colors.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
      process.exitCode = 1;
    });
}
