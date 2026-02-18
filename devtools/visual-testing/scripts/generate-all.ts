/**
 * Run both visual and interaction screenshot generation.
 *
 * Usage:
 *   pnpm generate
 *   pnpm generate --filter layout
 *   pnpm generate --exclude samples
 *   pnpm generate --match sd-1401
 */

import { spawn } from 'node:child_process';
import { colors } from './terminal.js';

function runCommand(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
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
        reject(new Error(`Command failed with code ${code ?? 'unknown'} (${signal ?? 'no signal'})`));
      }
    });
  });
}

async function main(): Promise<void> {
  const passThrough = process.argv.slice(2);

  await runCommand(['exec', 'tsx', 'scripts/generate-refs.ts', ...passThrough]);
  await runCommand(['exec', 'tsx', 'scripts/generate-interactions.ts', ...passThrough]);
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(colors.error(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
