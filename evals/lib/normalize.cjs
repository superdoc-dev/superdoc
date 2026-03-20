/**
 * Normalize tool call output across providers.
 *
 * OpenAI returns: [{type: "function", function: {name, arguments}}]
 * Anthropic returns: '{"type":"tool_use","name":"...","input":{...}}'
 * Google returns: [{functionCall: {name, args}}] or similar
 *
 * Ensures `output` is always an array of {function: {name, arguments}}.
 */
function toOpenAIFormat(name, input) {
  return {
    type: 'function',
    function: {
      name: name,
      arguments: typeof input === 'string' ? input : JSON.stringify(input || {}),
    },
  };
}

function normalizeArray(arr) {
  // Already OpenAI format
  if (arr[0]?.function?.name) return arr;

  // Anthropic array of content blocks
  const toolUses = arr.filter((b) => b.type === 'tool_use');
  if (toolUses.length > 0) return toolUses.map((t) => toOpenAIFormat(t.name, t.input));

  // Google format: [{functionCall: {name, args}}]
  const funcCalls = arr.filter((b) => b.functionCall);
  if (funcCalls.length > 0) return funcCalls.map((t) => toOpenAIFormat(t.functionCall.name, t.functionCall.args));

  return arr;
}

module.exports = function (output) {
  // Already an array
  if (Array.isArray(output)) return normalizeArray(output);

  // Object (not string)
  if (output && typeof output === 'object') {
    // Anthropic tool_use
    if (output.type === 'tool_use') return [toOpenAIFormat(output.name, output.input)];
    // Google functionCall
    if (output.functionCall) return [toOpenAIFormat(output.functionCall.name, output.functionCall.args)];
    return output;
  }

  if (typeof output !== 'string') return output;

  // Try pure JSON parse
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) return normalizeArray(parsed);
    if (parsed.type === 'tool_use') return [toOpenAIFormat(parsed.name, parsed.input)];
    if (parsed.functionCall) return [toOpenAIFormat(parsed.functionCall.name, parsed.functionCall.args)];
    return output;
  } catch {
    // Not pure JSON
  }

  // No tool calls found -- return as-is (text response)
  return output;
};
