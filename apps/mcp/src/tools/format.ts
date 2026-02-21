import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

const STYLES = ['bold', 'italic', 'underline', 'strikethrough'] as const;

export function registerFormatTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_format',
    {
      title: 'Format Text',
      description: 'Toggle a formatting style on a text range. Use superdoc_find to locate the target range first.',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        style: z.enum(STYLES).describe('The formatting style to toggle.'),
        target: z
          .string()
          .describe(
            'JSON-encoded target address specifying the text range to format. Get this from superdoc_find results.',
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, style, target }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const result = api.invoke({
          operationId: `format.${style}`,
          input: { target: parsed },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Format failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
