import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AnyToolDefinition } from '../definitions/types.js';

/**
 * Converts a tool's Zod parameter schema to a plain JSON Schema object.
 *
 * @param tool - The tool definition whose parameters should be converted.
 * @returns A JSON Schema record describing the tool's parameters.
 */
export function toolParamsToJsonSchema(tool: AnyToolDefinition): Record<string, unknown> {
  return zodToJsonSchema(tool.parameters, { name: `${tool.name}Params`, $refStrategy: 'none' });
}

/**
 * Converts a tool's Zod return schema to a plain JSON Schema object.
 *
 * @param tool - The tool definition whose return type should be converted.
 * @returns A JSON Schema record, or `undefined` if the tool has no return schema.
 */
export function toolReturnsToJsonSchema(tool: AnyToolDefinition): Record<string, unknown> | undefined {
  if (!tool.returns) return undefined;
  return zodToJsonSchema(tool.returns, { name: `${tool.name}Result`, $refStrategy: 'none' });
}
