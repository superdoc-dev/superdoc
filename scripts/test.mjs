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

// Always run bun test for migrated packages
const bunTestExitCode = run(pnpmCommand, ['-r', '--parallel', '--filter', '@superdoc/document-api',
  '--filter', '@superdoc/layout-engine', '--filter', '@superdoc/style-engine',
  '--filter', '@superdoc/geometry-utils', '--filter', '@superdoc/word-layout',
  '--filter', '@superdoc/common', '--filter', '@font-utils',
  '--filter', '@locale-utils', '--filter', '@url-validation', 'test']);

if (vitestExitCode !== 0) {
  process.exit(vitestExitCode);
}
if (bunTestExitCode !== 0) {
  process.exit(bunTestExitCode);
}

if (args.length === 0) {
  const sdkScriptsExitCode = run(pnpmCommand, ['--prefix', 'packages/sdk', 'run', 'test:scripts']);
  if (sdkScriptsExitCode !== 0) {
    process.exit(sdkScriptsExitCode);
  }
}
