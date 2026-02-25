import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

export function registerCommentTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_add_comment',
    {
      title: 'Add Comment',
      description:
        'Add a comment anchored to a text range in the document. Use superdoc_find with a text pattern first, then pass a TextAddress from items[].context.textRanges as the target.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        text: z.string().describe('The comment text (question, concern, or feedback).'),
        target: z
          .string()
          .describe(
            'JSON-encoded TextAddress: {"kind":"text","blockId":"...","range":{"start":N,"end":N}}. Get this from superdoc_find items[].context.textRanges.',
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, text, target }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const result = api.invoke({
          operationId: 'comments.create',
          input: { text, target: parsed },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Add comment failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_list_comments',
    {
      title: 'List Comments',
      description:
        'List all comments in the document. Returns comment text, author, status (open/resolved), and the text range each comment is anchored to.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        include_resolved: z.boolean().optional().describe('Include resolved comments. Defaults to true.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ session_id, include_resolved }) => {
      try {
        const { api } = sessions.get(session_id);
        const input: Record<string, unknown> = {};
        if (include_resolved != null) input.includeResolved = include_resolved;

        const result = api.invoke({ operationId: 'comments.list', input });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `List comments failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_reply_comment',
    {
      title: 'Reply to Comment',
      description: 'Reply to an existing comment thread. Use the comment ID from superdoc_list_comments.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        comment_id: z.string().describe('The parent comment ID to reply to (from superdoc_list_comments).'),
        text: z.string().describe('The reply text.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, comment_id, text }) => {
      try {
        const { api } = sessions.get(session_id);
        const result = api.invoke({
          operationId: 'comments.create',
          input: { parentCommentId: comment_id, text },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Reply failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'superdoc_resolve_comment',
    {
      title: 'Resolve Comment',
      description: 'Mark a comment as resolved. Use the comment ID from superdoc_list_comments.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        comment_id: z.string().describe('The comment ID to resolve (from superdoc_list_comments).'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, comment_id }) => {
      try {
        const { api } = sessions.get(session_id);
        const result = api.invoke({
          operationId: 'comments.patch',
          input: { commentId: comment_id, status: 'resolved' },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Resolve failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
