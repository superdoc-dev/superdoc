/**
 * Compare screenshots against baselines (R2 by default, or local with --local --docs).
 *
 * This script:
 * 1. Generates a fresh results folder (unless --folder is provided)
 * 2. Compares against the specified baseline (or latest baseline)
 * 3. Compares each screenshot pixel-by-pixel
 * 4. Generates diff images for mismatches
 * 5. Outputs a summary report
 *
 * Usage:
 *   pnpm compare                    # Generate fresh results, compare against latest baseline in R2
 *   pnpm compare 1.4.0              # Generate fresh results, compare against baseline v.1.4.0 in R2
 *   pnpm compare 1.4.0 --target 1.5.0-next.5  # Generate baseline+results and compare versions
 *   pnpm compare --threshold 0      # Require exact match (default: 0.05%)
 *   pnpm compare --filter sdt       # Only generate/compare files in sdt/ folder
 *   pnpm compare --exclude samples  # Skip files in samples/ folder
 *   pnpm compare --match sd-1401    # Match substring anywhere in path
 *   pnpm compare --doc comments-tcs/basic-comments.docx  # Compare a specific corpus doc
 *   pnpm compare --folder <name>    # Compare an existing results folder (skip generation)
 *   pnpm compare --results-root <dir> # Read comparison results from this root folder
 *   pnpm compare --report-all       # Include passing pages in the HTML report
 *   pnpm compare --include-word     # Include Word comparison
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { generateResultsFolderName, getSuperdocVersion, sanitizeFilename } from './generate-refs.js';
import { buildDocRelativePath, createCorpusProvider, type CorpusProvider } from './corpus-provider.js';
import { writeHtmlReport } from './report.js';
import { colors } from './terminal.js';
import {
  isPathLikeVersion,
  normalizeVersionLabel,
  normalizeVersionSpecifier,
  parseVersionInput,
} from './version-utils.js';
import {
  BROWSER_NAMES,
  resolveBrowserNames,
  resolveBaselineFolderForBrowser,
  type BrowserName,
} from './browser-utils.js';
import {
  ensureBaselineDownloaded,
  getLatestBaselineVersion,
  refreshBaselineSubset,
  isWordR2Available,
  downloadWordBaselines,
} from './r2-baselines.js';
import {
  buildStorageArgs,
  findLatestBaselineLocal,
  getBaselineLocalRoot as getBaselineLocalRootForMode,
  parseStorageFlags,
  resolveDocsDir,
  type StorageMode,
} from './storage-flags.js';
import { HARNESS_PORT, HARNESS_URL, isPortOpen, ensureHarnessRunning, stopHarness } from './harness-utils.js';
import { ensureLocalTarballInstalled } from './workspace-utils.js';
import { normalizeDocPath } from './utils.js';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs') as typeof import('pngjs');

function resolvePixelmatch(moduleValue: unknown): typeof import('pixelmatch').default {
  if (typeof moduleValue === 'function') {
    return moduleValue as typeof import('pixelmatch').default;
  }

  if (
    moduleValue &&
    typeof moduleValue === 'object' &&
    'default' in moduleValue &&
    typeof (moduleValue as { default?: unknown }).default === 'function'
  ) {
    return (moduleValue as { default: typeof import('pixelmatch').default }).default;
  }

  throw new Error('Unsupported pixelmatch module shape. Expected function export or default function export.');
}

const pixelmatch = resolvePixelmatch(require('pixelmatch'));

// Configuration
const SCREENSHOTS_DIR = 'screenshots';
const BASELINES_DIR = 'baselines';
const RESULTS_DIR = 'results';
const REPORT_FILE = 'report.json';
const WORD_OPEN_STAGING_ENV = 'SUPERDOC_WORD_OPEN_DIR';
const WORD_OPEN_STAGING_DEFAULT = path.join(
  os.homedir(),
  'Library',
  'Containers',
  'com.microsoft.Word',
  'Data',
  'Documents',
  'superdoc-report-open',
);

export interface CompareOptions {
  /** Threshold for pixel difference (0-100, default: 0.05) */
  threshold?: number;
  /** Generate diff images (default: true) */
  generateDiffs?: boolean;
  /** Baseline version to compare against (e.g., "v.1.4.0" or "1.4.0") */
  baselineVersion?: string;
  /** Baseline root folder (default: baselines) */
  baselineRoot?: string;
  /** Results root folder (default: screenshots) */
  resultsRoot?: string;
  /** Results prefix to strip when matching against baselines */
  resultsPrefix?: string;
  /** Browser name (chromium, firefox, webkit) */
  browser?: BrowserName;
  /** Output folder name for reports/diffs (defaults to results folder name) */
  outputFolderName?: string;
  /** Filter to only compare files matching these path prefixes */
  filters?: string[];
  /** Match substrings anywhere in the path */
  matches?: string[];
  /** Exclude files matching these path prefixes */
  excludes?: string[];
  /** Path prefixes to ignore when comparing */
  ignorePrefixes?: string[];
  /** HTML report options */
  reportOptions?: ReportOptions;
}

export type CompareFailureReason = 'pixel_diff' | 'dimension_mismatch' | 'missing_in_baseline' | 'missing_in_results';

export interface ImageCompareResult {
  /** Relative path of the image */
  relativePath: string;
  /** Whether images match within threshold */
  passed: boolean;
  /** Number of different pixels */
  diffPixels: number;
  /** Total pixels in image */
  totalPixels: number;
  /** Percentage of different pixels */
  diffPercent: number;
  /** Path to diff image (if generated) */
  diffPath?: string;
  /** Reason for failure (if failed) */
  reason?: CompareFailureReason;
  /** Word comparison assets (if generated) */
  word?: WordImageSet;
  /** Source document metadata (if available) */
  sourceDoc?: SourceDocMetadata;
  /** Interaction story metadata (if available) */
  interaction?: InteractionMetadata;
}

export interface WordImageSet {
  baseline: string;
  diff: string;
  actual: string;
}

export interface InteractionMetadata {
  storyName?: string;
  storyDescription?: string;
  milestoneLabel?: string;
  milestoneDescription?: string;
}

/** Metadata linking a comparison result back to its source .docx file. */
export interface SourceDocMetadata {
  /** Corpus-relative path of the source document (e.g. "tables/basic.docx") */
  relativePath: string;
  /** Absolute local path to the original source document (corpus location/cache file) */
  originalLocalPath: string;
  /** Absolute local path to the (possibly staged) copy of the document */
  localPath: string;
  /** ms-word: protocol deep-link URL (macOS only) */
  wordUrl?: string;
  /** Pre-downloaded Word overlay page paths relative to resultsRoot (from R2) */
  wordOverlayPages?: string[];
}

type DocumentInfo = {
  relativePath: string;
  absolutePath?: string;
  baseName: string;
  doc_id: string;
  doc_rev: string;
};

type WordTarget =
  | { mode: 'local'; value: string }
  | { mode: 'version'; value: string }
  | { mode: 'skip'; reason: string };

interface StoryMetadataFile {
  name?: string;
  description?: string;
  milestones?: Record<string, { label?: string; description?: string }>;
}

export interface ComparisonReport {
  /** Results folder compared */
  resultsFolder: string;
  /** Baseline folder compared against */
  baselineFolder: string;
  /** Threshold used */
  threshold: number;
  /** Timestamp of comparison */
  timestamp: string;
  /** Individual image results */
  results: ImageCompareResult[];
  /** Summary counts */
  summary: {
    passed: number;
    failed: number;
    missingInBaseline: number;
    missingInResults: number;
    total: number;
  };
}

/**
 * Copy an image file to the output artifacts directory.
 *
 * @param sourcePath - Source image path
 * @param destinationPath - Destination path (parent dirs created if needed)
 */
function copyArtifactImage(sourcePath: string, destinationPath: string): void {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

/**
 * Build paths for a diff bundle (baseline, actual, and diff images).
 *
 * @param outputFolder - Output folder root
 * @param relativePath - Relative path of the image being compared
 * @returns Object with bundleDir, diffPath, baselinePath, and actualPath
 */
function buildDiffBundlePaths(
  outputFolder: string,
  relativePath: string,
): {
  bundleDir: string;
  diffPath: string;
  baselinePath: string;
  actualPath: string;
} {
  const parsed = path.parse(relativePath);
  const bundleDir = path.join(outputFolder, parsed.dir);

  return {
    bundleDir,
    diffPath: path.join(bundleDir, `${parsed.name}-diff.png`),
    baselinePath: path.join(bundleDir, `${parsed.name}-baseline.png`),
    actualPath: path.join(bundleDir, `${parsed.name}-actual.png`),
  };
}

/** Options passed to the HTML report generator. */
interface ReportOptions {
  reportFileName?: string;
  showAll?: boolean;
  mode?: 'visual' | 'interactions';
  reportMode?: 'visual' | 'interactions';
  trimPrefix?: string;
}

/**
 * Run the generate-refs script to capture screenshots.
 *
 * @param options - Generation options
 */
async function runGenerate(options: {
  outputFolder: string;
  filters: string[];
  matches: string[];
  excludes: string[];
  docs: string[];
  append?: boolean;
  browser?: BrowserName;
  scaleFactor?: number;
  storageArgs?: string[];
}): Promise<void> {
  const args = ['exec', 'tsx', 'scripts/generate-refs.ts', '--output', options.outputFolder];

  for (const filter of options.filters) {
    args.push('--filter', filter);
  }
  for (const match of options.matches) {
    args.push('--match', match);
  }
  for (const exclude of options.excludes) {
    args.push('--exclude', exclude);
  }
  for (const doc of options.docs) {
    args.push('--doc', doc);
  }
  if (options.append) {
    args.push('--append');
  }
  if (options.scaleFactor && options.scaleFactor !== 1) {
    args.push('--scale-factor', String(options.scaleFactor));
  }
  if (options.browser) {
    args.push('--browser', options.browser);
  }
  if (options.storageArgs && options.storageArgs.length > 0) {
    args.push(...options.storageArgs);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`generate-refs exited with code ${code ?? 'unknown'} (${signal ?? 'no signal'})`));
      }
    });
  });
}

async function runBaseline(options: {
  script: 'scripts/baseline-visual.ts' | 'scripts/baseline-interactions.ts';
  versionSpec?: string;
  filters: string[];
  matches: string[];
  excludes: string[];
  docs: string[];
  browserArg?: string;
  scaleFactor?: number;
  storageArgs?: string[];
}): Promise<void> {
  const args = ['exec', 'tsx', options.script];
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
  for (const doc of options.docs) {
    args.push('--doc', doc);
  }
  if (options.scaleFactor && options.scaleFactor !== 1) {
    args.push('--scale-factor', String(options.scaleFactor));
  }
  if (options.browserArg) {
    args.push('--browser', options.browserArg);
  }
  if (options.storageArgs && options.storageArgs.length > 0) {
    args.push(...options.storageArgs);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`baseline script exited with code ${code ?? 'unknown'} (${signal ?? 'no signal'})`));
      }
    });
  });
}

