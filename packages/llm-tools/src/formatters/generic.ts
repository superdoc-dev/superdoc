import type { AnyToolDefinition } from '../definitions/types.js';
import { toolParamsToJsonSchema, toolReturnsToJsonSchema } from './shared.js';

/** Provider-agnostic tool shape with both parameter and return schemas. */
export type GenericToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  returns?: Record<string, unknown>;
};

/**
 * Formats tool definitions into a provider-agnostic JSON Schema shape.
 *
 * @param tools - Array of tool definitions to format.
 * @returns Tool definitions with JSON Schema `parameters` and optional `returns`.
 *
 * @example
 * ```typescript
 * const generic = formatForGeneric(allTools);
 * ```
 */
export function formatForGeneric(tools: AnyToolDefinition[]): GenericToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toolParamsToJsonSchema(tool),
    returns: toolReturnsToJsonSchema(tool),
  }));
}
