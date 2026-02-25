import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Absolute path to the CLI package root.
 *
 * @type {string}
 */
export const cliRoot = path.resolve(__dirname, '..');
/**
 * Absolute path to the repository root.
 *
 * @type {string}
 */
export const repoRoot = path.resolve(cliRoot, '../..');

function describeCommand(command, args) {
  return [command, ...args].join(' ');
}

/**
 * Ensures a command line only includes known flags.
 *
 * @param {string[]} argv - Raw argv tokens (excluding node/script path).
 * @param {Set<string>} allowedFlags - Allowed long-form flags (for example `--all`).
 * @returns {void}
 * @throws {Error} If unknown flags are present.
 */
export function ensureNoUnknownFlags(argv, allowedFlags) {
  const unknown = argv.filter((arg) => {
    if (!arg.startsWith('--') || arg === '--') {
      return false;
    }
    const normalized = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    return !allowedFlags.has(normalized);
  });
  if (unknown.length > 0) {
    throw new Error(`Unknown flag(s): ${unknown.join(', ')}`);
  }
}

/**
 * Reads an optional flag value from `argv`.
 *
 * Supports both `--flag value` and `--flag=value`.
 *
 * @param {string[]} argv - Raw argv tokens (excluding node/script path).
 * @param {string} flagName - Flag to read (for example `--tag`).
 * @returns {string | null} The parsed value, or `null` when the flag is absent.
 * @throws {Error} If the flag is present without a value.
 */
export function getOptionalFlagValue(argv, flagName) {
  const equalsPrefix = `${flagName}=`;
  const equalsToken = argv.find((token) => token.startsWith(equalsPrefix));
  if (equalsToken) {
    const value = equalsToken.slice(equalsPrefix.length).trim();
    if (!value) {
      throw new Error(`Flag ${flagName} requires a value.`);
    }
    return value;
  }

  const index = argv.indexOf(flagName);
  if (index === -1) return null;

  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Flag ${flagName} requires a value.`);
  }
  return value;
}

/**
 * Indicates whether a module is being executed directly by Node.
 *
 * @param {string} importMetaUrl - Current module `import.meta.url`.
 * @returns {boolean} `true` when executed as entrypoint, otherwise `false`.
 */
export function isDirectExecution(importMetaUrl) {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(importMetaUrl);
}

/**
 * Executes a command synchronously from the repository root.
 *
 * @param {string} command - Program to execute.
 * @param {string[]} args - Program arguments.
 * @param {string} [label] - Optional human-readable step label.
 * @returns {void}
 * @throws {Error} If the command fails.
 */
export function runCommand(command, args, label) {
  const heading = label ?? describeCommand(command, args);
  console.log(`\n[cli] ${heading}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Step failed (${result.status ?? 'unknown'}): ${heading}`);
  }
}

/**
 * Executes a Node script from the repository root.
 *
 * @param {string} scriptPath - Relative script path from repository root.
 * @param {string[]} [args=[]] - Script arguments.
 * @param {string} [label] - Optional human-readable step label.
 * @returns {void}
 */
export function runNodeScript(scriptPath, args = [], label) {
  runCommand('node', [scriptPath, ...args], label);
}