/**
 * Switch the harness to a different SuperDoc version.
 *
 * @param version - Version specifier to switch to
 */
async function runVersionSwitch(version: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'tsx', 'scripts/set-superdoc-version.ts', version], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`set-superdoc-version exited with code ${code ?? 'unknown'} (${signal ?? 'no signal'})`));
      }
    });
  });
}

// (baseline generation handled via runBaseline in local mode)

/**
 * Normalize and deduplicate a list of filter strings.
 *
 * @param values - Array of filter strings
 * @returns Lowercase, deduplicated array
 */
function normalizeList(values?: string[]): string[] {
  if (!values) return [];
  return Array.from(new Set(values.map((value) => value.toLowerCase())));
}

/**
 * Check if a path matches any of the given prefix filters.
 *
 * @param pathValue - Path to check
 * @param filters - Prefix filters (empty array matches everything)
 * @returns True if path starts with any filter prefix
 */
function matchesPrefix(pathValue: string, filters?: string[]): boolean {
  const normalizedFilters = normalizeList(filters);
  if (normalizedFilters.length === 0) return true;
  const value = pathValue.toLowerCase();
  return normalizedFilters.some((filter) => value.startsWith(filter + '/') || value.startsWith(filter));
}

/**
 * Check if a path contains any of the given substrings.
 *
 * @param pathValue - Path to check
 * @param matches - Substrings to search for (empty array matches everything)
 * @returns True if path contains any match substring
 */
function matchesSubstring(pathValue: string, matches?: string[]): boolean {
  const normalizedMatches = normalizeList(matches);
  if (normalizedMatches.length === 0) return true;
  const value = pathValue.toLowerCase();
  return normalizedMatches.some((match) => value.includes(match));
}

/**
 * Check if a path matches any exclusion filter.
 *
 * @param pathValue - Path to check
 * @param excludes - Exclusion prefixes (empty array excludes nothing)
 * @returns True if path should be excluded
 */
function matchesExclude(pathValue: string, excludes?: string[]): boolean {
  const normalizedExcludes = normalizeList(excludes);
  if (normalizedExcludes.length === 0) return false;
  const value = pathValue.toLowerCase();
  return normalizedExcludes.some((exclude) => value.startsWith(exclude + '/') || value.startsWith(exclude));
}

/**
 * Check if a path matches filter criteria (prefix AND substring, NOT excluded).
 *
 * @param pathValue - Path to check
 * @param filters - Prefix filters
 * @param matches - Substring matches
 * @param excludes - Exclusion prefixes
 * @returns True if path passes all filter criteria
 */
function matchesFilter(pathValue: string, filters?: string[], matches?: string[], excludes?: string[]): boolean {
  return (
    matchesPrefix(pathValue, filters) && matchesSubstring(pathValue, matches) && !matchesExclude(pathValue, excludes)
  );
}

/**
 * Check if a path matches filter criteria, stripping browser prefix first.
 *
 * @param pathValue - Path to check
 * @param browserPrefix - Browser prefix to strip (e.g., 'chromium/')
 * @param filters - Prefix filters
 * @param matches - Substring matches
 * @param excludes - Exclusion prefixes
 * @returns True if path passes all filter criteria
 */
export function matchesFilterWithBrowserPrefix(
  pathValue: string,
  browserPrefix: string | undefined,
  filters?: string[],
  matches?: string[],
  excludes?: string[],
): boolean {
  const filterKey = trimPrefix(pathValue, browserPrefix);
  return matchesFilter(filterKey, filters, matches, excludes);
}

/**
 * Normalize a file path to use forward slashes.
 *
 * @param pathValue - Path to normalize
 * @returns Path with forward slashes
 */
function normalizePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
}

export function docPathToScreenshotFilter(pathValue: string): string {
  const normalized = normalizeDocPath(pathValue);
  const parsed = path.posix.parse(normalized);
  const baseName = sanitizeFilename(parsed.name || parsed.base);
  const directory = normalizePath(parsed.dir);
  return directory && directory !== '.' ? normalizePath(path.posix.join(directory, baseName)) : baseName;
}

/**
 * Normalize a prefix string, ensuring it ends with a trailing slash.
 *
 * @param prefix - Prefix to normalize
 * @returns Normalized prefix with trailing slash, or undefined if empty
 */
function normalizePrefix(prefix?: string): string | undefined {
  if (!prefix) return undefined;
  const normalized = normalizePath(prefix).replace(/^\/+/, '');
  if (!normalized) return undefined;
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function trimPrefix(pathValue: string, prefix?: string): string {
  if (!prefix) return pathValue;
  if (pathValue.startsWith(prefix)) {
    const trimmed = pathValue.slice(prefix.length);
    return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  }
  return pathValue;
}

function expandHome(value: string): string {
  if (!value.startsWith('~')) {
    return value;
  }
  const home = os.homedir();
  if (value === '~') {
    return home;
  }
  if (value.startsWith('~/')) {
    return path.join(home, value.slice(2));
  }
  return value;
}

function resolvePathInput(value: string): string {
  const trimmed = value.trim();
  const raw = trimmed.startsWith('file:') ? trimmed.slice('file:'.length) : trimmed;
  const expanded = expandHome(raw);
  return path.isAbsolute(expanded) ? expanded : path.resolve(process.cwd(), expanded);
}

function resolveFileSpecifier(specifier: string, baseDir: string): string {
  const raw = specifier.startsWith('file:') ? specifier.slice('file:'.length) : specifier;
  const expanded = expandHome(raw);
  return path.isAbsolute(expanded) ? expanded : path.resolve(baseDir, expanded);
}

function isTarballPath(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.endsWith('.tgz') || lower.endsWith('.tar.gz');
}

function isCommandAvailable(command: string): boolean {
  const result = spawnSync(`command -v ${command}`, {
    shell: true,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function getHarnessSuperdocDependency(): string | null {
  const harnessPkgPath = path.resolve(process.cwd(), 'packages/harness/package.json');
  if (!fs.existsSync(harnessPkgPath)) {
    return null;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(harnessPkgPath, 'utf8'));
    return pkg.dependencies?.superdoc ?? null;
  } catch {
    return null;
  }
}

function resolveLocalRepoFromTarball(tarballPath: string): string | null {
  const packageDir = path.dirname(tarballPath);
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    if (path.basename(packageDir) === 'superdoc' && path.basename(path.dirname(packageDir)) === 'packages') {
      return path.dirname(path.dirname(packageDir));
    }
    return packageDir;
  }
  return null;
}

function resolveWordTarget(targetVersion?: string): WordTarget {
  if (targetVersion) {
    if (isPathLikeVersion(targetVersion)) {
      const resolved = resolvePathInput(targetVersion);
      if (!fs.existsSync(resolved)) {
        return { mode: 'skip', reason: `Local path not found: ${resolved}` };
      }
      if (isTarballPath(resolved)) {
        return { mode: 'skip', reason: `Tarball paths are not supported for Word compare: ${resolved}` };
      }
      return { mode: 'local', value: resolved };
    }
    return { mode: 'version', value: targetVersion.trim() };
  }

  const spec = getHarnessSuperdocDependency();
  if (spec && spec.startsWith('file:')) {
    const harnessDir = path.resolve(process.cwd(), 'packages/harness');
    const resolved = resolveFileSpecifier(spec, harnessDir);
    if (!fs.existsSync(resolved)) {
      return { mode: 'skip', reason: `Local path not found: ${resolved}` };
    }
    if (isTarballPath(resolved)) {
      const repoRoot = resolveLocalRepoFromTarball(resolved);
      if (!repoRoot) {
        return { mode: 'skip', reason: `Could not resolve repo root from tarball: ${resolved}` };
      }
      return { mode: 'local', value: repoRoot };
    }
    return { mode: 'local', value: resolved };
  }

  const installedVersion = getSuperdocVersion();
  if (!installedVersion || installedVersion === 'unknown') {
    return { mode: 'skip', reason: 'Unable to determine installed SuperDoc version.' };
  }
  return { mode: 'version', value: installedVersion };
}

function sanitizePathPart(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'document';
}

function sanitizeReportLabel(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'document';
}

function makeDocxOutputName(docPath: string, rootDir?: string): string {
  let basePath: string | null = null;
  if (rootDir) {
    const relative = path.relative(rootDir, docPath);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      basePath = relative;
    }
  }

  if (!basePath) {
    const parent = path.basename(path.dirname(docPath)) || 'documents';
    const stem = path.basename(docPath, path.extname(docPath)) || 'document';
    const safeParent = sanitizeReportLabel(parent) || 'documents';
    const safeStem = sanitizeReportLabel(stem) || 'document';
    const hash = createHash('md5').update(docPath).digest('hex').slice(0, 6);
    return `${safeParent}__${safeStem}__${hash}`;
  }

  const ext = path.extname(basePath);
  const withoutExt = ext ? basePath.slice(0, -ext.length) : basePath;
  const normalized = normalizePath(withoutExt);
  const name = normalized
    .replace(/[\\/]+/g, '__')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return name || path.basename(docPath, path.extname(docPath));
}

function makeDocxOutputPath(docxPath: string, rootDir?: string): string {
  if (rootDir) {
    const relative = path.relative(rootDir, docxPath);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      const parts = normalizePath(relative).split('/');
      if (parts.length > 0) {
        const lastIndex = parts.length - 1;
        parts[lastIndex] = path.basename(parts[lastIndex], path.extname(parts[lastIndex]));
      }
      return parts.map(sanitizePathPart).join('/');
    }
  }

  const baseDir = path.basename(path.dirname(docxPath)) || 'documents';
  const stem = path.basename(docxPath, path.extname(docxPath)) || 'document';
  return `${sanitizePathPart(baseDir)}__${sanitizePathPart(stem)}`;
}

function findNewestDirWithPrefix(rootDir: string, prefix: string): string | null {
  if (!fs.existsSync(rootDir)) return null;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  let newest: string | null = null;
  let newestTime = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const fullPath = path.join(rootDir, entry.name);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs > newestTime) {
      newestTime = stat.mtimeMs;
      newest = fullPath;
    }
  }

  return newest;
}

