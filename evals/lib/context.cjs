/**
 * Parse tool call output into a structured context for assertion checks.
 * Expects output already normalized to OpenAI format (via normalize.cjs transform).
 */
module.exports = function buildContext(output) {
  const calls = Array.isArray(output) ? output : [];
  const toolNames = [];
  const toolMap = {};

  for (const call of calls) {
    const name = call.function?.name;
    if (!name) continue;
    toolNames.push(name);
    let args = {};
    try {
      args = JSON.parse(call.function.arguments || '{}');
    } catch {}
    toolMap[name] = args;
  }

  const mutations = toolMap['apply_mutations'] || null;
  const steps = mutations?.steps || [];

  return { calls, toolNames, toolMap, mutations, steps };
};
