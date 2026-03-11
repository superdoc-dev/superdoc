/**
 * Single Promptfoo assertion entry point.
 *
 * Runs a profile of checks based on vars.profile (default: "base"),
 * plus any extra checks from vars.checks (array of check names).
 *
 * Usage in YAML:
 *   assert:
 *     - type: javascript
 *       value: file://lib/assert.cjs
 *       metric: argument_quality
 *
 * Controlled by test vars:
 *   vars:
 *     profile: mutation          # selects check bundle (see profiles.cjs)
 *     checks: [usesRewriteOp]   # extra checks beyond the profile
 */
const buildContext = require('./context.cjs');
const checks = require('./checks.cjs');
const profiles = require('./profiles.cjs');

module.exports = function (output, testContext) {
  const vars = testContext?.vars || {};
  const profileName = vars.profile || 'base';
  const profileChecks = profiles[profileName] || profiles.base;
  const extraChecks = Array.isArray(vars.checks) ? vars.checks : [];
  const allCheckNames = [...new Set([...profileChecks, ...extraChecks])];

  const ctx = buildContext(output);
  const results = [];

  for (const name of allCheckNames) {
    const fn = checks[name];
    if (!fn) continue;
    const result = fn(ctx, vars);
    if (result === true) continue; // check not applicable, skip
    results.push({ check: name, ...result });
  }

  if (results.length === 0) {
    return { pass: true, score: 1, reason: 'No applicable checks' };
  }

  const failures = results.filter((r) => !r.pass);
  const pass = failures.length === 0;
  const score = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const reason = pass
    ? `All ${results.length} checks passed`
    : failures.map((r) => `[${r.check}] ${r.reason}`).join('; ');

  return { pass, score, reason };
};
