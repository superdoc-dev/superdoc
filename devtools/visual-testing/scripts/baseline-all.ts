/**
 * Run both visual and interaction baselines.
 *
 * Usage:
 *   pnpm baseline
 *   pnpm baseline --filter layout
 *   pnpm baseline --exclude samples
 *   pnpm baseline --match sd-1401
 */

import { colors } from './terminal.js';
import { runCommand, isPortOpen, HARNESS_PORT, HARNESS_URL } from './harness-utils.js';

function extractVersion(args: string[]): string | undefined {
  const flagsWithValue = new Set([
    '--filter',
    '--match',
    '--exclude',
    '--parallel',
    '--output',
    '--browser',
    '--scale-factor',
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      if (flagsWithValue.has(arg)) {
        i++;
      }
      continue;
    }
    return arg;
  }
  return undefined;
}

async function main(): Promise<void> {
  const passThrough = process.argv.slice(2);
  const version = extractVersion(passThrough);

  if (version) {
    if (await isPortOpen(HARNESS_PORT)) {
      console.error(colors.error(`Harness is already running at ${HARNESS_URL}. Stop it before switching versions.`));
      process.exit(1);
    }
    console.log(colors.info(`Switching to ${version}...`));
    await runCommand(['exec', 'tsx', 'scripts/set-superdoc-version.ts', version]);
    process.env.SUPERDOC_SKIP_VERSION_SWITCH = '1';
  }

  await runCommand(['exec', 'tsx', 'scripts/baseline-visual.ts', ...passThrough]);
  await runCommand(['exec', 'tsx', 'scripts/baseline-interactions.ts', ...passThrough]);
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(colors.error(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
