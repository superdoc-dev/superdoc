/**
 * Generate interaction screenshots for SuperDoc visual testing.
 *
 * This script:
 * 1. Loads interaction stories from tests/interactions/stories
 * 2. Runs each story against the harness
 * 3. Captures milestone screenshots via story milestone() calls
 *
 * Usage:
 *   pnpm generate:interactions           # screenshots/<run>/interactions/
 *   pnpm baseline:interactions           # baselines-interactions/v.VERSION/interactions/
 *   pnpm generate:interactions --filter typing
 *   pnpm generate:interactions --exclude toolbar
 *   pnpm generate:interactions --match sd-1401
 *   pnpm generate:interactions --output my-run
 *   pnpm generate:interactions --fail-on-error
 *   pnpm generate:interactions --scale-factor 1.5
 *   pnpm baseline:interactions --fail-on-error
 *   pnpm baseline:interactions --scale-factor 1.5
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type { Browser, Page } from '@playwright/test';
import {
  createInteractionHelpers,
  goToHarness,
  uploadDocument,
  waitForFontsReady,
  waitForLayoutStable,
  waitForSuperdocReady,
  type InteractionStory,
} from '@superdoc-testing/helpers';
import { generateBaselineFolderName, generateResultsFolderName, sanitizeFilename } from './generate-refs.js';
import { createCorpusProvider, resolveDocumentPath, type CorpusProvider } from './corpus-provider.js';
import { colors } from './terminal.js';
import { getBrowserType, resolveBrowserNames, type BrowserName } from './browser-utils.js';
import { sleep } from './utils.js';
import { ensureHarnessRunning, stopHarness } from './harness-utils.js';
import { getBaselineOutputRoot, parseStorageFlags, resolveDocsDir, type StorageMode } from './storage-flags.js';

const STORIES_DIR = path.resolve(process.cwd(), 'tests/interactions/stories');
const LEGACY_SCENARIOS_DIR = path.resolve(process.cwd(), 'tests/interactions/scenarios');
const SCREENSHOTS_DIR = 'screenshots';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const BLANK_DOC_PATH = path.join(repoRoot, 'shared/common/data/blank.docx');
const DEFAULT_VIEWPORT = { width: 1600, height: 1200 };
const MILESTONE_EXTRA_WAIT_MS = 500;
const TIMEOUT_SUPERDOC_READY = 120_000;
const TIMEOUT_FONTS = 60_000;
const TIMEOUT_LAYOUT_STABLE = 120_000;
const FIXED_TIME_ISO = '2026-01-12T12:00:00Z';

interface LoadedStory {
  id: string;
  name: string;
  filePath: string;
  story: InteractionStory;
}

async function hideHarnessHeader(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      .harness-header {
        display: none !important;
      }
    `,
  });
}

async function freezeHarnessTime(page: Page): Promise<void> {
  await page.clock.setFixedTime(FIXED_TIME_ISO);
}

function parseArgs(): {
  isBaseline: boolean;
  version?: string;
  force: boolean;
  filters: string[];
  matches: string[];
  excludes: string[];
  output?: string;
  skipExisting: boolean;
  failOnError: boolean;
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
  const storage = parseStorageFlags(args);
  const docsDir = resolveDocsDir(storage.mode, storage.docsDir);

  let version: string | undefined;
  const filters: string[] = [];
  const matches: string[] = [];
  const excludes: string[] = [];
  let output: string | undefined;
  let browserArg: string | undefined;
  let scaleFactor = 1.5;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--filter' && args[i + 1]) {
      const rawFilter = args[i + 1].trim();
      if (rawFilter) filters.push(rawFilter);
      i++;
    } else if (arg === '--match' && args[i + 1]) {
      const rawMatch = args[i + 1].trim();
      if (rawMatch) matches.push(rawMatch);
      i++;
    } else if (arg === '--exclude' && args[i + 1]) {
      const rawExclude = args[i + 1].trim();
      if (rawExclude) excludes.push(rawExclude);
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
    } else if (arg === '--baseline' || arg === '--force' || arg === '--skip-existing') {
      // flags handled above
    } else if (!arg.startsWith('--')) {
      version = arg;
    }
  }

  const browsers = resolveBrowserNames(browserArg);

  return {
    isBaseline,
    version,
    force,
    filters,
    matches,
    excludes,
    output,
    skipExisting,
    failOnError,
    browsers,
    scaleFactor,
    mode: storage.mode,
    docsDir,
  };
}

function hasExistingSnapshots(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  const files = fs.readdirSync(dir);
  return files.some((file) => file.endsWith('.png'));
}

function resolveStoriesDir(): { dir: string; isLegacy: boolean } {
  if (fs.existsSync(STORIES_DIR)) {
    return { dir: STORIES_DIR, isLegacy: false };
  }
  if (fs.existsSync(LEGACY_SCENARIOS_DIR)) {
    return { dir: LEGACY_SCENARIOS_DIR, isLegacy: true };
  }
  return { dir: STORIES_DIR, isLegacy: false };
}

function walkStoriesDir(dir: string, rootDir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files/folders and template files
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkStoriesDir(fullPath, rootDir));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function loadStories(): Promise<LoadedStory[]> {
  const { dir, isLegacy } = resolveStoriesDir();
  if (!fs.existsSync(dir)) {
    return [];
  }

  if (isLegacy) {
    console.warn(
      colors.warning('Using legacy interactions directory (tests/interactions/scenarios). Rename to stories/'),
    );
  }

  const files = walkStoriesDir(dir, dir).sort();
  const stories: LoadedStory[] = [];

  for (const filePath of files) {
    const relativePath = path.relative(dir, filePath);
    const relativeDir = path.dirname(relativePath);
    const fileName = path.basename(filePath, path.extname(filePath));

    try {
      const module = await import(pathToFileURL(filePath).href);
      const story = module.default as InteractionStory;
      if (!story || typeof story.run !== 'function') {
        console.warn(colors.warning(`Skipping invalid story: ${relativePath} (missing run())`));
        continue;
      }

      const name = story.name || fileName;
      // Create hierarchical ID: folder/filename (or just filename if at root)
      const id =
        relativeDir === '.' ? sanitizeFilename(name) : `${relativeDir.replace(/\\/g, '/')}/${sanitizeFilename(name)}`;
      stories.push({ id, name, filePath, story: { ...story, name } });
    } catch (error) {
      console.warn(
        colors.warning(`Skipping story ${relativePath}: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }

  return stories.sort((a, b) => a.id.localeCompare(b.id));
}

function createMilestoneNamer(): (suffix?: string) => string {
  let count = 0;
  return (suffix?: string) => {
    count += 1;
    const prefix = String(count).padStart(2, '0');
    const label = suffix ? sanitizeFilename(suffix) : 'snapshot';
    return `${prefix}-${label}.png`;
  };
}

function normalizeFilters(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.toLowerCase())));
}

function storyMatches(story: LoadedStory, filters: string[], matches: string[], excludes: string[]): boolean {
  const normalizedFilters = normalizeFilters(filters);
  const normalizedMatches = normalizeFilters(matches);
  const normalizedExcludes = normalizeFilters(excludes);
  const id = story.id.toLowerCase();
  const name = story.name.toLowerCase();
  const fileName = path.basename(story.filePath).toLowerCase();
  // Extract folder path from the story ID (e.g., "formatting" from "formatting/bold-italic")
  const folderPath = id.includes('/') ? id.split('/').slice(0, -1).join('/') : '';

  const matchesPrefix =
    normalizedFilters.length === 0 ||
    normalizedFilters.some(
      (filterValue) =>
        id.startsWith(filterValue) ||
        name.startsWith(filterValue) ||
        fileName.startsWith(filterValue) ||
        (folderPath && folderPath.startsWith(filterValue)),
    );
  const matchesSubstring =
    normalizedMatches.length === 0 ||
    normalizedMatches.some(
      (matchValue) => id.includes(matchValue) || name.includes(matchValue) || fileName.includes(matchValue),
    );

  const isExcluded =
    normalizedExcludes.length > 0 &&
    normalizedExcludes.some(
      (excludeValue) =>
        id.startsWith(excludeValue) ||
        name.startsWith(excludeValue) ||
        fileName.startsWith(excludeValue) ||
        (folderPath && folderPath.startsWith(excludeValue)),
    );

  return matchesPrefix && matchesSubstring && !isExcluded;
}

async function getStartDocumentPath(story: InteractionStory, provider: CorpusProvider): Promise<string> {
  if (story.startDocument === null || story.startDocument === undefined) {
    return BLANK_DOC_PATH;
  }

  return resolveDocumentPath(provider, story.startDocument);
}

function buildHarnessConfig(story: InteractionStory) {
  const layout = story.layout ?? story.useLayoutEngine !== false;
  const comments = story.comments ?? (story.includeComments ? 'on' : 'off');

  return {
    layout,
    comments,
    toolbar: story.toolbar ?? 'none',
    trackChanges: story.trackChanges ?? false,
    viewport: story.viewport ?? DEFAULT_VIEWPORT,
    waitForFonts: story.waitForFonts ?? false,
    hideCaret: story.hideCaret ?? false,
    hideSelection: story.hideSelection ?? false,
    caretBlink: story.caretBlink ?? false,
    extensions: story.extensions ?? [],
  };
}

async function runStory(
  browser: Browser,
  story: LoadedStory,
  outputRoot: string,
  scaleFactor: number,
  provider: CorpusProvider,
): Promise<number> {
  const context = await browser.newContext({
    viewport: story.story.viewport ?? DEFAULT_VIEWPORT,
    deviceScaleFactor: scaleFactor,
  });
  const page = await context.newPage();
  await freezeHarnessTime(page);
  const harnessConfig = buildHarnessConfig(story.story);
  const milestoneNameForStory = createMilestoneNamer();
  const storyDir = path.join(outputRoot, story.id);
  fs.mkdirSync(storyDir, { recursive: true });
  const storyMeta = {
    name: story.story.name ?? story.name,
    description: story.story.description ?? '',
    tickets: story.story.tickets ?? [],
    milestones: {} as Record<string, { label?: string; description?: string }>,
  };

  const layoutEnabled = harnessConfig.layout !== false;

  await goToHarness(page, harnessConfig);
  await waitForSuperdocReady(page, { timeout: TIMEOUT_SUPERDOC_READY });

  const docPath = await getStartDocumentPath(story.story, provider);
  await uploadDocument(page, docPath, { waitForStable: true, timeout: TIMEOUT_SUPERDOC_READY });
  await waitForSuperdocReady(page, { timeout: TIMEOUT_SUPERDOC_READY });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await waitForFontsReady(page, { timeout: TIMEOUT_FONTS });

  if (layoutEnabled) {
    await waitForLayoutStable(page, { selector: '.superdoc-layout', timeout: TIMEOUT_LAYOUT_STABLE });
  }

  await hideHarnessHeader(page);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  if (layoutEnabled) {
    await waitForLayoutStable(page, { selector: '.superdoc-layout', stableMs: 300, timeout: TIMEOUT_LAYOUT_STABLE });
  }

  const helpers = createInteractionHelpers(page);
  const milestones: string[] = [];

  const milestone = async (suffix?: string, description?: string): Promise<void> => {
    await sleep(MILESTONE_EXTRA_WAIT_MS);
    if (layoutEnabled) {
      await waitForLayoutStable(page, { selector: '.superdoc-layout', stableMs: 300, timeout: TIMEOUT_LAYOUT_STABLE });
    }
    const fileName = milestoneNameForStory(suffix);
    const milestonePath = path.join(storyDir, fileName);
    await page.screenshot({ path: milestonePath, fullPage: true, animations: 'disabled' });
    milestones.push(milestonePath);
    storyMeta.milestones[fileName] = {
      label: suffix,
      description,
    };
  };

  const snapshot = milestone;

  await story.story.run(page, { ...helpers, milestone, snapshot });

  if (milestones.length === 0) {
    await milestone();
  }

  const metaPath = path.join(storyDir, '_story.json');
  fs.writeFileSync(metaPath, `${JSON.stringify(storyMeta, null, 2)}\n`, 'utf8');

  await context.close();

  return milestones.length;
}

type ParsedArgs = ReturnType<typeof parseArgs>;

async function runForBrowser(browser: BrowserName, options: ParsedArgs): Promise<number> {
  const {
    isBaseline,
    version,
    force,
    filters,
    matches,
    excludes,
    output,
    skipExisting,
    failOnError,
    scaleFactor,
    mode,
    docsDir,
  } = options;

  let outputRoot: string;
  let modeLabel: string;

  if (isBaseline) {
    const baselineFolderName = generateBaselineFolderName(version);
    const baselineRoot = getBaselineOutputRoot(mode, 'interactions', baselineFolderName);
    outputRoot = path.join(baselineRoot, browser);
    modeLabel = 'baseline';

    if (force && fs.existsSync(outputRoot)) {
      console.log(colors.warning(`Removing existing baseline: ${outputRoot}`));
      fs.rmSync(outputRoot, { recursive: true });
    }
    if (output) {
      console.warn(colors.warning('Ignoring --output in baseline mode.'));
    }
  } else {
    const resultsFolderName = output || generateResultsFolderName(version);
    const resultsRoot = path.isAbsolute(resultsFolderName)
      ? path.join(resultsFolderName, 'interactions')
      : path.join(SCREENSHOTS_DIR, resultsFolderName, 'interactions');
    outputRoot = path.join(resultsRoot, browser);
    modeLabel = 'comparison';

    // Clear existing interactions folder to ensure fresh results
    if (fs.existsSync(outputRoot)) {
      console.log(colors.muted(`Clearing existing: ${path.basename(outputRoot)}`));
      fs.rmSync(outputRoot, { recursive: true });
    }
  }

  const stories = await loadStories();
  const resolvedStoriesDir = resolveStoriesDir().dir;

  if (stories.length === 0) {
    console.log(colors.warning(`No stories found in ${resolvedStoriesDir}`));
    return 0;
  }

  const filtered = stories.filter((story) => storyMatches(story, filters, matches, excludes));

  // Build compact config line
  const configParts: string[] = [];
  if (filters.length > 0) configParts.push(`Filter: "${normalizeFilters(filters).join(', ')}"`);
  if (matches.length > 0) configParts.push(`Match: "${normalizeFilters(matches).join(', ')}"`);
  if (excludes.length > 0) configParts.push(`Exclude: "${normalizeFilters(excludes).join(', ')}"`);
  if (configParts.length > 0) {
    console.log(colors.muted(configParts.join(' │ ')));
  }

  if (filtered.length === 0) {
    console.log(colors.warning('No stories matched filters.'));
    return 0;
  }

  const outputLabel = isBaseline ? (mode === 'local' ? outputRoot : 'R2') : outputRoot;
  console.log(colors.muted(`${filtered.length} stories → ${outputLabel}`));

  const provider = await createCorpusProvider({ mode, docsDir });
  const shouldSkipExisting = (isBaseline && !force) || skipExisting;

  const browserType = getBrowserType(browser);
  const browserInstance = await browserType.launch({ headless: true });
  const results = {
    stories: 0,
    milestones: 0,
    skipped: 0,
    errors: [] as Array<{ story: string; error: string }>,
  };

  for (const story of filtered) {
    const storyDir = path.join(outputRoot, story.id);
    if (shouldSkipExisting && hasExistingSnapshots(storyDir)) {
      console.log(colors.muted(`⏭ ${story.name} (already exists)`));
      results.skipped += 1;
      continue;
    }

    console.log(colors.info(`▶ ${story.name}`));
    results.stories += 1;

    try {
      const count = await runStory(browserInstance, story, outputRoot, scaleFactor, provider);
      results.milestones += count;
      console.log(colors.success(`   ✓ ${count} milestone(s)`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(colors.error(`   ✗ Error: ${message}`));
      results.errors.push({ story: story.name, error: message });
    }
  }

  await browserInstance.close();

  console.log('\n' + colors.muted('─'.repeat(50)));
  if (results.milestones > 0) {
    if (isBaseline) {
      console.log(colors.success(`✅ Baseline: ${results.milestones} milestone(s) from ${results.stories} stories`));
    } else {
      console.log(colors.success(`✅ Captured ${results.milestones} milestone(s) from ${results.stories} stories`));
    }
    if (!isBaseline) {
      console.log(colors.info(`Saved to: ${outputRoot}`));
    }
  } else if (results.skipped === 0) {
    console.log(colors.muted(`No stories matched the filter.`));
  }
  if (results.skipped > 0) {
    console.log(colors.muted(`⏭ Skipped ${results.skipped} stories (already exist)`));
  }

  if (results.errors.length > 0) {
    console.log(colors.warning(`\n⚠ ${results.errors.length} error(s):`));
    for (const { story, error } of results.errors) {
      console.log(colors.error(`  - ${story}: ${error}`));
    }
    if (failOnError) {
      return 1;
    }
  }

  return 0;
}

async function main(): Promise<number> {
  const options = parseArgs();
  let exitCode = 0;

  for (const browser of options.browsers) {
    if (options.browsers.length > 1) {
      console.log(colors.muted(`\nBrowser: ${browser}`));
    }
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
