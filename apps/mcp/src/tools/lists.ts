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
    'superdoc_list_create',
    {
      title: 'Create List',
      description:
        'Create a new list from one or more existing paragraphs. Use superdoc_find to locate paragraph addresses first.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        target: z
          .string()
          .describe(
            'JSON-encoded block address (or range) of the paragraph(s) to convert. Use { "kind": "block", "nodeType": "paragraph", "nodeId": "..." }.',
          ),
        kind: z.enum(['ordered', 'bullet']).describe('The list type to create.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, target, kind }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const result = api.invoke({
          operationId: 'lists.create',
          input: { mode: 'fromParagraphs', target: parsed, kind },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Create list failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