async function listCorpusDocuments(provider: CorpusProvider): Promise<DocumentInfo[]> {
  const docs = await provider.listDocs({ filters: [], matches: [], excludes: [] });
  const items: DocumentInfo[] = [];

  for (const doc of docs) {
    const relativePath = buildDocRelativePath(doc);
    const ext = path.extname(doc.filename).toLowerCase();
    if (ext !== '.docx') continue;

    const baseName = sanitizeFilename(path.basename(doc.filename, ext));
    items.push({
      relativePath,
      baseName,
      doc_id: doc.doc_id,
      doc_rev: doc.doc_rev,
    });
  }

  return items;
}

async function buildDocumentInfoMap(provider: CorpusProvider): Promise<Map<string, DocumentInfo>> {
  const docs = await listCorpusDocuments(provider);
  const map = new Map<string, DocumentInfo>();

  for (const doc of docs) {
    const relativeDir = normalizePath(path.dirname(doc.relativePath));
    const key = relativeDir === '.' ? doc.baseName : normalizePath(path.join(relativeDir, doc.baseName));
    map.set(key, doc);
  }

  return map;
}

function extractAssetPath(relativePath: string, resultsFolderName: string, resultsPrefix?: string): string {
  const normalized = normalizePath(relativePath);
  const folderPrefix = resultsFolderName ? `${resultsFolderName}/` : '';
  let assetPath = normalized.startsWith(folderPrefix) ? normalized.slice(folderPrefix.length) : normalized;
  const normalizedPrefix = normalizePrefix(resultsPrefix);
  assetPath = trimPrefix(assetPath, normalizedPrefix);
  return assetPath;
}

function deriveMissingBaselineDocFilters(
  report: ComparisonReport,
  resultsFolderName: string,
  resultsPrefix: string | undefined,
  browser?: BrowserName,
): string[] {
  const filters = new Set<string>();

  for (const result of report.results) {
    if (result.reason !== 'missing_in_baseline') continue;
    const assetPath = extractAssetPath(result.relativePath, resultsFolderName, resultsPrefix);
    const normalized = normalizePath(assetPath);
    let docKey = path.posix.dirname(normalized);
    if (!docKey || docKey === '.') continue;
    if (browser && docKey.startsWith(`${browser}/`)) {
      docKey = docKey.slice(browser.length + 1);
    }
    if (docKey && docKey !== '.') {
      filters.add(docKey);
    }
  }

  return Array.from(filters);
}

function readStoryMetadata(filePath: string): StoryMetadataFile | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as StoryMetadataFile;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function getInteractionMetadata(
  relativePath: string,
  resultsFolderName: string,
  resultsPrefix: string | undefined,
  resultsFolder: string,
  baselineFolder: string,
  cache: Map<string, StoryMetadataFile | null>,
): InteractionMetadata | undefined {
  const assetPath = extractAssetPath(relativePath, resultsFolderName, resultsPrefix);
  const normalized = normalizePath(assetPath);
  const storyDir = path.posix.dirname(normalized);
  const fileName = path.posix.basename(normalized);
  if (!storyDir || storyDir === '.') return undefined;

  let meta = cache.get(storyDir) ?? null;
  if (!cache.has(storyDir)) {
    const normalizedPrefix = normalizePrefix(resultsPrefix) ?? '';
    const resultsMetaPath = path.join(resultsFolder, normalizedPrefix, storyDir, '_story.json');
    const baselineMetaPath = path.join(baselineFolder, storyDir, '_story.json');
    meta = readStoryMetadata(resultsMetaPath) ?? readStoryMetadata(baselineMetaPath);
    cache.set(storyDir, meta);
  }

  if (!meta) return undefined;
  const milestone = meta.milestones?.[fileName];
  return {
    storyName: meta.name,
    storyDescription: meta.description,
    milestoneLabel: milestone?.label,
    milestoneDescription: milestone?.description,
  };
}

function parseDocKeyAndPage(
  relativePath: string,
  resultsFolderName: string,
  resultsPrefix?: string,
): { docKey: string; pageIndex: number; pageToken: string } | null {
  const assetPath = extractAssetPath(relativePath, resultsFolderName, resultsPrefix);
  const normalized = normalizePath(assetPath);
  const docKey = path.posix.dirname(normalized);
  const fileName = path.posix.basename(normalized);
  const match = fileName.match(/^p(\d+)\.png$/i);
  if (!match) return null;
  const pageIndex = Number.parseInt(match[1], 10);
  if (!Number.isFinite(pageIndex)) return null;
  const pageToken = `p${String(pageIndex).padStart(3, '0')}`;
  return { docKey, pageIndex, pageToken };
}

function toWordDeepLink(localPath: string): string | undefined {
  if (process.platform !== 'darwin') return undefined;
  return `ms-word:ofe|u|${pathToFileURL(localPath).href}`;
}

function resolveWordOpenStagingDir(): string | undefined {
  if (process.platform !== 'darwin') return undefined;
  const custom = (process.env[WORD_OPEN_STAGING_ENV] ?? '').trim();
  if (custom) {
    return path.resolve(custom);
  }
  return WORD_OPEN_STAGING_DEFAULT;
}

function stageDocForWordOpen(localPath: string, identity: string): string {
  const stagingDir = resolveWordOpenStagingDir();
  if (!stagingDir) return localPath;

  const digest = createHash('sha1').update(identity).digest('hex').slice(0, 20);
  const stagedPath = path.join(stagingDir, `${digest}.docx`);
  fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
  fs.copyFileSync(localPath, stagedPath);
  return stagedPath;
}

async function buildDocumentKeyMap(provider: CorpusProvider): Promise<Map<string, string>> {
  const docs = await listCorpusDocuments(provider);
  const map = new Map<string, string>();

  for (const doc of docs) {
    const relativeDir = path.dirname(doc.relativePath);
    const key = relativeDir === '.' ? doc.baseName : path.join(relativeDir, doc.baseName);
    map.set(key, doc.relativePath);
  }

  return map;
}

export async function findMissingDocuments(
  baselineFolder: string,
  resultsFolder: string,
  filters?: string[],
  matches?: string[],
  excludes?: string[],
  providerOptions?: { mode: StorageMode; docsDir?: string },
): Promise<{ missingDocs: string[]; unknownKeys: string[] }> {
  const baselineFiles = findPngFiles(baselineFolder).filter((relativePath) =>
    matchesFilter(relativePath, filters, matches, excludes),
  );
  const resultFiles = new Set(
    findPngFiles(resultsFolder).filter((relativePath) => matchesFilter(relativePath, filters, matches, excludes)),
  );

  const missingDocKeys = new Set<string>();
  for (const relativePath of baselineFiles) {
    if (!resultFiles.has(relativePath)) {
      missingDocKeys.add(path.dirname(relativePath));
    }
  }

  const provider = await createCorpusProvider(providerOptions);
  const docKeyMap = await buildDocumentKeyMap(provider);
  const missingDocs: string[] = [];
  const unknownKeys: string[] = [];

  for (const key of missingDocKeys) {
    const docPath = docKeyMap.get(key);
    if (docPath) {
      missingDocs.push(docPath);
    } else {
      unknownKeys.push(key);
    }
  }

  missingDocs.sort();
  unknownKeys.sort();
  return { missingDocs, unknownKeys };
}

type WordBaselineIndex = Map<string, { relativePath: string; pages: string[] }>;

async function downloadWordBaselinesForReport(
  report: ComparisonReport,
  options: {
    resultsPrefix?: string;
    providerOptions?: { mode: StorageMode; docsDir?: string };
  },
): Promise<WordBaselineIndex> {
  const provider = await createCorpusProvider(options.providerOptions);
  try {
    const docInfoMap = await buildDocumentInfoMap(provider);
    const docKeys = new Set<string>();

    for (const item of report.results) {
      const parsed = parseDocKeyAndPage(item.relativePath, report.resultsFolder, options.resultsPrefix);
      if (parsed) {
        docKeys.add(parsed.docKey);
      }
    }

    const docPaths = new Map<string, string>();
    for (const docKey of docKeys) {
      const docInfo = docInfoMap.get(docKey);
      if (docInfo) {
        docPaths.set(docKey, docInfo.relativePath);
      }
    }

    if (docPaths.size === 0) {
      return new Map();
    }

    return await downloadWordBaselines({ docPaths });
  } finally {
    await provider?.close?.();
  }
}

