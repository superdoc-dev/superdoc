#!/usr/bin/env node

/**
 * @deprecated Compatibility wrapper — delegates to stage-python-companion-cli.mjs.
 * Remove after one release cycle.
 */

import { stageAllCompanionBinaries } from './stage-python-companion-cli.mjs';

export { stageAllCompanionBinaries as stagePythonEmbeddedCli };

async function main() {
  console.warn('stage-python-embedded-cli.mjs is deprecated — use stage-python-companion-cli.mjs');
  await stageAllCompanionBinaries();
}

const __filename = (await import('node:url')).fileURLToPath(import.meta.url);
if (process.argv[1] && (await import('node:path')).resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
