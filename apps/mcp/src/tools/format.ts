import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

const STYLES = ['bold', 'italic', 'underline', 'strikethrough'] as const;

export function registerFormatTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_format',
    {
      title: 'Format Text',
      description:
        "Toggle a formatting style on a text range. Use superdoc_find with a text pattern first, then pass a TextAddress from the result's context[].textRanges as the target. Set suggest=true to format as a tracked change (suggestion).",
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        style: z.enum(STYLES).describe('The formatting style to toggle.'),
        target: z
          .string()
          .describe(
            'JSON-encoded TextAddress: {"kind":"text","blockId":"...","range":{"start":N,"end":N}}. Get this from superdoc_find context[].textRanges, NOT from matches[].',
          ),
        suggest: z
          .boolean()
          .optional()
          .describe(
            'If true, format as a tracked change (suggestion) that can be accepted or rejected later. Defaults to false (direct edit).',
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, style, target, suggest }) => {
      try {
        const { api } = sessions.get(session_id);
        const parsed = JSON.parse(target);
        const result = api.invoke({
          operationId: `format.${style}`,
          input: { target: parsed },
          options: suggest ? { changeMode: 'tracked' as const } : undefined,
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
