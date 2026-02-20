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
if (vitestExitCode !== 0) {
  process.exit(vitestExitCode);
}

// Preserve previous behavior: CLI tests are part of the default full test run.
if (args.length === 0) {
  const cliExitCode = run(pnpmCommand, ['run', 'test:cli']);
  process.exit(cliExitCode);
}
