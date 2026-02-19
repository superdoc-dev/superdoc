/**
 * Generate interaction snapshots and compare against baselines (R2 by default, or local with --local --docs).
 *
 * Usage:
 *   pnpm compare:interactions                 # Generate + compare interactions against latest baseline in R2
 *   pnpm compare:interactions 1.4.0          # Compare against baseline v.1.4.0 in R2
 *   pnpm compare:interactions 1.4.0 --target 1.5.0-next.5
 *   pnpm compare:interactions --filter typing
 *   pnpm compare:interactions --exclude toolbar
 *   pnpm compare:interactions --match sd-1401
 *   pnpm compare:interactions --folder <run> # Compare an existing interactions run
 *   (HTML report includes all snapshots by default.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { generateResultsFolderName, getSuperdocVersion } from './generate-refs.js';
import { findPngFiles, matchesFilterWithBrowserPrefix } from './compare.js';
import { colors } from './terminal.js';
import { normalizePath } from './utils.js';
import { BROWSER_NAMES, resolveBaselineFolderForBrowser, resolveBrowserNames } from './browser-utils.js';
import {
  isPathLikeVersion,
  normalizeVersionLabel,
  normalizeVersionSpecifier,
  parseVersionInput,
} from './version-utils.js';
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
import { ensureLocalTarballInstalled } from './workspace-utils.js';

const BASELINES_DIR = 'baselines-interactions';

function listFilteredPngs(dir: string, filters: string[], matches: string[], excludes: string[]): string[] {
  return findPngFiles(dir)
    .map((relativePath) => normalizePath(relativePath))
    .filter((relativePath) => matchesFilterWithBrowserPrefix(relativePath, undefined, filters, matches, excludes));
}

function findMissingBaselineDocFilters(options: {
  baselineFolder: string;
  resultsFolder: string;
  filters: string[];
  matches: string[];
  excludes: string[];
}): string[] {
  const baselineFiles = new Set(
    listFilteredPngs(options.baselineFolder, options.filters, options.matches, options.excludes),
  );
  const resultFiles = listFilteredPngs(options.resultsFolder, options.filters, options.matches, options.excludes);
  const missingDocs = new Set<string>();

  for (const resultPath of resultFiles) {
    if (baselineFiles.has(resultPath)) continue;
    const docKey = path.posix.dirname(resultPath);
    if (!docKey || docKey === '.') continue;
    missingDocs.add(docKey);
  }

  return Array.from(missingDocs);
}

interface CompareInteractionArgs {
  baselineVersion?: string;
  targetVersion?: string;
  folder?: string;
  output?: string;
  threshold?: number;
  baselineRoot?: string;
  filters: string[];
  matches: string[];
  excludes: string[];
  browserArg?: string;
  scaleFactor: number;
  refreshBaselines: boolean;
  mode: StorageMode;
  docsDir?: string;
}

function parseArgs(): CompareInteractionArgs {
  const args = process.argv.slice(2);
  let baselineVersion: string | undefined;
  let targetVersion: string | undefined;
  let folder: string | undefined;
  let output: string | undefined;
  let threshold: number | undefined;
  let baselineRoot: string | undefined;
  const filters: string[] = [];
  const matches: string[] = [];
  const excludes: string[] = [];
  let browserArg: string | undefined;
  let scaleFactor = 1.5;
  let refreshBaselines = false;
  const storage = parseStorageFlags(args);
  const docsDir = resolveDocsDir(storage.mode, storage.docsDir);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--folder' && args[i + 1]) {
      folder = args[i + 1];
      i++;
    } else if (arg === '--target' && args[i + 1]) {
      targetVersion = args[i + 1];
      i++;
    } else if (arg === '--output' && args[i + 1]) {
      output = args[i + 1];
      i++;
    } else if (arg === '--threshold' && args[i + 1]) {
      threshold = Number.parseFloat(args[i + 1]);
      i++;
    } else if (arg === '--baseline-root' && args[i + 1]) {
      baselineRoot = args[i + 1];
      i++;
    } else if (arg === '--scale-factor' && args[i + 1]) {
      const raw = Number.parseFloat(args[i + 1]);
      if (Number.isFinite(raw) && raw > 0) {
        scaleFactor = raw;
      } else {
        console.warn(colors.warning(`⚠ Invalid --scale-factor "${args[i + 1]}"; using default 1.5.`));
      }
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

  if (browserArg) {
    resolveBrowserNames(browserArg);
  }

  return {
    baselineVersion,
    targetVersion,
    folder,
    output,
    threshold,
    baselineRoot,
    filters,
    matches,
    excludes,
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

function resolveBaselineRoot(mode: StorageMode, baselineRoot?: string): string {
  return baselineRoot ?? getBaselineLocalRootForMode(mode, BASELINES_DIR);
}

async function runVersionSwitch(version: string): Promise<void> {
  await runCommand(['exec', 'tsx', 'scripts/set-superdoc-version.ts', version]);
}

type VersionSwitchRunner = (version: string) => Promise<void>;

/**
 * Read the current `superdoc` dependency specifier from the harness package.
 *
 * @returns Dependency specifier, or `unknown` when the package cannot be read
 */
