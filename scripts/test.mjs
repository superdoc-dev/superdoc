import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliAvailable = existsSync(path.join(repoRoot, 'apps/cli/package.json'));
const sdkAvailable = existsSync(path.join(repoRoot, 'packages/sdk/package.json'));

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

const vitestExitCode = run(pnpmCommand, ['exec', 'vp', 'test', 'run', ...args]);

// Always run bun test for migrated packages
const bunTestExitCode = run(pnpmCommand, ['-r', '--parallel', '--filter', '@superdoc/document-api',
  '--filter', '@superdoc/layout-engine', '--filter', '@superdoc/style-engine',
  '--filter', '@superdoc/geometry-utils', '--filter', '@superdoc/word-layout',
  '--filter', '@superdoc/common', '--filter', '@superdoc/font-utils',
  '--filter', '@superdoc/url-validation', 'test']);

if (vitestExitCode !== 0) {
  process.exit(vitestExitCode);
}
if (bunTestExitCode !== 0) {
  process.exit(bunTestExitCode);
}

if (args.length === 0 && sdkAvailable) {
  const sdkScriptsExitCode = run(pnpmCommand, ['--prefix', 'packages/sdk', 'run', 'test:scripts']);
  if (sdkScriptsExitCode !== 0) {
    process.exit(sdkScriptsExitCode);
  }
}

if (args.length === 0 && cliAvailable && sdkAvailable) {
  // The smoke package's pretest builds both private workspaces. Keep it in
  // Orbit's default suite, but do not advertise it from a projection that
  // intentionally omits those sources.
  const documentApiSmokeExitCode = run(pnpmCommand, [
    '--silent',
    '--filter',
    '@superdoc-testing/document-api-smoke',
    'test',
  ]);
  if (documentApiSmokeExitCode !== 0) {
    process.exit(documentApiSmokeExitCode);
  }
}
