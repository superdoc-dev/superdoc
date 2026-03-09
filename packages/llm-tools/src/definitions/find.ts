import type { ToolDefinition } from '../types.js';

export const findTool: ToolDefinition = {
  name: 'superdoc_find',
  description:
    'Search for content in the document. Returns addresses that other tools need for edits. ' +
    'Call this before superdoc_edit, superdoc_format, or any tool that requires a target.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      pattern: { type: 'string', description: 'Text or regex pattern to search for.' },
      type: { type: 'string', description: 'Node type to filter by (e.g. "paragraph", "heading", "table").' },
      limit: { type: 'number', description: 'Maximum number of results to return.' },
      offset: { type: 'number', description: 'Number of results to skip.' },
    },
    required: ['session_id'],
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
};
