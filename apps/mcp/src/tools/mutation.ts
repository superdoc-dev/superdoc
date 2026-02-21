import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

export function registerMutationTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_insert',
    {
      title: 'Insert Text',
      description:
        'Insert text at a target position in the document. Use superdoc_find first to get valid target addresses.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        text: z.string().describe('The text content to insert.'),
        target: z
          .string()
          .describe('JSON-encoded target address specifying where to insert. Get this from superdoc_find results.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, text, target }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const result = api.invoke({
          operationId: 'insert',
          input: { text, target: parsed },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Insert failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_replace',
    {
      title: 'Replace Text',
      description:
        'Replace content at a target range with new text. Use superdoc_find to locate the target range first.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        text: z.string().describe('The replacement text.'),
        target: z
          .string()
          .describe('JSON-encoded target address specifying what to replace. Get this from superdoc_find results.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, text, target }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const result = api.invoke({
          operationId: 'replace',
          input: { text, target: parsed },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Replace failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_delete',
    {
      title: 'Delete Content',
      description: 'Delete content at a target range. Use superdoc_find to locate the target range first.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        target: z
          .string()
          .describe('JSON-encoded target address specifying what to delete. Get this from superdoc_find results.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ session_id, target }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const result = api.invoke({
          operationId: 'delete',
          input: { target: parsed },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Delete failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