async function augmentReportWithSourceDocs(
  report: ComparisonReport,
  options: {
    resultsPrefix?: string;
    resultsFolderName?: string;
    providerOptions?: { mode: StorageMode; docsDir?: string };
    wordBaselineIndex?: WordBaselineIndex;
  },
): Promise<ComparisonReport> {
  const diffResults = report.results.filter((item) => !item.passed);
  if (diffResults.length === 0) {
    return report;
  }

  let provider: CorpusProvider | null = null;
  try {
    provider = await createCorpusProvider(options.providerOptions);
    const docInfoMap = await buildDocumentInfoMap(provider);
    const sourceDocByKey = new Map<string, SourceDocMetadata | null>();

    for (const item of diffResults) {
      const parsed = parseDocKeyAndPage(item.relativePath, report.resultsFolder, options.resultsPrefix);
      if (!parsed) continue;
      const { docKey } = parsed;
      if (sourceDocByKey.has(docKey)) continue;

      const docInfo = docInfoMap.get(docKey);
      if (!docInfo) {
        sourceDocByKey.set(docKey, null);
        continue;
      }

      try {
        const localPath = await provider.fetchDoc(docInfo.doc_id, docInfo.doc_rev);
        let openPath = localPath;
        try {
          openPath = stageDocForWordOpen(localPath, `${docInfo.relativePath}:${docInfo.doc_rev}`);
        } catch (error) {
          console.warn(
            colors.warning(
              `Unable to stage doc for Word open (${docInfo.relativePath}): ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          );
        }

        sourceDocByKey.set(docKey, {
          relativePath: docInfo.relativePath,
          originalLocalPath: localPath,
          localPath: openPath,
          wordUrl: toWordDeepLink(openPath),
        });
      } catch (error) {
        sourceDocByKey.set(docKey, null);
        console.warn(
          colors.warning(
            `Skipping source doc metadata for ${docKey}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    }

    if (sourceDocByKey.size === 0) {
      return report;
    }

    const wordIndex = options.wordBaselineIndex;
    const resultsRoot = options.resultsFolderName
      ? path.resolve(process.cwd(), RESULTS_DIR, options.resultsFolderName)
      : null;

    if (wordIndex && wordIndex.size > 0 && resultsRoot) {
      for (const [docKey, sourceDoc] of sourceDocByKey.entries()) {
        if (!sourceDoc) continue;
        const wordEntry = wordIndex.get(docKey);
        if (!wordEntry || wordEntry.pages.length === 0) continue;

        const overlayDir = path.join(resultsRoot, 'word-overlays', docKey);
        fs.mkdirSync(overlayDir, { recursive: true });

        const relativePaths: string[] = [];
        for (const pagePath of wordEntry.pages) {
          const fileName = path.basename(pagePath);
          const dest = path.join(overlayDir, fileName);
          fs.copyFileSync(pagePath, dest);
          relativePaths.push(normalizePath(path.relative(resultsRoot, dest)));
        }

        sourceDoc.wordOverlayPages = relativePaths;
      }
    }

    for (const item of report.results) {
      const parsed = parseDocKeyAndPage(item.relativePath, report.resultsFolder, options.resultsPrefix);
      if (!parsed) continue;
      const sourceDoc = sourceDocByKey.get(parsed.docKey);
      if (sourceDoc) {
        item.sourceDoc = sourceDoc;
      }
    }

    return report;
  } catch (error) {
    console.warn(
      colors.warning(
        `Skipping source doc metadata enrichment: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return report;
  } finally {
    await provider?.close?.();
  }
}

async function fillMissingDocs(
  resultsFolderName: string,
  baselineFolder: string,
  filters: string[],
  matches: string[],
  excludes: string[],
  browser: BrowserName,
  scaleFactor: number | undefined,
  providerOptions: { mode: StorageMode; docsDir?: string },
  storageArgs: string[],
): Promise<void> {
  const resolvedBaselineFolder = resolveBaselineFolderForBrowser(baselineFolder, browser);
  const resultsFolder = path.join(SCREENSHOTS_DIR, resultsFolderName, browser);
  const { missingDocs, unknownKeys } = await findMissingDocuments(
    resolvedBaselineFolder,
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
    await runGenerate({
      outputFolder: resultsFolderName,
      filters: [],
      matches: [],
      excludes,
      docs: missingDocs,
      append: true,
      browser,
      scaleFactor,
      storageArgs,
    });
  }
}

/**
 * Extract version from a results folder name.
 * e.g., "2026-01-09-14-52-06-v.1.4.0" → "v.1.4.0"
 */
export function extractVersionFromFolder(folderName: string): string | null {
  // Match: DATE-v.VERSION pattern
  const match = folderName.match(/-v\.(.+)$/);
  if (match) {
    return `v.${match[1]}`;
  }
  return null;
}

/**
 * Find the latest results folder in screenshots directory.
 */
export function findLatestResultsFolder(screenshotsDir: string = SCREENSHOTS_DIR): string | null {
  if (!fs.existsSync(screenshotsDir)) {
    return null;
  }

  const entries = fs.readdirSync(screenshotsDir, { withFileTypes: true });
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .filter((name) => extractVersionFromFolder(name) !== null)
    .sort()
    .reverse(); // Latest first (lexicographic sort works for our date format)

  return folders.length > 0 ? folders[0] : null;
}

/**
 * Find all baseline versions available.
 */
export function findBaselineVersions(baselinesDir: string = BASELINES_DIR): string[] {
  if (!fs.existsSync(baselinesDir)) {
    return [];
  }

  const entries = fs.readdirSync(baselinesDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith('v.'))
    .map((e) => e.name)
    .sort()
    .reverse(); // Latest first
}

/**
 * Find the latest baseline version.
 */
export function findLatestBaseline(baselinesDir: string = BASELINES_DIR): string | null {
  const versions = findBaselineVersions(baselinesDir);
  return versions.length > 0 ? versions[0] : null;
}

async function resolveBaselineSelection(
  baselinePrefix: string,
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
    mode === 'local' ? findLatestBaselineLocal(baselineRoot) : await getLatestBaselineVersion(baselinePrefix);
  if (!latest) {
    return null;
  }
  return { label: latest, spec: normalizeVersionSpecifier(latest) };
}

function resolveBaselineRoot(baselinePrefix: string, mode: StorageMode, baselineRoot?: string): string {
  if (baselineRoot) {
    return resolvePathInput(baselineRoot);
  }
  return getBaselineLocalRootForMode(mode, baselinePrefix);
}

/**
 * Find all PNG files in a directory recursively.
 */
export function findPngFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) {
          walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.png')) {
        files.push(path.relative(dir, fullPath));
      }
    }
  }

  walk(dir);
  return files.sort();
}

/**
 * Compare two PNG images and optionally generate a diff image.
 */
export function compareImages(
  baselinePath: string,
  resultPath: string,
  diffPath?: string,
  threshold: number = 0,
  resultsRoot: string = SCREENSHOTS_DIR,
): ImageCompareResult {
  const relativePath = path.relative(resultsRoot, resultPath);

  // Read images
  const baselineData = fs.readFileSync(baselinePath);
  const resultData = fs.readFileSync(resultPath);

  const baselinePng = PNG.sync.read(baselineData);
  const resultPng = PNG.sync.read(resultData);

  // Check dimensions match
  if (baselinePng.width !== resultPng.width || baselinePng.height !== resultPng.height) {
    return {
      relativePath,
      passed: false,
      diffPixels: -1,
      totalPixels: baselinePng.width * baselinePng.height,
      diffPercent: 100,
      reason: 'dimension_mismatch',
    };
  }

  const { width, height } = baselinePng;
  const totalPixels = width * height;

  // Create diff image buffer
  const diffPng = new PNG({ width, height });

  // Compare pixels
  const diffPixels = pixelmatch(
    baselinePng.data,
    resultPng.data,
    diffPng.data,
    width,
    height,
    { threshold: 0.05 }, // pixelmatch's internal threshold for anti-aliasing
  );

  const diffPercent = (diffPixels / totalPixels) * 100;
  const passed = diffPercent <= threshold;

  // Write diff image if there are differences and path provided
  if (diffPath && diffPixels > 0) {
    const diffDir = path.dirname(diffPath);
    fs.mkdirSync(diffDir, { recursive: true });
    fs.writeFileSync(diffPath, PNG.sync.write(diffPng));
  }

  return {
    relativePath,
    passed,
    diffPixels,
    totalPixels,
    diffPercent,
    diffPath: diffPixels > 0 ? diffPath : undefined,
    reason: passed ? undefined : 'pixel_diff',
  };
}

/**
 * Generate a diff image for a missing page.
 * - For pages missing in results: shows baseline with red overlay
 * - For pages missing in baseline: shows result with blue overlay
 */
export function generateMissingPageDiff(
  imagePath: string,
  diffPath: string,
  type: 'missing_in_results' | 'missing_in_baseline',
  resultsRoot: string = SCREENSHOTS_DIR,
): ImageCompareResult {
  const relativePath = path.relative(resultsRoot, imagePath).replace(/^\.\.\/baselines\/[^/]+\//, ''); // Normalize baseline paths

  // Read the source image
  const imageData = fs.readFileSync(imagePath);
  const sourcePng = PNG.sync.read(imageData);
  const { width, height } = sourcePng;
  const totalPixels = width * height;

  // Create diff image with colored overlay
  const diffPng = new PNG({ width, height });

  // Color based on type:
  // - missing_in_results (page was removed): red overlay
  // - missing_in_baseline (new page): blue overlay
  const overlayColor =
    type === 'missing_in_results'
      ? { r: 255, g: 0, b: 0 } // Red for removed pages
      : { r: 0, g: 100, b: 255 }; // Blue for new pages

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4;

      // Get original pixel
      const r = sourcePng.data[idx];
      const g = sourcePng.data[idx + 1];
      const b = sourcePng.data[idx + 2];
      const a = sourcePng.data[idx + 3];

      // Blend with overlay color (50% opacity)
      diffPng.data[idx] = Math.round(r * 0.5 + overlayColor.r * 0.5);
      diffPng.data[idx + 1] = Math.round(g * 0.5 + overlayColor.g * 0.5);
      diffPng.data[idx + 2] = Math.round(b * 0.5 + overlayColor.b * 0.5);
      diffPng.data[idx + 3] = a;
    }
  }

  // Write diff image
  const diffDir = path.dirname(diffPath);
  fs.mkdirSync(diffDir, { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(diffPng));

  return {
    relativePath,
    passed: false,
    diffPixels: totalPixels,
    totalPixels,
    diffPercent: 100,
    diffPath,
    reason: type,
  };
}

/**
 * Run comparison between results folder and baseline.
 */
export async function runComparison(
  resultsFolderName: string,
  options: CompareOptions = {},
): Promise<ComparisonReport> {
  const {
    threshold = 0.05,
    generateDiffs = true,
    baselineVersion,
    filters,
    matches,
    excludes,
    baselineRoot = BASELINES_DIR,
    resultsRoot = SCREENSHOTS_DIR,
    resultsPrefix,
    browser,
    outputFolderName,
    ignorePrefixes = [],
  } = options;

  const resultsFolder = path.join(resultsRoot, resultsFolderName);
  const initialNormalizedResultsPrefix = normalizePrefix(resultsPrefix);
  const reportMode = options.reportOptions?.mode ?? options.reportOptions?.reportMode;
  const reportAll = Boolean(options.reportOptions?.showAll);
  const isInteractionsRun = reportMode === 'interactions' || initialNormalizedResultsPrefix === 'interactions/';
  const includeInteractionMeta = isInteractionsRun;
  let normalizedResultsPrefix = initialNormalizedResultsPrefix;
  const normalizedIgnorePrefixes = ignorePrefixes
    .map((prefix) => normalizePrefix(prefix))
    .filter((prefix): prefix is string => Boolean(prefix));
  const shouldIgnore = (relativePath: string): boolean =>
    normalizedIgnorePrefixes.some((prefix) => relativePath.startsWith(prefix));
  let baselineHasAnyBrowser = false;
  let resultsHasAnyBrowser = false;
  let baselineBrowserPrefix: string | undefined;
  let resultsBrowserPrefix: string | undefined;

  // Determine baseline version to use
  let version: string;
  if (baselineVersion) {
    // Use specified baseline version
    version = baselineVersion.startsWith('v.') ? baselineVersion : `v.${baselineVersion}`;
  } else {
    // Find latest baseline
    const latestBaseline = findLatestBaseline(baselineRoot);
    if (!latestBaseline) {
      throw new Error('No baselines found. Run "pnpm baseline" first.');
    }
    version = latestBaseline;
  }

  const baselineFolder = path.join(baselineRoot, version);

  if (!fs.existsSync(baselineFolder)) {
    const available = findBaselineVersions(baselineRoot);
    const availableStr = available.length > 0 ? `Available: ${available.join(', ')}` : 'No baselines found.';
    throw new Error(`No baseline found for version ${version}. ${availableStr}`);
  }

  if (!fs.existsSync(resultsFolder)) {
    throw new Error(`Results folder not found: ${resultsFolder}`);
  }

  if (browser) {
    const prefixDir = normalizedResultsPrefix ? normalizedResultsPrefix.replace(/\/$/, '') : '';
    const baselineHasBrowser = fs.existsSync(path.join(baselineFolder, browser));
    baselineHasAnyBrowser = BROWSER_NAMES.some((name) => fs.existsSync(path.join(baselineFolder, name)));
    const resultsHasBrowser = fs.existsSync(path.join(resultsFolder, prefixDir, browser));
    resultsHasAnyBrowser = BROWSER_NAMES.some((name) => fs.existsSync(path.join(resultsFolder, prefixDir, name)));
    const baselineIsLegacy = browser === 'chromium' && !baselineHasAnyBrowser;
    const resultsAreLegacy = browser === 'chromium' && !resultsHasAnyBrowser;

    if (browser !== 'chromium' && !baselineHasAnyBrowser) {
      throw new Error(`Baseline layout has no browser folders. Regenerate baselines with --browser ${browser}.`);
    }

    if (browser !== 'chromium' && !resultsHasAnyBrowser) {
      throw new Error(`Results layout has no browser folders. Regenerate results with --browser ${browser}.`);
    }

    if (baselineHasAnyBrowser && !baselineHasBrowser) {
      throw new Error(`Baseline for browser "${browser}" not found in ${baselineFolder}.`);
    }

    if (resultsHasAnyBrowser && !resultsHasBrowser) {
      throw new Error(`Results for browser "${browser}" not found in ${resultsFolder}.`);
    }

    if (baselineIsLegacy && !resultsAreLegacy) {
      if (!resultsHasBrowser) {
        throw new Error(
          `Results for browser "${browser}" not found in ${resultsFolder}. ` +
            `Legacy baselines can only be used with ${browser} results.`,
        );
      }
      const prefixBase = normalizedResultsPrefix ?? '';
      normalizedResultsPrefix = normalizePrefix(`${prefixBase}${browser}/`);
      console.warn(colors.warning('Using legacy baseline layout (no browser folder). Assuming chromium.'));
    }

    if (!baselineIsLegacy && resultsAreLegacy) {
      throw new Error(
        `Results appear to use legacy layout (no browser folders). ` + `Regenerate results with --browser ${browser}.`,
      );
    }

    if (baselineHasAnyBrowser) {
      baselineBrowserPrefix = `${browser}/`;
    }

    if (resultsHasAnyBrowser) {
      const prefixBase = normalizedResultsPrefix ?? '';
      resultsBrowserPrefix = prefixBase.endsWith(`${browser}/`) ? prefixBase : `${prefixBase}${browser}/`;
    }
  }

  // Find all PNG files in both directories
  let baselineEntries = findPngFiles(baselineFolder)
    .map((relativePath) => normalizePath(relativePath))
    .filter((relativePath) => !shouldIgnore(relativePath))
    .map((relativePath) => {
      const normalized = relativePath;
      return { relativePath: normalized, key: normalized };
    });
  let resultEntries = findPngFiles(resultsFolder)
    .map((relativePath) => normalizePath(relativePath))
    .filter((relativePath) => !shouldIgnore(relativePath))
    .map((relativePath) => {
      const normalized = relativePath;
      return {
        relativePath: normalized,
        key: trimPrefix(normalized, normalizedResultsPrefix),
      };
    })
    .filter((entry) => (normalizedResultsPrefix ? entry.relativePath.startsWith(normalizedResultsPrefix) : true));

  if (baselineBrowserPrefix) {
    baselineEntries = baselineEntries.filter((entry) => entry.relativePath.startsWith(baselineBrowserPrefix));
  }
  if (resultsBrowserPrefix) {
    resultEntries = resultEntries.filter((entry) => entry.relativePath.startsWith(resultsBrowserPrefix));
  }

  const resultKeyBrowserPrefix = resultsHasAnyBrowser && browser ? `${browser}/` : undefined;

  // Apply filter if specified
  if ((filters && filters.length > 0) || (matches && matches.length > 0) || (excludes && excludes.length > 0)) {
    baselineEntries = baselineEntries.filter((entry) =>
      matchesFilterWithBrowserPrefix(entry.key, baselineBrowserPrefix, filters, matches, excludes),
    );
    resultEntries = resultEntries.filter((entry) =>
      matchesFilterWithBrowserPrefix(entry.key, resultKeyBrowserPrefix, filters, matches, excludes),
    );

    // Warn if filters matched nothing
    if (baselineEntries.length === 0 && resultEntries.length === 0) {
      const filterDesc = [
        filters?.length ? `--filter: ${filters.join(', ')}` : '',
        matches?.length ? `--match: ${matches.join(', ')}` : '',
        excludes?.length ? `--exclude: ${excludes.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; ');
      console.warn(colors.warning(`Warning: No files matched the filter criteria (${filterDesc})`));
      console.warn(
        colors.warning(`  Tip: --filter matches path prefixes, --match matches substrings anywhere in the path`),
      );
    }
  }

  const baselineFiles = new Map<string, string>();
  baselineEntries.forEach((entry) => {
    if (!baselineFiles.has(entry.key)) {
      baselineFiles.set(entry.key, entry.relativePath);
    }
  });

  const resultFiles = new Map<string, string>();
  resultEntries.forEach((entry) => {
    if (!resultFiles.has(entry.key)) {
      resultFiles.set(entry.key, entry.relativePath);
    }
  });

  // Create output directory for this comparison run
  const resolvedOutputFolderName = outputFolderName ?? resultsFolderName;
  const outputFolder = path.join(RESULTS_DIR, resolvedOutputFolderName);
  if (fs.existsSync(outputFolder)) {
    if (isInteractionsRun) {
      const interactionsOutput = path.join(outputFolder, 'interactions');
      if (fs.existsSync(interactionsOutput)) {
        fs.rmSync(interactionsOutput, { recursive: true });
      }
    } else {
      fs.rmSync(outputFolder, { recursive: true });
    }
  }
  fs.mkdirSync(outputFolder, { recursive: true });

  const results: ImageCompareResult[] = [];
  let passed = 0;
  let failed = 0;
  let missingInBaseline = 0;
  let missingInResults = 0;
  const interactionMetaCache = new Map<string, StoryMetadataFile | null>();

  const attachInteractionMeta = (result: ImageCompareResult): void => {
    if (!includeInteractionMeta) return;
    const meta = getInteractionMetadata(
      result.relativePath,
      resultsFolderName,
      resultsPrefix,
      resultsFolder,
      baselineFolder,
      interactionMetaCache,
    );
    if (meta) {
      result.interaction = meta;
    }
  };

  // Helper to track current document and log failures grouped by document
  let currentDoc = '';
  const logDocHeader = (relativePath: string) => {
    const docDir = path.dirname(relativePath);
    if (docDir !== currentDoc) {
      currentDoc = docDir;
      console.log(colors.muted(`  ${docDir}`));
    }
  };

  // Compare files that exist in results
  for (const [key, relativePath] of resultFiles.entries()) {
    const resultPath = path.join(resultsFolder, relativePath);
    const baselineRelativePath = baselineFiles.get(key);
    const bundlePaths = generateDiffs || reportAll ? buildDiffBundlePaths(outputFolder, relativePath) : null;

    if (!baselineRelativePath) {
      // New page (exists in results but not baseline)
      missingInBaseline++;
      failed++;

      if (generateDiffs || reportAll) {
        const result = generateMissingPageDiff(resultPath, bundlePaths!.diffPath, 'missing_in_baseline', resultsRoot);
        attachInteractionMeta(result);
        results.push(result);
        copyArtifactImage(resultPath, bundlePaths!.actualPath);
        logDocHeader(relativePath);
        console.log(colors.warning(`    ✗ ${path.basename(relativePath)} (NEW PAGE - not in baseline)`));
      } else {
        logDocHeader(relativePath);
        console.log(colors.warning(`    ⚠ ${path.basename(relativePath)} (missing in baseline)`));
      }
      continue;
    }

    const baselinePath = path.join(baselineFolder, baselineRelativePath);
    const diffPath = generateDiffs ? bundlePaths!.diffPath : undefined;

    const result = compareImages(baselinePath, resultPath, diffPath, threshold, resultsRoot);
    attachInteractionMeta(result);
    results.push(result);

    if (result.passed) {
      passed++;
      if (reportAll && bundlePaths) {
        copyArtifactImage(baselinePath, bundlePaths.baselinePath);
        copyArtifactImage(resultPath, bundlePaths.actualPath);
      }
      // Don't log passing pages - only log failures
    } else {
      failed++;
      if (generateDiffs || reportAll) {
        copyArtifactImage(baselinePath, bundlePaths!.baselinePath);
        copyArtifactImage(resultPath, bundlePaths!.actualPath);
      }
      logDocHeader(relativePath);
      console.log(colors.error(`    ✗ ${path.basename(relativePath)} (${result.diffPercent.toFixed(2)}% diff)`));
    }
  }

  // Check for files missing in results (pages that were removed)
  for (const [key, relativePath] of baselineFiles.entries()) {
    if (!resultFiles.has(key)) {
      missingInResults++;
      failed++;

      const expectedResultPath = normalizedResultsPrefix ? `${normalizedResultsPrefix}${key}` : key;
      if (generateDiffs || reportAll) {
        const baselinePath = path.join(baselineFolder, relativePath);
        const bundlePaths = buildDiffBundlePaths(outputFolder, expectedResultPath);
        const result = generateMissingPageDiff(baselinePath, bundlePaths.diffPath, 'missing_in_results', resultsRoot);
        result.relativePath = normalizePath(path.join(resultsFolderName, expectedResultPath));
        attachInteractionMeta(result);
        results.push(result);
        copyArtifactImage(baselinePath, bundlePaths.baselinePath);
        logDocHeader(expectedResultPath);
        console.log(colors.warning(`    ✗ ${path.basename(expectedResultPath)} (REMOVED - not in results)`));
      } else {
        logDocHeader(relativePath);
        console.log(colors.warning(`    ⚠ ${path.basename(relativePath)} (missing in results)`));
      }
    }
  }

  const report: ComparisonReport = {
    resultsFolder: resultsFolderName,
    baselineFolder: version,
    threshold,
    timestamp: new Date().toISOString(),
    results,
    summary: {
      passed,
      failed,
      missingInBaseline,
      missingInResults,
      total: results.length,
    },
  };

  const reportPath = path.join(outputFolder, REPORT_FILE);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  writeHtmlReport(report, outputFolder, options.reportOptions);

  return report;
}

async function runExternalCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: 'inherit',
      shell: false,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'} (${signal ?? 'no signal'})`));
      }
    });
  });
}

