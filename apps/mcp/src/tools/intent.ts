/**
 * Register intent-based tools from the generated catalog.
 *
 * Registers each intent tool from the MCP-local generated catalog.
 * Tool dispatch is handled by the generated dispatchIntentTool function,
 * routing through DocumentApi.invoke().
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';
import type { DocumentApi, DynamicInvokeRequest } from '@superdoc/document-api';
import { MCP_TOOL_CATALOG } from '../generated/catalog.js';
import { dispatchIntentTool } from '../generated/intent-dispatch.generated.js';
import { applyParamRenames } from './param-renames.js';

// ---------------------------------------------------------------------------
// Types for the generated catalog
// ---------------------------------------------------------------------------

interface CatalogTool {
  toolName: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
    additionalProperties?: boolean;
  };
  mutates: boolean;
  operations: Array<{ operationId: string; intentAction: string }>;
}

interface Catalog {
  toolCount: number;
  tools: CatalogTool[];
}

// ---------------------------------------------------------------------------
// JSON Schema → Zod conversion (minimal, for MCP tool registration)
// ---------------------------------------------------------------------------

export function jsonSchemaPropertyToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  const desc = prop.description as string | undefined;
  const type = prop.type as string | undefined;

  if (prop.enum) {
    const values = prop.enum as string[];
    if (values.length > 0) {
      return z.enum(values as [string, ...string[]]).describe(desc ?? '');
    }
  }

  // AIDEV-NOTE: oneOf/anyOf/allOf must gate on "every variant is type:object".
  // looseObject({}) emits type:"object" (so MCP clients send objects, not strings)
  // but rejects non-object payloads at the zod layer. For mixed unions like
  // superdoc_edit.content (object|array), fall back to z.unknown() so the array
  // form survives. DocumentApi validates the actual shape at dispatch time.
  const variants = (prop.oneOf ?? prop.anyOf ?? prop.allOf) as Array<Record<string, unknown>> | undefined;
  if (variants) {
    const allObjectVariants = variants.every((v) => v?.type === 'object');
    if (allObjectVariants) {
      return desc ? z.looseObject({}).describe(desc) : z.looseObject({});
    }
    return desc ? z.unknown().describe(desc) : z.unknown();
  }

  switch (type) {
    case 'string':
      return desc ? z.string().describe(desc) : z.string();
    case 'number':
    case 'integer':
      return desc ? z.number().describe(desc) : z.number();
    case 'boolean':
      return desc ? z.boolean().describe(desc) : z.boolean();
    case 'array':
      // Note: z.array(z.unknown()) is safe but z.record() is not — the MCP SDK's
      // z4-mini toJSONSchema cannot convert z.record() from zod v4 classic.
      return desc ? z.array(z.unknown()).describe(desc) : z.array(z.unknown());
    case 'object':
      // Use z.looseObject({}) so the emitted JSON Schema carries
      // `type: "object"`. z.unknown() drops the type (clients treat it
      // as a string); z.record() can't be converted by the MCP SDK's
      // z4-mini toJSONSchema. DocumentApi validates the actual shape
      // at dispatch time.
      return desc ? z.looseObject({}).describe(desc) : z.looseObject({});
    default:
      return desc ? z.unknown().describe(desc) : z.unknown();
  }
}

/**
 * Build a Zod schema from a catalog tool's inputSchema.
 * Adds session_id and strips doc/sessionId (managed by MCP server).
 */
function buildZodSchema(tool: CatalogTool): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {
    session_id: z.string().describe('Session ID from superdoc_open.'),
  };

  const props = tool.inputSchema.properties ?? {};
  const required = new Set(tool.inputSchema.required ?? []);

  for (const [key, prop] of Object.entries(props)) {
    // Skip session/doc params — the MCP server manages these
    if (key === 'doc' || key === 'sessionId') continue;

    let zodType = jsonSchemaPropertyToZod(prop);
    if (!required.has(key)) {
      zodType = zodType.optional();
    }
    shape[key] = zodType;
  }

  return shape;
}

// ---------------------------------------------------------------------------
// Execute an operation via DocumentApi.invoke()
// ---------------------------------------------------------------------------

function executeOperation(api: DocumentApi, operationId: string, input: Record<string, unknown>): unknown {
  // Generated dispatch uses 'doc.' prefix (e.g. 'doc.query.match'); strip it for DocumentApi.invoke()
  const opId = operationId.startsWith('doc.') ? operationId.slice(4) : operationId;
  // AIDEV-NOTE: renames are applied on input only — output is not inverted.
  // This is incidental rather than deliberate: the fix only needed to address
  // the input path. The asymmetry is harmless: the contract response uses
  // canonical names (e.g. commentId), and agents can use either name on
  // subsequent calls (canonical names pass through PARAM_RENAMES unchanged;
  // short names are renamed here). A follow-up could invert on output for
  // symmetry, but it is not load-bearing.
  return api.invoke({ operationId: opId, input: applyParamRenames(opId, input) } as DynamicInvokeRequest);
}

// ---------------------------------------------------------------------------
// Register all intent tools
// ---------------------------------------------------------------------------

export function registerIntentTools(server: McpServer, sessions: SessionManager): void {
  const catalog = MCP_TOOL_CATALOG as unknown as Catalog;

  for (const tool of catalog.tools) {
    const zodSchema = buildZodSchema(tool);
    const isMutation = tool.mutates;

    server.registerTool(
      tool.toolName,
      {
        title: tool.toolName.replace(/^superdoc_/, '').replace(/_/g, ' '),
        description: tool.description,
        inputSchema: zodSchema,
        annotations: {
          readOnlyHint: !isMutation,
          ...(isMutation ? { destructiveHint: false } : {}),
        },
      },
      async (args) => {
        try {
          const { session_id, ...toolArgs } = args as Record<string, unknown>;
          const { api } = sessions.get(session_id as string);

          const result = await dispatchIntentTool(tool.toolName, toolArgs, (opId, input) =>
            executeOperation(api, opId, input),
          );

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `${tool.toolName} failed: ${(err as Error).message}` }],
            isError: true,
          };
        }
      },
    );
  }
}