export function getHarnessSuperdocSpecifier(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'packages/harness/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const spec = pkg?.dependencies?.superdoc;
    return typeof spec === 'string' && spec.trim().length > 0 ? spec.trim() : 'unknown';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(colors.warning(`Unable to read harness superdoc dependency: ${message}`));
    return 'unknown';
  }
}

/**
 * Build candidate version specifiers that can be used to restore harness state.
 *
 * @param specifier - Raw dependency specifier from `packages/harness/package.json`
 * @param installedVersion - Installed `superdoc` package version from `node_modules`
 * @returns Deduplicated list of restore candidates in preferred order
 */
export function buildRestoreCandidates(specifier: string, installedVersion: string): string[] {
  const candidates: string[] = [];
  if (specifier && specifier !== 'unknown') {
    candidates.push(specifier);
  }
  if (installedVersion && installedVersion !== 'unknown') {
    candidates.push(normalizeVersionSpecifier(installedVersion));
  }
  return Array.from(new Set(candidates));
}

/**
 * Decide if the harness should be restored to its previous `superdoc` version.
 *
 * @param versionSpec - Baseline generation version specifier
 * @param targetVersion - Explicit target version mode flag
 * @param restoreCandidates - Candidate versions for restore
 * @returns `true` when a restore should be attempted
 */
export function shouldRestoreAfterBaselineSwitch(
  versionSpec: string | undefined,
  targetVersion: string | undefined,
  restoreCandidates: string[],
): boolean {
  if (!versionSpec || Boolean(targetVersion) || restoreCandidates.length === 0) {
    return false;
  }

  return normalizeVersionSpecifier(restoreCandidates[0]) !== normalizeVersionSpecifier(versionSpec);
}

/**
 * Restore harness `superdoc` dependency by trying candidate specifiers in order.
 *
 * @param candidates - Candidate version specifiers to attempt
 * @param switchVersion - Version switch implementation (defaults to `runVersionSwitch`)
 * @throws {Error} When all restore candidates fail
 */
export async function restoreSuperdocVersion(
  candidates: string[],
  switchVersion: VersionSwitchRunner = runVersionSwitch,
): Promise<void> {
  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      console.log(colors.muted(`Restoring SuperDoc version: ${candidate}`));
      await switchVersion(candidate);
      return;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  const attempted = candidates.length > 0 ? candidates.join(', ') : '(none)';
  const details =
    failures.length > 0 ? failures.map((message, index) => `${index + 1}. ${message}`).join(' | ') : 'No candidates';
  throw new Error(`Unable to restore previous SuperDoc version. Tried: ${attempted}. Failures: ${details}`);
}

