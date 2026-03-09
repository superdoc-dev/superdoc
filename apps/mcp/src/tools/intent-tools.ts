import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ALL_TOOLS, dispatch } from '@superdoc/llm-tools';
import type { DynamicInvokeRequest } from '@superdoc/document-api';
import type { SessionManager } from '../session-manager.js';
import { jsonSchemaToZodShape } from './json-schema-to-zod.js';

/** Derive a human-readable title from a tool name like "superdoc_edit" → "Edit". */
function titleFromName(name: string): string {
  return name
    .replace(/^superdoc_/, '')
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Register all 13 intent-based tools from @superdoc/llm-tools.
 * Each tool delegates to the llm-tools routing layer via `dispatch()`.
 */
export function registerIntentTools(server: McpServer, sessions: SessionManager): void {
  for (const tool of ALL_TOOLS) {
    const zodShape = jsonSchemaToZodShape(tool.inputSchema);

    server.registerTool(
      tool.name,
      {
        title: titleFromName(tool.name),
        description: tool.description,
        inputSchema: zodShape,
        annotations: tool.annotations,
      },
      async (params: Record<string, unknown>) => {
        try {
          const sessionId = params.session_id as string;
          const { api } = sessions.get(sessionId);

          // Build the transport-agnostic executor that llm-tools expects.
          const execute = (operationId: string, input: Record<string, unknown>, options?: Record<string, unknown>) =>
            Promise.resolve(api.invoke({ operationId, input, options } as DynamicInvokeRequest));

          const result = await dispatch(tool.name, params, execute);

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `${titleFromName(tool.name)} failed: ${(err as Error).message}` }],
            isError: true,
          };
        }
      },
    );
  }
}
