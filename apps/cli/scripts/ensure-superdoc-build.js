import path from 'node:path';
import { ensureNoUnknownFlags, isDirectExecution, repoRoot, runCommand } from './utils.js';

const allowedFlags = new Set(['--types']);
const superdocRoot = path.join(repoRoot, 'packages/superdoc');

/**
 * Ensures the packaged `superdoc` runtime exists for CLI entrypoints that now
 * consume `superdoc/super-editor` instead of raw `@superdoc/super-editor/*` source.
 *
 * `--types` performs the full published build so package type exports exist.
 * Without it, a faster runtime-only build is sufficient for Bun execution.
 *
 * @param {{ includeTypes?: boolean }} [options]
 * @returns {void}
 */
export function ensureSuperdocBuild(options = {}) {
  const includeTypes = options.includeTypes === true;
  const scriptName = includeTypes ? 'build:es' : 'build:dev';
  const label = includeTypes ? 'Build packaged SuperDoc runtime and types' : 'Build packaged SuperDoc runtime';

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
