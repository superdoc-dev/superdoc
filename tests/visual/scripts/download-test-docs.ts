/**
 * Proxy to the repo-level corpus downloader.
 *
 * This keeps `pnpm docs:download` stable for tests/visual while using the
 * shared corpus root consumed by layout snapshots.
 */
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

async function main() {
  const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== '--');
  const commandArgs = ['run', 'corpus:pull', '--', '--link-visual', ...passthroughArgs];

  const child = spawn('pnpm', commandArgs, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error(`Failed to spawn corpus:pull: ${err.message}`);
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