async function runGenerate(
  outputFolder: string,
  filters: string[],
  matches: string[],
  excludes: string[],
  browserArg?: string,
  scaleFactor: number = 1,
  storageArgs?: string[],
): Promise<void> {
  const args = ['exec', 'tsx', 'scripts/generate-interactions.ts', '--output', outputFolder];
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
  if (browserArg) {
    args.push('--browser', browserArg);
  }
  if (storageArgs && storageArgs.length > 0) {
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
  const args = ['exec', 'tsx', 'scripts/baseline-interactions.ts'];
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

async function runCompare(
  resultsFolderName: string,
  baselineVersion: string | undefined,
  baselineRoot: string,
  threshold: number | undefined,
  filters: string[],
  matches: string[],
  excludes: string[],
  browserArg?: string,
  storageArgs?: string[],
): Promise<void> {
  const args = ['exec', 'tsx', 'scripts/compare.ts'];
  if (baselineVersion) {
    args.push(baselineVersion);
  }
  args.push('--baseline-root', baselineRoot);
  args.push('--results-prefix', 'interactions/');
  args.push('--folder', resultsFolderName);
  for (const filter of filters) {
    args.push('--filter', filter);
  }
  args.push('--report', 'interactions-report.html');
  args.push('--report-mode', 'interactions');
  args.push('--report-trim', 'interactions/');
  args.push('--report-all');
  for (const match of matches) {
    args.push('--match', match);
  }
  for (const exclude of excludes) {
    args.push('--exclude', exclude);
  }
  if (typeof threshold === 'number' && !Number.isNaN(threshold) && threshold > 0) {
    args.push('--threshold', String(threshold));
  }
  if (browserArg) {
    args.push('--browser', browserArg);
  }
  if (storageArgs && storageArgs.length > 0) {
    args.push(...storageArgs);
  }
  await runCommand(args);
}

async function main(): Promise<void> {
  const {
    baselineVersion,
    targetVersion,
    folder,
    output,
    threshold,
    baselineRoot,
    filters,
    matches,
    excludes,
    browserArg,
    scaleFactor,
    refreshBaselines,
    mode,
    docsDir,
  } = parseArgs();
  let resultsFolderName = folder;
  const browsers = resolveBrowserNames(browserArg);
  const storageArgs = buildStorageArgs(mode, docsDir);

  const baselineDir = resolveBaselineRoot(mode, baselineRoot);
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

  const ensureBaseline = async (version: string, versionSpec?: string, force: boolean = false): Promise<void> => {
    if (mode === 'local') {
      const baselinePath = path.join(baselineDir, version);
      if (!fs.existsSync(baselinePath)) {
        console.log(colors.info(`📸 Baseline ${version} not found locally. Generating...`));
        const currentSpec = getHarnessSuperdocSpecifier();
        const currentInstalledVersion = getSuperdocVersion();
        const restoreCandidates = buildRestoreCandidates(currentSpec, currentInstalledVersion);
        const shouldRestore = shouldRestoreAfterBaselineSwitch(versionSpec, targetVersion, restoreCandidates);
        await runBaselineLocal({
          versionSpec,
          filters,
          matches,
          excludes,
          browserArg,
          scaleFactor,
          storageArgs,
        });
        if (shouldRestore) {
          await restoreSuperdocVersion(restoreCandidates);
        }
      }
      if (!fs.existsSync(baselinePath)) {
        throw new Error(`No baseline found for version ${version} in ${baselineDir}.`);
      }
      console.log(colors.success(`✓ Interaction baselines: ${version} ${colors.muted('(local)')}`));
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
          console.warn(colors.warning('No interaction baseline files matched the filters to refresh.'));
        } else {
          console.log(
            colors.success(
              `↻ Refreshed ${refreshed.downloaded} interaction baseline file(s) for ${version} ${colors.muted('(R2)')}`,
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
        colors.success(
          `✓ Interaction baselines: ${version} ${colors.muted(`(downloaded ${result.downloaded} files)`)}`,
        ),
      );
    } else {
      console.log(colors.success(`✓ Interaction baselines: ${version} ${colors.muted('(cached)')}`));
    }
  };

  if (targetVersion && resultsFolderName) {
    console.error(colors.error('Cannot use --target with --folder. Remove --folder to generate a fresh results set.'));
    process.exit(1);
  }

  if (targetVersion && output) {
    console.warn(colors.warning('Ignoring --output because --target is set.'));
  }

  if (!targetVersion) {
    await ensureBaseline(baselineToUse, baselineVersion ? baselineSelection?.spec : undefined);
  }

  if (targetVersion) {
    if (await isPortOpen(HARNESS_PORT)) {
      console.error(colors.error(`Harness is already running at ${HARNESS_URL}. Stop it before using --target.`));
      process.exit(1);
    }

    const targetInfo = parseVersionInput(targetVersion);
    const targetLabel = targetInfo.label;
    const targetSpec = targetInfo.spec;

    console.log(colors.muted(`Switching to ${targetSpec}...`));
    await runVersionSwitch(targetSpec);
    console.log(colors.muted(`Generating: ${targetLabel}`));
    await runGenerate(targetLabel, filters, matches, excludes, browserArg, scaleFactor, storageArgs);

    await ensureBaseline(baselineToUse, baselineVersion ? baselineSelection?.spec : undefined);

    resultsFolderName = targetLabel;
  }

  if (folder && output) {
    console.warn(colors.warning('Ignoring --output because --folder is set.'));
  }

  if (!resultsFolderName) {
    resultsFolderName = output || generateResultsFolderName(undefined, new Date(), true);
    if (!targetVersion) {
      await ensureLocalTarballInstalled(process.cwd(), runVersionSwitch, (msg) => console.log(colors.muted(msg)));
    }
    console.log(colors.muted(`Generating: ${resultsFolderName}`));
    await runGenerate(resultsFolderName, filters, matches, excludes, browserArg, scaleFactor, storageArgs);
  }

  let resultsRoot: string | undefined;
  if (resultsFolderName) {
    const resolvedResultsRoot = path.isAbsolute(resultsFolderName)
      ? path.join(resultsFolderName, 'interactions')
      : path.join('screenshots', resultsFolderName, 'interactions');
    resultsRoot = resolvedResultsRoot;
    const hasBrowserResults = browsers.some((browser) => fs.existsSync(path.join(resolvedResultsRoot, browser)));
    const pngCount = browsers.reduce((count, browser) => {
      const dir = path.join(resolvedResultsRoot, browser);
      return count + (fs.existsSync(dir) ? findPngFiles(dir).length : 0);
    }, 0);
    if (!hasBrowserResults || pngCount === 0) {
      console.log(colors.warning('No interaction snapshots found. Skipping interaction comparison.'));
      return;
    }
  }

  if (mode === 'cloud' && !refreshBaselines && resultsFolderName && resultsRoot) {
    const baselineVersionDir = path.join(baselineDir, baselineToUse);
    const resultsHasBrowserDirs = BROWSER_NAMES.some((browser) => fs.existsSync(path.join(resultsRoot, browser)));

    for (const browser of browsers) {
      if (!resultsHasBrowserDirs && browser !== 'chromium') {
        continue;
      }
      const resultsFolder = resultsHasBrowserDirs ? path.join(resultsRoot, browser) : resultsRoot;
      if (!fs.existsSync(resultsFolder)) {
        continue;
      }
      const baselineFolder = resolveBaselineFolderForBrowser(baselineVersionDir, browser);
      if (!fs.existsSync(baselineFolder)) {
        continue;
      }

      const missingFilters = findMissingBaselineDocFilters({
        baselineFolder,
        resultsFolder,
        filters,
        matches,
        excludes,
      });
      if (missingFilters.length === 0) {
        continue;
      }

      console.log(
        colors.muted(
          `↻ Missing interaction baselines detected in cache. Refreshing ${missingFilters.length} story(s) for ${browser}...`,
        ),
      );
      const refreshed = await refreshBaselineSubset({
        prefix: BASELINES_DIR,
        version: baselineToUse,
        localRoot: baselineDir,
        filters: missingFilters,
        excludes,
        browsers: [browser],
      });
      if (refreshed.matched === 0) {
        console.warn(
          colors.warning(`No interaction baseline files matched for refresh (${browser}). Keeping current cache.`),
        );
      } else {
        console.log(
          colors.success(
            `↻ Refreshed ${refreshed.downloaded} interaction baseline file(s) for ${baselineToUse} (${browser}).`,
          ),
        );
      }
    }
  }

  await runCompare(
    resultsFolderName,
    baselineToUse,
    baselineDir,
    threshold,
    filters,
    matches,
    excludes,
    browserArg,
    storageArgs,
  );
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(colors.error(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
