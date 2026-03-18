/**
 * Promptfoo JS tool loader.
 *
 * The generated SDK artifact is an object with shape:
 *   { contractVersion, tools: [...] }
 *
 * Promptfoo expects a function that returns the bare tools array.
 */
const { resolve } = require('node:path');

function get_tools() {
  const bundle = require(resolve(__dirname, '../../packages/sdk/tools/tools.openai.json'));
  return bundle.tools;
}

module.exports = { get_tools };
