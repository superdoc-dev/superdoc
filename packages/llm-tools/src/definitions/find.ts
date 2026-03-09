import type { ToolDefinition } from '../types.js';

export const findTool: ToolDefinition = {
  name: 'superdoc_find',
  description:
    'Search for content in the document. Returns addresses that other tools need for edits. ' +
    'Each result includes a "textAddress" (covers full block text) and, for text searches, a "matchAddress" ' +
    '(exact range of the match). Pass these directly to superdoc_format or superdoc_comment as the target.',
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
