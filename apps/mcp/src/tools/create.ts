import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

const TYPES = ['paragraph', 'heading'] as const;

export function registerCreateTools(server: McpServer, sessions: SessionManager): void {
  server.registerTool(
    'superdoc_create',
    {
      title: 'Create Block',
      description:
        'Create a new block element in the document. Supports paragraphs and headings. Optionally specify text content and position. Set suggest=true to create as a tracked change (suggestion).',
      inputSchema: {
        session_id: z.string().describe('Session ID from superdoc_open.'),
        type: z.enum(TYPES).describe('The type of block to create.'),
        text: z.string().optional().describe('Text content for the new block.'),
        level: z.number().min(1).max(6).optional().describe('Heading level (1-6). Required when type is "heading".'),
        at: z
          .string()
          .optional()
          .describe('JSON-encoded position specifying where to create the block. If omitted, appends to the end.'),
        suggest: z
          .boolean()
          .optional()
          .describe(
            'If true, create as a tracked change (suggestion) that can be accepted or rejected later. Defaults to false (direct edit).',
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, type, text, level, at, suggest }) => {
      try {
        const { api } = sessions.get(session_id);
        const input: Record<string, unknown> = {};
        if (text != null) input.text = text;
        if (level != null) input.level = level;
        if (at != null) input.at = JSON.parse(at);

        const result = api.invoke({
          operationId: `create.${type}`,
          input,
          options: suggest ? { changeMode: 'tracked' as const } : undefined,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Create failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
