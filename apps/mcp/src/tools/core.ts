/**
 * Register the `core` preset's LLM tools (superdoc_inspect,
 * superdoc_perform_action) against the MCP server.
 *
 * Tool names, descriptions, and JSON schemas come from the SDK's core-preset
 * catalog at startup — the same definitions `chooseTools({preset:'core'})`
 * advertises — so the MCP surface can never drift from the SDK surface.
 * Dispatch routes through the SDK's preset dispatcher bound to the session's
 * in-process DocumentApi (the same host dialect the CLI preset dispatch and
 * the browser bridge use).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { dispatchSuperDocTool, getPreset } from '@superdoc-dev/sdk';
import type { SessionManager } from '../session-manager.js';
import { jsonSchemaPropertyToZod } from './intent.js';

interface CoreCatalogTool {
  toolName: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  mutates: boolean;
}

function buildZodShape(tool: CoreCatalogTool): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {
    session_id: z.string().describe('Session ID from superdoc_open.'),
  };
  const props = tool.inputSchema.properties ?? {};
  const required = new Set(tool.inputSchema.required ?? []);
  for (const [key, prop] of Object.entries(props)) {
    // Session/doc targeting is managed by the MCP server.
    if (key === 'doc' || key === 'sessionId') continue;
    let zodType = jsonSchemaPropertyToZod(prop);
    if (!required.has(key)) zodType = zodType.optional();
    shape[key] = zodType;
  }
  return shape;
}

export async function registerCoreTools(server: McpServer, sessions: SessionManager): Promise<void> {
  const catalog = (await getPreset('core').getCatalog()) as unknown as { tools: CoreCatalogTool[] };

  for (const tool of catalog.tools) {
    server.registerTool(
      tool.toolName,
      {
        title: tool.toolName.replace(/^superdoc_/, '').replace(/_/g, ' '),
        description: tool.description,
        inputSchema: buildZodShape(tool),
        // No destructiveHint for the mutating tool: superdoc_perform_action
        // includes destructive actions (delete_table, delete_text,
        // replace_text, ...) — clients must not treat it as additive-only.
        annotations: {
          readOnlyHint: !tool.mutates,
        },
      },
      async (args) => {
        try {
          const { session_id, ...toolArgs } = args as Record<string, unknown>;
          const { api } = sessions.get(session_id as string);
          // The in-process DocumentApi satisfies the preset dispatcher's
          // structural needs (namespaced ops, awaited calls, MutationOptions
          // as the 2nd arg for tracked mode).
          const receipt = await dispatchSuperDocTool(
            api as unknown as Parameters<typeof dispatchSuperDocTool>[0],
            tool.toolName,
            toolArgs,
            { preset: 'core' },
          );
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(receipt, null, 2) }],
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
