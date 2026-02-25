import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

export function registerListTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_insert_list',
    {
      title: 'Insert List Item',
      description:
        'Insert a new list item before or after an existing one. To start a new list, use superdoc_create with type "paragraph" first, then convert it. Or use superdoc_find to locate an existing list item.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        target: z
          .string()
          .describe('JSON-encoded list item address from superdoc_find or superdoc_list_items results.'),
        position: z.enum(['before', 'after']).describe('Insert before or after the target item.'),
        text: z.string().optional().describe('Text content for the new list item.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, target, position, text }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const input: Record<string, unknown> = { target: parsed, position };
        if (text != null) input.text = text;

        const result = api.invoke({
          operationId: 'lists.insert',
          input,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Insert list item failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_list_set_type',
    {
      title: 'Set List Type',
      description: 'Change a list between ordered (numbered) and bullet (unordered).',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        target: z.string().describe('JSON-encoded list item address from superdoc_find results.'),
        kind: z.enum(['ordered', 'bullet']).describe('The list type to set.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, target, kind }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const result = api.invoke({
          operationId: 'lists.setType',
          input: { target: parsed, kind },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Set list type failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
