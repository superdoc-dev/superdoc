import type { AnyToolDefinition } from '../definitions/types.js';
import { toolParamsToJsonSchema } from './shared.js';

/** Anthropic Messages API tool shape. */
export type AnthropicToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/**
 * Formats tool definitions for the Anthropic Messages API.
 *
 * @param tools - Array of tool definitions to format.
 * @returns Tool definitions shaped for Anthropic's `tools` parameter.
 *
 * @example
 * ```typescript
 * const anthropicTools = formatForAnthropic(allTools);
 * // Pass to Anthropic SDK: { tools: anthropicTools }
 * ```
 */
export function formatForAnthropic(tools: AnyToolDefinition[]): AnthropicToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: toolParamsToJsonSchema(tool),
  }));
}
