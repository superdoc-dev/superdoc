import type { ToolDefinition } from '../types.js';

export const readTool: ToolDefinition = {
  name: 'superdoc_read',
  description:
    'Read document content. Use format "markdown" to see headings, lists, tables, and links. ' +
    'Use "text" for plain text. Use "html" for HTML. Use "info" for metadata and structure summary.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      format: {
        type: 'string',
        enum: ['text', 'markdown', 'html', 'info'],
        description: 'Output format. "markdown" is recommended for understanding document structure.',
      },
    },
    required: ['session_id', 'format'],
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
};