function findNewestRunDirectory(comparisonsDir: string, candidates: string[]): string | null {
  if (candidates.length === 0) {
    return null;
  }

  let newest: string | null = null;
  let newestTime = -1;
  for (const entry of candidates) {
    const fullPath = path.join(comparisonsDir, entry);
    if (!fs.existsSync(fullPath)) continue;
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) continue;
    const mtime = stat.mtimeMs;
    if (mtime > newestTime) {
      newestTime = mtime;
      newest = entry;
    }
  }

  return newest;
}

async function runWordBenchmark(inputDir: string, target: WordTarget, outputRoot: string): Promise<string | null> {
  if (target.mode === 'skip') {
    console.warn(colors.warning(`Skipping Word compare: ${target.reason}`));
    return null;
  }

  const comparisonsDir = path.join(outputRoot, 'reports', 'comparisons');
  const existingRuns = fs.existsSync(comparisonsDir) ? new Set(fs.readdirSync(comparisonsDir)) : new Set<string>();

  const args = ['compare', inputDir];
  if (target.mode === 'local') {
    args.push('--superdoc-local', target.value);
  } else {
    args.push('--superdoc-version', target.value);
  }

  const env = {
    ...process.env,
    SUPERDOC_BENCHMARK_SKIP_UPDATE_CHECK: '1',
  };

  await runExternalCommand('superdoc-benchmark', args, { cwd: outputRoot, env });

  if (!fs.existsSync(comparisonsDir)) {
    return null;
  }

  const allRuns = fs.readdirSync(comparisonsDir);
  const newRuns = allRuns.filter((entry) => !existingRuns.has(entry));
  const runName = findNewestRunDirectory(comparisonsDir, newRuns.length > 0 ? newRuns : allRuns);
  if (!runName) {
    return null;
  }

  return path.join(comparisonsDir, runName);
}

