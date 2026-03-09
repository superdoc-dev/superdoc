import type { ToolDefinition } from '../types.js';

export const listTool: ToolDefinition = {
  name: 'superdoc_list',
  description:
    'Work with bullet and numbered lists. Use superdoc_find to locate list items first. ' +
    'To create a new list, use superdoc_create with type "list" instead.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      action: {
        type: 'string',
        enum: ['insert', 'indent', 'outdent', 'set_type', 'detach'],
        description: 'The list operation to perform.',
      },
      target: { type: 'string', description: 'JSON list item address from superdoc_find results.' },
      text: { type: 'string', description: 'Text for new list item. For action "insert".' },
      position: {
        type: 'string',
        enum: ['before', 'after'],
        description: 'Where to insert relative to target. For action "insert".',
      },
      kind: { type: 'string', enum: ['ordered', 'bullet'], description: 'List type. For action "set_type".' },
    },
    required: ['session_id', 'action', 'target'],
  },
  annotations: { readOnlyHint: false },
};
