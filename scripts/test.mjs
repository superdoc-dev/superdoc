import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

/**
 * Run a command and return its exit code.
 */
function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

const vitestExitCode = run(pnpmCommand, ['exec', 'vitest', 'run', ...args]);

// Run bun tests for all migrated packages (including super-editor)
const bunExitCodes = [
  run(pnpmCommand, ['-r', '--parallel',
    '--filter', '@superdoc/document-api',
    '--filter', '@superdoc/layout-engine', '--filter', '@superdoc/style-engine',
    '--filter', '@superdoc/geometry-utils', '--filter', '@superdoc/word-layout',
    '--filter', '@superdoc/common', '--filter', '@superdoc/font-utils',
    '--filter', '@superdoc/locale-utils', '--filter', '@superdoc/url-validation', 'test']),
];

if (vitestExitCode !== 0) {
  process.exit(vitestExitCode);
}
const bunFailed = bunExitCodes.find(code => code !== 0);
if (bunFailed) {
  process.exit(bunFailed);
}

if (args.length === 0) {
  const sdkScriptsExitCode = run(pnpmCommand, ['--prefix', 'packages/sdk', 'run', 'test:scripts']);
  if (sdkScriptsExitCode !== 0) {
    process.exit(sdkScriptsExitCode);
  }
}
