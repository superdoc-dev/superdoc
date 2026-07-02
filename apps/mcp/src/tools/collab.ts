import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

export function registerCollabTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_attach',
    {
      title: 'Attach to Collaboration Room',
      description:
        'Attach to a live SuperDoc Yjs collaboration room via WebSocket and return a session_id for use with all other superdoc tools. Awaits initial sync before returning.',
      inputSchema: {
        ws_url: z.string().describe('WebSocket URL base, e.g. ws://localhost:4444/doc'),
        document_id: z.string().describe('Document/room identifier'),
        token: z.string().optional().describe('Optional auth token passed as query param'),
        user: z
          .object({
            id: z.string().optional(),
            name: z.string().optional(),
            email: z.string().optional(),
          })
          .optional()
          .describe(
            'Optional identity for attributing tracked changes. Required to author tracked (suggested) edits over the attach; direct edits work without it.',
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ ws_url, document_id, token, user }) => {
      try {
        const session = await sessions.openRoom(ws_url, document_id, token, user);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ session_id: session.id }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to attach to room: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
