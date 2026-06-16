import path from 'node:path';
import { ensureNoUnknownFlags, isDirectExecution, repoRoot, runCommand } from './utils.js';

const allowedFlags = new Set(['--types']);
const superdocRoot = path.join(repoRoot, 'packages/superdoc');
const documentApiRoot = path.join(repoRoot, 'packages/document-api');

/**
 * Ensures the dist-backed document-api package exists for CLI/runtime consumers.
 *
 * @returns {void}
 */
export function ensureDocumentApiBuild() {
  runCommand('pnpm', ['--prefix', documentApiRoot, 'run', 'build:clean'], 'Build document-api dist for CLI runtime');
}

/**
 * Ensures the CLI's runtime dependencies are freshly built:
 * - document-api contract/catalog dist consumed by CLI + SDK generation
 * - packaged `superdoc` for the v1 runtime path
 *
 * `--types` performs the full published build so package type exports exist.
 * Without it, a faster packaged-superdoc build is sufficient for the v1 path.
 *
 * @param {{ includeTypes?: boolean }} [options]
 * @returns {void}
 */
export function ensureSuperdocBuild(options = {}) {
  const includeTypes = options.includeTypes === true;
  const scriptName = includeTypes ? 'build:es' : 'build:dev';
  const label = includeTypes ? 'Build packaged SuperDoc runtime and types' : 'Build packaged SuperDoc runtime';

  ensureDocumentApiBuild();
  runCommand('pnpm', ['--prefix', superdocRoot, 'run', scriptName], label);
}

/**
 * CLI wrapper around {@link ensureSuperdocBuild}.
 *
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {void}
 */
export function main(argv = process.argv.slice(2)) {
  ensureNoUnknownFlags(argv, allowedFlags);
  ensureSuperdocBuild({ includeTypes: argv.includes('--types') });
}

if (isDirectExecution(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
