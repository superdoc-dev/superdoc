import type { ZodTypeAny } from 'zod';

/**
 * Defines the shape of an LLM tool: a name, description, Zod parameter schema,
 * and an optional Zod return schema.
 */
export type ToolDefinition<TParams extends ZodTypeAny = ZodTypeAny, TReturns extends ZodTypeAny = ZodTypeAny> = {
  name: string;
  description: string;
  parameters: TParams;
  returns?: TReturns;
};

/** A tool definition with loosely-typed Zod schemas (useful for heterogeneous arrays). */
export type AnyToolDefinition = ToolDefinition<ZodTypeAny, ZodTypeAny>;

/**
 * Identity helper that preserves the literal type of a tool definition while
 * ensuring it satisfies the {@link ToolDefinition} shape.
 *
 * @param definition - The tool definition object to validate.
 * @returns The same definition, narrowly typed.
 *
 * @example
 * ```typescript
 * const myTool = defineTool({
 *   name: 'my_tool',
 *   description: 'Does something useful',
 *   parameters: z.object({ query: z.string() }),
 * });
 * ```
 */
export function defineTool<T extends AnyToolDefinition>(definition: T): T {
  return definition;
}
