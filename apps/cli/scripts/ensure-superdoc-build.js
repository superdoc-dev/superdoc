import path from 'node:path';
import { ensureNoUnknownFlags, isDirectExecution, repoRoot, runCommand } from './utils.js';

const allowedFlags = new Set(['--types']);
const superdocRoot = path.join(repoRoot, 'packages/superdoc');
const documentApiRoot = path.join(repoRoot, 'packages/document-api');
const sdkWorkspaceRoot = path.join(repoRoot, 'packages/sdk');
const nodeSdkRoot = path.join(sdkWorkspaceRoot, 'langs/node');
const documentApiProject = path.relative(repoRoot, documentApiRoot);

/**
 * Ensures the dist-backed document-api package exists for CLI/runtime consumers.
 *
 * @returns {void}
 */
export function ensureDocumentApiBuild(run = runCommand) {
  run('pnpm', ['exec', 'tsc', '-b', '--clean', documentApiProject], 'Clean document-api dist for CLI runtime');
  run('pnpm', ['exec', 'tsc', '-b', documentApiProject], 'Build document-api dist for CLI runtime');
}

/**
 * Ensures the Node SDK package resolves for CLI builds.
 *
 * The CLI imports `@superdoc-dev/sdk` for `doc.preset.*`; Bun resolves that
 * package through its dist export while compiling native binaries. SDK
 * generation exports the CLI contract first, which builds document-api dist
 * for clean checkouts.
 *
 * @returns {void}
 */
export function ensureNodeSdkBuild(run = runCommand) {
  run('pnpm', ['--prefix', sdkWorkspaceRoot, 'run', 'generate'], 'Generate SDK artifacts for CLI runtime');
  run('pnpm', ['--prefix', nodeSdkRoot, 'run', 'build'], 'Build Node SDK for CLI runtime');
}

/**
 * Ensures the CLI's runtime dependencies are freshly built:
 * - document-api contract/catalog dist consumed by CLI metadata export
 * - Node SDK dist consumed by `doc.preset.*`
 * - packaged `superdoc` for the v1 runtime path
 *
 * `--types` performs the full published build so package type exports exist.
 * Without it, a faster packaged-superdoc build is sufficient for the v1 path.
 *
 * @param {{ includeTypes?: boolean }} [options]
 * @returns {void}
 */
export function ensureSuperdocBuild(options = {}, run = runCommand) {
  const includeTypes = options.includeTypes === true;
  const scriptName = includeTypes ? 'build:es' : 'build:dev';
  const label = includeTypes ? 'Build packaged SuperDoc runtime and types' : 'Build packaged SuperDoc runtime';

  ensureNodeSdkBuild(run);
  run('pnpm', ['--prefix', superdocRoot, 'run', scriptName], label);
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
