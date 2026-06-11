/**
 * Proxy to the shared corpus downloader (tests/visual/scripts/corpus/pull.mjs).
 *
 * This keeps `pnpm docs:download` stable for tests/visual while syncing the
 * shared corpus root (`<repo>/test-corpus`) consumed by all test suites.
 */
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const PULL_SCRIPT = path.resolve(import.meta.dirname, 'corpus/pull.mjs');

async function main() {
  const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== '--');
  const commandArgs = [PULL_SCRIPT, '--link-visual', ...passthroughArgs];

  const child = spawn(process.execPath, commandArgs, {
    env: process.env,
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error(`Failed to spawn corpus pull: ${err.message}`);
      resolve(1);
    });
  });

  process.exit(Number(exitCode));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[docs:download] Fatal: ${message}`);
  process.exit(1);
});
