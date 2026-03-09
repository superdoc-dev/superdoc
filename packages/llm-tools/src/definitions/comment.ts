import type { ToolDefinition } from '../types.js';

export const commentTool: ToolDefinition = {
  name: 'superdoc_comment',
  description:
    'Add, list, reply to, resolve, or delete comments. ' +
    'Use superdoc_find first to get a target address for creating new comments.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      action: {
        type: 'string',
        enum: ['list', 'create', 'reply', 'resolve', 'delete'],
        description: 'The comment operation to perform.',
      },
      target: { type: 'string', description: 'JSON text address to anchor the comment to. For action "create".' },
      text: { type: 'string', description: 'Comment body. For actions "create" and "reply".' },
      comment_id: { type: 'string', description: 'Comment ID. For actions "reply", "resolve", and "delete".' },
      include_resolved: { type: 'boolean', description: 'Include resolved comments in results. For action "list".' },
    },
    required: ['session_id', 'action'],
  },
  annotations: { readOnlyHint: false },
};