/**
 * Copy a Word baseline+actual pair into the results directory and generate a diff image.
 * Returns the relative paths for the word asset set, or null if the diff image was not created.
 */
function copyWordPageAsset(
  baselinePath: string,
  actualPath: string,
  docKey: string,
  pageToken: string,
  resultsRoot: string,
  generateDiff: boolean,
): WordImageSet {
  const destDir = path.join(resultsRoot, 'word', docKey);
  fs.mkdirSync(destDir, { recursive: true });

  const baselineDest = path.join(destDir, `${pageToken}-word.png`);
  const diffDest = path.join(destDir, `${pageToken}-word-diff.png`);
  const actualDest = path.join(destDir, `${pageToken}-word-superdoc.png`);

  fs.copyFileSync(baselinePath, baselineDest);
  fs.copyFileSync(actualPath, actualDest);

  if (generateDiff) {
    compareImages(baselinePath, actualPath, diffDest, 0, resultsRoot);
  }

  const relativeBase = normalizePath(path.relative(resultsRoot, baselineDest));
  const relativeActual = normalizePath(path.relative(resultsRoot, actualDest));
  const relativeDiff = fs.existsSync(diffDest) ? normalizePath(path.relative(resultsRoot, diffDest)) : '';

  return { baseline: relativeBase, diff: relativeDiff, actual: relativeActual };
}

/**
 * Generate Word comparison assets via superdoc-benchmark for a set of documents.
 * Populates the provided `wordAssets` map with results.
 */
