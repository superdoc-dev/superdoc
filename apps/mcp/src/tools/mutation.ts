import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

function mutationOptions(suggest?: boolean) {
  return suggest ? { changeMode: 'tracked' as const } : undefined;
}

export function registerMutationTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_insert',
    {
      title: 'Insert Text',
      description:
        "Insert text at a target position in the document. Use superdoc_find first, then pass a TextAddress from the result's context[].textRanges as the target. Set suggest=true to insert as a tracked change (suggestion) instead of a direct edit.",
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        text: z.string().describe('The text content to insert.'),
        target: z
          .string()
          .describe(
            'JSON-encoded TextAddress: {"kind":"text","blockId":"...","range":{"start":N,"end":N}}. Get this from superdoc_find context[].textRanges, NOT from matches[].',
          ),
        suggest: z
          .boolean()
          .optional()
          .describe(
            'If true, insert as a tracked change (suggestion) that can be accepted or rejected later. Defaults to false (direct edit).',
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, text, target, suggest }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const result = api.invoke({
          operationId: 'insert',
          input: { text, target: parsed },
          options: mutationOptions(suggest),
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
        "Replace content at a target range with new text. Use superdoc_find with a text pattern first, then pass a TextAddress from the result's context[].textRanges as the target. Set suggest=true to make the replacement a tracked change (suggestion).",
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        text: z.string().describe('The replacement text.'),
        target: z
          .string()
          .describe(
            'JSON-encoded TextAddress: {"kind":"text","blockId":"...","range":{"start":N,"end":N}}. Get this from superdoc_find context[].textRanges, NOT from matches[].',
          ),
        suggest: z
          .boolean()
          .optional()
          .describe(
            'If true, replace as a tracked change (suggestion) that can be accepted or rejected later. Defaults to false (direct edit).',
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, text, target, suggest }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const result = api.invoke({
          operationId: 'replace',
          input: { text, target: parsed },
          options: mutationOptions(suggest),
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
      description:
        "Delete content at a target range. Use superdoc_find with a text pattern first, then pass a TextAddress from the result's context[].textRanges as the target. Set suggest=true to delete as a tracked change (suggestion).",
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        target: z
          .string()
          .describe(
            'JSON-encoded TextAddress: {"kind":"text","blockId":"...","range":{"start":N,"end":N}}. Get this from superdoc_find context[].textRanges, NOT from matches[].',
          ),
        suggest: z
          .boolean()
          .optional()
          .describe(
            'If true, delete as a tracked change (suggestion) that can be accepted or rejected later. Defaults to false (direct edit).',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ session_id, target, suggest }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const result = api.invoke({
          operationId: 'delete',
          input: { target: parsed },
          options: mutationOptions(suggest),
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
