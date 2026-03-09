import type { ToolDefinition } from '../types.js';

export const reviewTool: ToolDefinition = {
  name: 'superdoc_review',
  description:
    'Review tracked changes (suggestions). List all pending changes, then accept or reject them individually or all at once.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      action: {
        type: 'string',
        enum: ['list', 'accept', 'reject', 'accept_all', 'reject_all'],
        description: 'The review operation to perform.',
      },
      id: {
        type: 'string',
        description: 'Change ID from a previous "list" result. For actions "accept" and "reject".',
      },
      type: {
        type: 'string',
        enum: ['insert', 'delete', 'format'],
        description: 'Filter changes by type. For action "list".',
      },
    },
    required: ['session_id', 'action'],
  },
  annotations: { readOnlyHint: false },
};