async function generateWordAssetsViaBenchmark(options: {
  docKeys: Set<string>;
  pagesByDoc: Map<string, Set<number>>;
  docInfoMap: Map<string, DocumentInfo>;
  provider: CorpusProvider;
  resultsRoot: string;
  targetVersion?: string;
  wordAssets: Map<string, WordImageSet>;
}): Promise<void> {
  const { docKeys, pagesByDoc, docInfoMap, provider, resultsRoot, wordAssets } = options;

  const wordInputDir = path.join(resultsRoot, 'word-input');
  fs.rmSync(wordInputDir, { recursive: true, force: true });
  fs.mkdirSync(wordInputDir, { recursive: true });

  const docPathMap = new Map<string, string>();
  for (const docKey of docKeys) {
    const docInfo = docInfoMap.get(docKey);
    if (!docInfo) {
      console.warn(colors.warning(`Skipping Word compare for missing doc: ${docKey}`));
      continue;
    }
    const localPath = await provider.fetchDoc(docInfo.doc_id, docInfo.doc_rev);
    docInfo.absolutePath = localPath;
    const destination = path.join(wordInputDir, docInfo.relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(localPath, destination);
    docPathMap.set(docKey, destination);
  }

  if (docPathMap.size === 0) return;

  const target = resolveWordTarget(options.targetVersion);
  const outputRoot = path.join(resultsRoot, 'word-benchmark');
  fs.mkdirSync(outputRoot, { recursive: true });

  console.log(colors.info(`🔠 Generating Word comparison assets for ${docPathMap.size} fallback doc(s)...`));
  let runDir: string | null = null;
  try {
    runDir = await runWordBenchmark(wordInputDir, target, outputRoot);
  } catch (error) {
    console.warn(colors.warning(`Word compare failed: ${error instanceof Error ? error.message : String(error)}`));
  }

  const rootForReports = path.dirname(wordInputDir);

  if (runDir) {
    for (const docKey of docKeys) {
      const pages = pagesByDoc.get(docKey);
      const docPath = docPathMap.get(docKey);
      if (!docPath || !pages) continue;
      const docId = makeDocxOutputPath(docPath, rootForReports);
      const docOutputDir = path.join(runDir, docId);

      for (const pageIndex of pages) {
        const pageToken = `p${String(pageIndex).padStart(3, '0')}`;
        const pageBase = `page_${String(pageIndex).padStart(4, '0')}`;
        const baselinePath = path.join(docOutputDir, `${pageBase}-baseline.png`);
        const diffPath = path.join(docOutputDir, `${pageBase}-diff.png`);
        const actualPath = path.join(docOutputDir, `${pageBase}-actual.png`);

        if (!fs.existsSync(baselinePath) || !fs.existsSync(actualPath) || !fs.existsSync(diffPath)) {
          continue;
        }

        const asset = copyWordPageAsset(baselinePath, actualPath, docKey, pageToken, resultsRoot, false);
        // The benchmark already produced a diff — copy it instead of regenerating
        const diffDest = path.join(resultsRoot, 'word', docKey, `${pageToken}-word-diff.png`);
        fs.copyFileSync(diffPath, diffDest);
        asset.diff = normalizePath(path.relative(resultsRoot, diffDest));

        wordAssets.set(`${docKey}/${pageToken}`, asset);
      }
    }
  }

  if (!runDir || wordAssets.size === 0) {
    const reportsRoot = path.join(outputRoot, 'reports');
    const wordCapturesRoot = path.join(reportsRoot, 'word-captures');
    const superdocCapturesRoot = path.join(reportsRoot, 'superdoc-captures');

    for (const docKey of docKeys) {
      const pages = pagesByDoc.get(docKey);
      const docPath = docPathMap.get(docKey);
      if (!docPath || !pages) continue;
      const outputName = makeDocxOutputName(docPath, outputRoot);
      const wordDir = path.join(wordCapturesRoot, outputName);
      const superdocDir = findNewestDirWithPrefix(superdocCapturesRoot, `${outputName}-`);

      if (!fs.existsSync(wordDir) || !superdocDir) continue;

      for (const pageIndex of pages) {
        const pageToken = `p${String(pageIndex).padStart(3, '0')}`;
        const pageBase = `page_${String(pageIndex).padStart(4, '0')}.png`;
        const baselinePath = path.join(wordDir, pageBase);
        const actualPath = path.join(superdocDir, pageBase);

        if (!fs.existsSync(baselinePath) || !fs.existsSync(actualPath)) continue;

        wordAssets.set(
          `${docKey}/${pageToken}`,
          copyWordPageAsset(baselinePath, actualPath, docKey, pageToken, resultsRoot, true),
        );
      }
    }
  }

  fs.rmSync(wordInputDir, { recursive: true, force: true });
  fs.rmSync(outputRoot, { recursive: true, force: true });
}

async function augmentReportWithWord(
  report: ComparisonReport,
  options: {
    resultsFolderName: string;
    resultsPrefix?: string;
    targetVersion?: string;
    providerOptions?: { mode: StorageMode; docsDir?: string };
    wordBaselineIndex?: WordBaselineIndex;
  },
): Promise<ComparisonReport> {
  const diffResults = report.results.filter((item) => !item.passed);
  if (diffResults.length === 0) {
    return report;
  }

  const provider = await createCorpusProvider(options.providerOptions);
  const docInfoMap = await buildDocumentInfoMap(provider);
  const pagesByDoc = new Map<string, Set<number>>();

  for (const item of diffResults) {
    const parsed = parseDocKeyAndPage(item.relativePath, report.resultsFolder, options.resultsPrefix);
    if (!parsed) continue;
    const { docKey, pageIndex } = parsed;
    if (!docInfoMap.has(docKey)) continue;
    if (!pagesByDoc.has(docKey)) {
      pagesByDoc.set(docKey, new Set());
    }
    pagesByDoc.get(docKey)!.add(pageIndex);
  }

  if (pagesByDoc.size === 0) {
    console.warn(colors.warning('Skipping Word compare: no matching docs found.'));
    return report;
  }

  const resultsRoot = path.resolve(process.cwd(), RESULTS_DIR, options.resultsFolderName);
  const wordAssets = new Map<string, WordImageSet>();
  const wordIndex = options.wordBaselineIndex;

  // --- R2 path: use pre-downloaded Word baselines to generate diffs locally ---
  const fallbackDocKeys = new Set<string>();

  if (wordIndex && wordIndex.size > 0) {
    // Pre-build lookup map: "docKey/pageIndex" -> relativePath of the actual screenshot
    const resultByDocPage = new Map<string, string>();
    for (const item of diffResults) {
      const parsed = parseDocKeyAndPage(item.relativePath, report.resultsFolder, options.resultsPrefix);
      if (parsed) {
        resultByDocPage.set(`${parsed.docKey}/${parsed.pageIndex}`, item.relativePath);
      }
    }

    const screenshotsDir = path.resolve(process.cwd(), SCREENSHOTS_DIR);

    for (const [docKey, pages] of pagesByDoc.entries()) {
      const wordEntry = wordIndex.get(docKey);
      if (!wordEntry || wordEntry.pages.length === 0) {
        fallbackDocKeys.add(docKey);
        continue;
      }

      for (const pageIndex of pages) {
        const pageToken = `p${String(pageIndex).padStart(3, '0')}`;
        const wordPagePath = wordEntry.pages[pageIndex - 1];
        if (!wordPagePath || !fs.existsSync(wordPagePath)) continue;

        const matchRelPath = resultByDocPage.get(`${docKey}/${pageIndex}`);
        if (!matchRelPath) continue;

        const actualPath = path.join(screenshotsDir, matchRelPath);
        if (!fs.existsSync(actualPath)) continue;

        wordAssets.set(
          `${docKey}/${pageToken}`,
          copyWordPageAsset(wordPagePath, actualPath, docKey, pageToken, resultsRoot, true),
        );
      }
    }

    if (wordAssets.size > 0) {
      console.log(colors.info(`Used R2 Word baselines for ${wordAssets.size} page comparison(s).`));
    }
  } else {
    for (const docKey of pagesByDoc.keys()) {
      fallbackDocKeys.add(docKey);
    }
  }

  // --- Fallback path: use superdoc-benchmark for docs not in R2 ---
  if (fallbackDocKeys.size > 0) {
    if (!isCommandAvailable('superdoc-benchmark')) {
      if (wordAssets.size === 0) {
        console.warn(colors.warning('Skipping Word compare: superdoc-benchmark not found in PATH.'));
        return report;
      }
      console.warn(
        colors.warning(
          `Skipping Word compare fallback for ${fallbackDocKeys.size} doc(s): superdoc-benchmark not found.`,
        ),
      );
    } else {
      await generateWordAssetsViaBenchmark({
        docKeys: fallbackDocKeys,
        pagesByDoc,
        docInfoMap,
        provider,
        resultsRoot,
        targetVersion: options.targetVersion,
        wordAssets,
      });
    }
  }

  if (wordAssets.size === 0) {
    console.warn(colors.warning('Skipping Word compare: no assets matched the diffs.'));
    return report;
  }

  for (const item of report.results) {
    const parsed = parseDocKeyAndPage(item.relativePath, report.resultsFolder, options.resultsPrefix);
    if (!parsed) continue;
    const key = `${parsed.docKey}/${parsed.pageToken}`;
    const assets = wordAssets.get(key);
    if (assets) {
      item.word = assets;
    }
  }

  return report;
}

/**
 * Parse command line arguments.
 * Usage: pnpm compare [baseline-version] [--folder <name>] [--threshold <percent>] [--filter <path>] [--match <text>] [--exclude <path>]
 *   --scale-factor <n> set Playwright deviceScaleFactor for captures (default: 1.5)
 */
function parseArgs(): {
  baselineVersion?: string;
  targetVersion?: string;
  folder?: string;
  threshold: number;
  filters: string[];
  matches: string[];
  excludes: string[];
  docs: string[];
  baselineRoot?: string;
  resultsRoot?: string;
  resultsPrefix?: string;
  reportFileName?: string;
  reportMode?: 'visual' | 'interactions';
  reportTrim?: string;
  reportAll: boolean;
  includeWord: boolean;
  browsers: BrowserName[];
  browserArg?: string;
  scaleFactor: number;
  refreshBaselines: boolean;
  mode: StorageMode;
  docsDir?: string;
} {
  const args = process.argv.slice(2);
  let baselineVersion: string | undefined;
  let targetVersion: string | undefined;
  let folder: string | undefined;
  let threshold = 0;
  const filters: string[] = [];
  const matches: string[] = [];
  const excludes: string[] = [];
  const docs: string[] = [];
  let baselineRoot: string | undefined;
  let resultsRoot: string | undefined;
  let resultsPrefix: string | undefined;
  let reportFileName: string | undefined;
  let reportMode: 'visual' | 'interactions' | undefined;
  let reportTrim: string | undefined;
  let reportAll = false;
  let includeWord = false;
  let browserArg: string | undefined;
  let scaleFactor = 1.5;
  let refreshBaselines = false;
  const storage = parseStorageFlags(args);
  const docsDir = resolveDocsDir(storage.mode, storage.docsDir);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--folder' && args[i + 1]) {
      folder = args[i + 1];
      i++;
    } else if (args[i] === '--threshold' && args[i + 1]) {
      threshold = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--target' && args[i + 1]) {
      targetVersion = args[i + 1];
      i++;
    } else if (args[i] === '--filter' && args[i + 1]) {
      const rawFilter = args[i + 1].trim();
      if (rawFilter) {
        filters.push(rawFilter);
      }
      i++;
    } else if (args[i] === '--match' && args[i + 1]) {
      const rawMatch = args[i + 1].trim();
      if (rawMatch) {
        matches.push(rawMatch);
      }
      i++;
    } else if (args[i] === '--exclude' && args[i + 1]) {
      const rawExclude = args[i + 1].trim();
      if (rawExclude) {
        excludes.push(rawExclude);
      }
      i++;
    } else if (args[i] === '--doc' && args[i + 1]) {
      const rawDoc = args[i + 1].trim();
      if (rawDoc) {
        docs.push(rawDoc);
      }
      i++;
    } else if (args[i] === '--baseline-root' && args[i + 1]) {
      baselineRoot = args[i + 1];
      i++;
    } else if (args[i] === '--results-root' && args[i + 1]) {
      resultsRoot = args[i + 1];
      i++;
    } else if (args[i] === '--results-prefix' && args[i + 1]) {
      resultsPrefix = args[i + 1];
      i++;
    } else if (args[i] === '--report' && args[i + 1]) {
      reportFileName = args[i + 1];
      i++;
    } else if (args[i] === '--report-mode' && args[i + 1]) {
      const mode = args[i + 1];
      if (mode === 'visual' || mode === 'interactions') {
        reportMode = mode;
      }
      i++;
    } else if (args[i] === '--report-trim' && args[i + 1]) {
      reportTrim = args[i + 1];
      i++;
    } else if (args[i] === '--report-all') {
      reportAll = true;
    } else if (args[i] === '--include-word') {
      includeWord = true;
    } else if (args[i] === '--refresh-baselines') {
      refreshBaselines = true;
    } else if (args[i] === '--browser' && args[i + 1]) {
      browserArg = args[i + 1];
      i++;
    } else if (args[i] === '--scale-factor' && args[i + 1]) {
      const raw = Number.parseFloat(args[i + 1]);
      if (Number.isFinite(raw) && raw > 0) {
        scaleFactor = raw;
      } else {
        console.warn(colors.warning(`⚠ Invalid --scale-factor "${args[i + 1]}"; using default 1.5.`));
      }
      i++;
    } else if (args[i] === '--docs' && args[i + 1]) {
      i++;
    } else if (!args[i].startsWith('--') && !baselineVersion) {
      // First positional argument is baseline version
      baselineVersion = args[i];
    }
  }

  const browsers = resolveBrowserNames(browserArg);

  return {
    baselineVersion,
    targetVersion,
    folder,
    threshold,
    filters,
    matches,
    excludes,
    docs,
    baselineRoot,
    resultsRoot,
    resultsPrefix,
    reportFileName,
    reportMode,
    reportTrim,
    reportAll,
    includeWord,
    browsers,
    browserArg,
    scaleFactor,
    refreshBaselines,
    mode: storage.mode,
    docsDir,
  };
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const {
    baselineVersion,
    targetVersion,
    folder,
    threshold,
    filters,
    matches,
    excludes,
    docs,
    baselineRoot,
    resultsRoot,
    resultsPrefix,
    reportFileName,
    reportMode,
    reportTrim,
    reportAll,
    includeWord,
    browsers,
    browserArg,
    scaleFactor,
    refreshBaselines,
    mode,
    docsDir,
  } = parseArgs();
  const normalizedDocs = Array.from(new Set(docs.map((value) => normalizeDocPath(value)).filter(Boolean)));
  const docFilters = normalizedDocs.map((docPath) => docPathToScreenshotFilter(docPath));
  const effectiveFilters = docFilters.length > 0 ? docFilters : filters;
  const generationFilters = normalizedDocs.length > 0 ? [] : filters;

  if (docFilters.length > 0 && filters.length > 0) {
    console.warn(colors.warning('Using --doc selectors and ignoring --filter values for comparison scope.'));
  }

  const storageArgs = buildStorageArgs(mode, docsDir);
  const normalizedResultsPrefix = normalizePrefix(resultsPrefix);
  const normalizedReportTrim = normalizePrefix(reportTrim);
  const isInteractionMode =
    reportMode === 'interactions' ||
    (normalizedResultsPrefix ? normalizedResultsPrefix.startsWith('interactions/') : false) ||
    (normalizedReportTrim ? normalizedReportTrim.startsWith('interactions/') : false) ||
    effectiveFilters.some((value) => value.startsWith('interactions/'));
  const baselinePrefix = isInteractionMode ? 'baselines-interactions' : BASELINES_DIR;
  const baselineDir = resolveBaselineRoot(baselinePrefix, mode, baselineRoot);
  const resolvedResultsRoot = resultsRoot ? resolvePathInput(resultsRoot) : undefined;

  // Find results folder
  let resultsFolderName = folder;
  let resolvedTargetVersion: string | undefined;

  // Determine which baseline to use
  let baselineSelection = await resolveBaselineSelection(baselinePrefix, mode, baselineDir, baselineVersion);
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
      console.error(colors.error(`No baselines found in ${baselineDir}. Baseline generation may have failed.`));
    } else {
      console.error(colors.error('No baselines found in R2. Run "pnpm baseline" first.'));
    }
    process.exit(1);
  }

  if (targetVersion && isInteractionMode) {
    console.error(colors.error('Use "pnpm compare:interactions --target" for interaction baselines.'));
    process.exit(1);
  }

  const ensureBaseline = async (version: string, versionSpec?: string, force: boolean = false): Promise<void> => {
    if (mode === 'local') {
      const baselinePath = path.join(baselineDir, version);
      const baselineExists = fs.existsSync(baselinePath);
      const shouldEnsureSelectedDocs = baselineExists && normalizedDocs.length > 0;
      if (!baselineExists || shouldEnsureSelectedDocs) {
        if (!baselineExists) {
          console.log(colors.info(`📸 Baseline ${version} not found locally. Generating...`));
        } else {
          console.log(colors.info(`📸 Ensuring baseline coverage for ${normalizedDocs.length} selected doc(s)...`));
        }
        const script =
          baselinePrefix === 'baselines-interactions'
            ? 'scripts/baseline-interactions.ts'
            : 'scripts/baseline-visual.ts';
        const browserArg = browsers.length > 0 ? browsers.join(',') : undefined;
        const currentSpec = getSuperdocVersion();
        const shouldRestore =
          Boolean(versionSpec) &&
          !targetVersion &&
          currentSpec &&
          normalizeVersionSpecifier(currentSpec) !== normalizeVersionSpecifier(versionSpec!);
        await runBaseline({
          script,
          versionSpec,
          filters: generationFilters,
          matches,
          excludes,
          docs: script === 'scripts/baseline-visual.ts' ? normalizedDocs : [],
          browserArg,
          scaleFactor,
          storageArgs,
        });
        if (shouldRestore) {
          console.log(colors.muted(`Restoring SuperDoc version: ${currentSpec}`));
          await runVersionSwitch(currentSpec);
        }
        if (!fs.existsSync(baselinePath)) {
          throw new Error(`Failed to generate baseline for version ${version} in ${baselineDir}.`);
        }
      }
      console.log(colors.success(`✓ Baselines: ${version} ${colors.muted('(local)')}`));
      return;
    }

    const hasFilters = effectiveFilters.length > 0 || matches.length > 0 || excludes.length > 0;
    const browserFilters = browserArg ? browsers : undefined;
    if (refreshBaselines) {
      if (hasFilters || browserFilters) {
        const refreshed = await refreshBaselineSubset({
          prefix: baselinePrefix,
          version,
          localRoot: baselineDir,
          filters: effectiveFilters,
          matches,
          excludes,
          browsers: browserFilters,
        });
        if (refreshed.matched === 0) {
          console.warn(colors.warning('No baseline files matched the filters to refresh.'));
        } else {
          console.log(
            colors.success(
              `↻ Refreshed ${refreshed.downloaded} baseline file(s) for ${version} ${colors.muted('(R2)')}`,
            ),
          );
        }
        return;
      }
      force = true;
    }

    const result = await ensureBaselineDownloaded({
      prefix: baselinePrefix,
      version,
      localRoot: baselineDir,
      force,
    });
    if (!result.fromCache) {
      console.log(colors.success(`✓ Baselines: ${version} ${colors.muted(`(downloaded ${result.downloaded} files)`)}`));
    } else {
      console.log(colors.success(`✓ Baselines: ${version} ${colors.muted('(cached)')}`));
    }
  };

  if (targetVersion && resultsFolderName) {
    console.error(colors.error('Cannot use --target with --folder. Remove --folder to generate a fresh results set.'));
    process.exit(1);
  }

  const baselineSpecForEnsure = baselineVersion || normalizedDocs.length > 0 ? baselineSelection?.spec : undefined;

  if (!targetVersion) {
    await ensureBaseline(baselineToUse, baselineSpecForEnsure);
  }

  if (targetVersion) {
    if (await isPortOpen(HARNESS_PORT)) {
      console.error(colors.error(`Harness is already running at ${HARNESS_URL}. Stop it before using --target.`));
      process.exit(1);
    }

    const targetInfo = parseVersionInput(targetVersion);
    const targetLabel = targetInfo.label;
    const targetSpec = targetInfo.spec;
    resolvedTargetVersion = targetSpec;

    console.log(colors.muted(`Switching to ${targetSpec}...`));
    await runVersionSwitch(targetSpec);
    console.log(colors.muted(`Generating: ${targetLabel}`));
    for (const browser of browsers) {
      await runGenerate({
        outputFolder: targetLabel,
        filters: generationFilters,
        matches,
        excludes,
        docs: normalizedDocs,
        browser,
        scaleFactor,
        storageArgs,
      });
    }

    await ensureBaseline(baselineToUse, baselineSpecForEnsure);

    resultsFolderName = targetLabel;

    const baselineFolder = path.join(baselineDir, baselineToUse);
    for (const browser of browsers) {
      await fillMissingDocs(
        resultsFolderName,
        baselineFolder,
        effectiveFilters,
        matches,
        excludes,
        browser,
        scaleFactor,
        { mode, docsDir },
        storageArgs,
      );
    }
  }

  if (!resultsFolderName) {
    resultsFolderName = generateResultsFolderName(undefined, new Date(), true);

    if (!targetVersion) {
      await ensureLocalTarballInstalled(process.cwd(), runVersionSwitch, (msg) => console.log(colors.muted(msg)));
    }

    const { child, started } = await ensureHarnessRunning();
    try {
      console.log(colors.muted(`Generating: ${resultsFolderName}`));
      for (const browser of browsers) {
        await runGenerate({
          outputFolder: resultsFolderName,
          filters: generationFilters,
          matches,
          excludes,
          docs: normalizedDocs,
          browser,
          scaleFactor,
          storageArgs,
        });
      }

      const baselineFolder = path.join(baselineDir, baselineToUse);
      for (const browser of browsers) {
        await fillMissingDocs(
          resultsFolderName,
          baselineFolder,
          effectiveFilters,
          matches,
          excludes,
          browser,
          scaleFactor,
          { mode, docsDir },
          storageArgs,
        );
      }
    } finally {
      if (started && child) {
        await stopHarness(child);
      }
    }
  }

  if (
    resolvedResultsRoot &&
    resultsFolderName &&
    resultsFolderName.startsWith('v.') &&
    path.resolve(resolvedResultsRoot) === path.resolve(baselineDir)
  ) {
    await ensureBaseline(resultsFolderName, normalizeVersionSpecifier(resultsFolderName));
  }

  const resolvedMode =
    reportMode ??
    (reportTrim || effectiveFilters.some((value) => value.startsWith('interactions/')) ? 'interactions' : 'visual');
  const resolvedTrim = reportTrim ?? (resolvedMode === 'interactions' ? 'interactions/' : undefined);
  const ignorePrefixes = resolvedMode === 'visual' ? ['interactions/'] : undefined;

  const outputFolderNameForBrowser = (browser: BrowserName): string =>
    browsers.length > 1 ? path.join(resultsFolderName!, browser) : resultsFolderName!;

  for (const browser of browsers) {
    // Build compact config line
    const configParts = [`Baseline: ${baselineToUse}`, `Browser: ${browser}`];
    if (docFilters.length > 0) configParts.push(`Docs: ${docFilters.length}`);
    if (docFilters.length === 0 && effectiveFilters.length > 0) {
      configParts.push(`Filter: "${effectiveFilters.join(', ')}"`);
    }
    if (matches.length > 0) configParts.push(`Match: "${matches.join(', ')}"`);
    if (excludes.length > 0) configParts.push(`Exclude: "${excludes.join(', ')}"`);
    if (threshold > 0) configParts.push(`Threshold: ${threshold}%`);
    console.log(colors.muted(configParts.join(' │ ')));
    console.log('');

    try {
      const outputFolderName = outputFolderNameForBrowser(browser);
      let report = await runComparison(resultsFolderName!, {
        threshold,
        baselineVersion: baselineToUse,
        baselineRoot: baselineDir,
        resultsRoot: resolvedResultsRoot,
        resultsPrefix,
        browser,
        outputFolderName,
        filters: effectiveFilters,
        matches,
        excludes,
        ignorePrefixes,
        reportOptions: {
          showAll: reportAll,
          reportFileName,
          mode: resolvedMode,
          trimPrefix: resolvedTrim,
        },
      });

      if (mode === 'cloud' && !refreshBaselines && report.summary.missingInBaseline > 0) {
        const refreshFilters = deriveMissingBaselineDocFilters(report, resultsFolderName!, resultsPrefix, browser);
        if (refreshFilters.length > 0) {
          console.log(
            colors.muted(
              `↻ Missing baseline files detected in cache. Refreshing ${refreshFilters.length} doc(s) from R2...`,
            ),
          );
          const refreshed = await refreshBaselineSubset({
            prefix: baselinePrefix,
            version: baselineToUse,
            localRoot: baselineDir,
            filters: refreshFilters,
            excludes,
            browsers: [browser],
          });
          if (refreshed.matched > 0) {
            report = await runComparison(resultsFolderName!, {
              threshold,
              baselineVersion: baselineToUse,
              baselineRoot: baselineDir,
              resultsRoot: resolvedResultsRoot,
              resultsPrefix,
              browser,
              outputFolderName,
              filters: effectiveFilters,
              matches,
              excludes,
              ignorePrefixes,
              reportOptions: {
                showAll: reportAll,
                reportFileName,
                mode: resolvedMode,
                trimPrefix: resolvedTrim,
              },
            });
          } else {
            console.warn(colors.warning('No baseline files matched for refresh; keeping current comparison results.'));
          }
        } else {
          console.warn(
            colors.warning('Missing baseline files detected but no doc filters could be derived for refresh.'),
          );
        }
      }

      if (resolvedMode === 'visual') {
        const visualResultsPrefix = browser ? `${normalizePrefix(resultsPrefix) ?? ''}${browser}/` : resultsPrefix;

        let wordBaselineIndex: WordBaselineIndex | undefined;
        if (isWordR2Available()) {
          try {
            wordBaselineIndex = await downloadWordBaselinesForReport(report, {
              resultsPrefix: visualResultsPrefix,
              providerOptions: { mode, docsDir },
            });
          } catch (error) {
            console.warn(
              colors.warning(
                `Word R2 baseline download failed, falling back: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          }
        }

        report = await augmentReportWithSourceDocs(report, {
          resultsPrefix: visualResultsPrefix,
          resultsFolderName: resultsFolderName!,
          providerOptions: { mode, docsDir },
          wordBaselineIndex,
        });

        if (includeWord) {
          report = await augmentReportWithWord(report, {
            resultsFolderName: resultsFolderName!,
            resultsPrefix: visualResultsPrefix,
            targetVersion: resolvedTargetVersion,
            providerOptions: { mode, docsDir },
            wordBaselineIndex,
          });
        }

        const outputFolder = path.join(RESULTS_DIR, outputFolderName);
        fs.writeFileSync(path.join(outputFolder, REPORT_FILE), JSON.stringify(report, null, 2));
        writeHtmlReport(report, outputFolder, {
          showAll: reportAll,
          reportFileName,
          mode: resolvedMode,
          trimPrefix: resolvedTrim,
        });
      }

      // Summary
      console.log('');
      const { summary } = report;

      if (summary.failed === 0 && summary.missingInBaseline === 0 && summary.missingInResults === 0) {
        console.log(colors.success(`✓ No diffs detected across ${summary.total} comparison(s).`));
      } else {
        const parts = [`${summary.passed} passed`, `${summary.failed} failed`];
        if (summary.missingInBaseline > 0) parts.push(`${summary.missingInBaseline} new`);
        if (summary.missingInResults > 0) parts.push(`${summary.missingInResults} removed`);
        console.log(colors.warning(`✗ ${parts.join(', ')}`));
      }

      const fullResultsPath = path.resolve(process.cwd(), RESULTS_DIR, outputFolderName);
      const reportOutputName = reportFileName ?? 'report.html';
      console.log(colors.info(`📂 Results: ${fullResultsPath}`));
      console.log(colors.info(`📊 Report: ${path.join(fullResultsPath, reportOutputName)}`));
    } catch (error) {
      console.error(colors.error(`\n❌ ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(colors.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  });
}
