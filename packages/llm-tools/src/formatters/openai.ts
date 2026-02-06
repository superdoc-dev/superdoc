import type { AnyToolDefinition } from '../definitions/types.js';
import { toolParamsToJsonSchema } from './shared.js';

/** OpenAI Chat Completions API tool shape. */
export type OpenAiToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/**
 * Formats tool definitions for the OpenAI Chat Completions API.
 *
 * @param tools - Array of tool definitions to format.
 * @returns Tool definitions shaped for OpenAI's `tools` parameter.
 *
 * @example
 * ```typescript
 * const openaiTools = formatForOpenAI(allTools);
 * // Pass to OpenAI SDK: { tools: openaiTools }
 * ```
 */
export function formatForOpenAI(tools: AnyToolDefinition[]): OpenAiToolDefinition[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toolParamsToJsonSchema(tool),
    },
  }));
}
