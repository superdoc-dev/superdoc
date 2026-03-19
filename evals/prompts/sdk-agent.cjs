/**
 * Loads the SDK system prompt and appends the task variable.
 * Promptfoo calls this function per-test with { vars: { task } }.
 */
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const base = readFileSync(
  resolve(__dirname, '../../packages/sdk/tools/system-prompt.md'),
  'utf8',
);

module.exports = function ({ vars }) {
  return base + '\n\nTask: ' + (vars.task || '');
};
