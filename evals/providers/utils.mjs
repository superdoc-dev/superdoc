/**
 * Shared utilities for the SuperDoc eval provider.
 */

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALS_ROOT = resolve(__dirname, '..');

export const PATHS = {
  root: EVALS_ROOT,
  fixtures: resolve(EVALS_ROOT, 'fixtures'),
  output: resolve(EVALS_ROOT, 'results/output'),
  cache: resolve(EVALS_ROOT, 'results/.cache'),
  prompt: resolve(EVALS_ROOT, '..', 'packages/sdk/tools/system-prompt.md'),
  cliBin: resolve(EVALS_ROOT, '../apps/cli/dist/index.js'),
};

// --- SDK ---

let sdkModule = null;
export async function loadSdk() {
  if (sdkModule) return sdkModule;
  sdkModule = await import('@superdoc-dev/sdk');
  return sdkModule;
}

// --- File management ---

/** Create a unique temp copy of a fixture and an isolated state dir. */
export function createTempCopy(fixture) {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const srcPath = resolve(PATHS.fixtures, fixture);
  const docPath = resolve(PATHS.fixtures, `tmp-${uid}-${fixture}`);
  const stateDir = resolve(PATHS.fixtures, `.state-${uid}`);
  copyFileSync(srcPath, docPath);
  return { docPath, stateDir, uid };
}

/** Clean up temp file and state dir. */
export function cleanupTemp(docPath, stateDir) {
  try { unlinkSync(docPath); } catch {}
  try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
}

/** Build the output path for keepFile and ensure the directory exists. */
export function resolveOutputPath(evalId, fixture, task) {
  const baseName = fixture.replace(/\.docx$/i, '');
  const slug = slugify(task);
  const outputDir = resolve(PATHS.output, evalId);
  const outputPath = resolve(outputDir, `${baseName}-${slug}.docx`);
  mkdirSync(outputDir, { recursive: true });
  return outputPath;
}

// --- Args ---

/** Strip doc/sessionId from LLM-generated args (SDK manages sessions). */
export function cleanArgs(args) {
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  const { doc, sessionId, ...rest } = args;
  return rest;
}

// --- SDK fingerprint (for cache invalidation) ---

const SDK_TOOLS_DIR = resolve(EVALS_ROOT, '..', 'packages/sdk/tools');
const SDK_DIST_DIR = resolve(EVALS_ROOT, '..', 'packages/sdk/langs/node/dist');
const SDK_FINGERPRINT_FILES = [
  resolve(SDK_TOOLS_DIR, 'tools.vercel.json'),
  resolve(SDK_TOOLS_DIR, 'tools.openai.json'),
  PATHS.prompt,
  PATHS.cliBin,
];
const SDK_FINGERPRINT_DIRECTORIES = [SDK_DIST_DIR];

function normalizeFingerprintPath(path) {
  return (path || '.').split(sep).join('/');
}

function updateHashWithFile(hash, filePath, rootPath = dirname(filePath)) {
  const fingerprintPath = normalizeFingerprintPath(relative(rootPath, filePath));
  hash.update(`file:${fingerprintPath}\n`);
  hash.update(readFileSync(filePath));
}

function updateHashWithDirectory(hash, dirPath, rootPath = dirPath) {
  const fingerprintPath = normalizeFingerprintPath(relative(rootPath, dirPath));
  hash.update(`dir:${fingerprintPath}\n`);

  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    hash.update(`missing-dir:${dirPath}\n`);
    return;
  }

  for (const entry of entries) {
    const entryPath = resolve(dirPath, entry.name);
    const entryFingerprintPath = normalizeFingerprintPath(relative(rootPath, entryPath));

    if (entry.isDirectory()) {
      updateHashWithDirectory(hash, entryPath, rootPath);
      continue;
    }

    if (entry.isFile()) {
      updateHashWithFile(hash, entryPath, rootPath);
      continue;
    }

    hash.update(`other:${entryFingerprintPath}\n`);
  }
}

/**
 * Compute the artifact fingerprint used to invalidate cached eval results when
 * the local tool surface or runtime artifacts change.
 *
 * @param {{files?: string[], directories?: string[]}} [options]
 * @returns {string}
 */
export function computeSdkFingerprint({
  files = SDK_FINGERPRINT_FILES,
  directories = SDK_FINGERPRINT_DIRECTORIES,
} = {}) {
  const hash = createHash('sha256');
  for (const file of [...files].sort()) {
    try {
      updateHashWithFile(hash, file);
    } catch {
      hash.update(`missing:${file}`);
    }
  }

  for (const directory of [...directories].sort()) {
    updateHashWithDirectory(hash, directory);
  }

  return hash.digest('hex').slice(0, 12);
}

const SDK_FINGERPRINT = computeSdkFingerprint();

// --- Cache ---

/** Generate a cache key from model + fixture + task + prompt hash + SDK fingerprint. */
export function cacheKey(model, fixture, task, prompt) {
  const promptSig = prompt ? createHash('sha256').update(prompt).digest('hex').slice(0, 8) : '';
  const hash = createHash('sha256')
    .update(`${model}|${fixture}|${task}|${promptSig}|${SDK_FINGERPRINT}`)
    .digest('hex')
    .slice(0, 16);
  return hash;
}

function isCacheDisabled() {
  return process.env.PROMPTFOO_CACHE_ENABLED === 'false'
    || process.argv.includes('--no-cache');
}

/** Read cached result. Returns null if cache disabled or key not found. */
export function readCache(key) {
  if (isCacheDisabled()) return null;
  const path = resolve(PATHS.cache, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Write result to cache. Skips when --no-cache is active. */
export function writeCache(key, result) {
  if (isCacheDisabled()) return;
  mkdirSync(PATHS.cache, { recursive: true });
  writeFileSync(resolve(PATHS.cache, `${key}.json`), JSON.stringify(result));
}

/** Clear the entire provider cache. */
export function clearCache() {
  rmSync(PATHS.cache, { recursive: true, force: true });
}

// --- String ---

/** Slugify a task name for use in filenames. */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/-$/, '');
}
