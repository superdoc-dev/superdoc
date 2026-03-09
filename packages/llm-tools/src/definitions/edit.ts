import type { ToolDefinition } from '../types.js';

export const editTool: ToolDefinition = {
  name: 'superdoc_edit',
  description:
    'Insert, replace, or delete text in the document. ' +
    'Use superdoc_find first to get a target address. ' +
    'Set suggest=true to create a tracked change instead of a direct edit.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      action: {
        type: 'string',
        enum: ['insert', 'replace', 'delete'],
        description: 'The edit operation to perform.',
      },
      target: { type: 'string', description: 'JSON address from superdoc_find results.' },
      text: { type: 'string', description: 'Text content to insert or replace with. Required for insert and replace.' },
      suggest: {
        type: 'boolean',
        description: 'If true, creates a tracked change (suggestion) instead of a direct edit.',
      },
    },
    required: ['session_id', 'action', 'target'],
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
};
