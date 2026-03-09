import type { ToolDefinition } from '../types.js';

export const imageTool: ToolDefinition = {
  name: 'superdoc_image',
  description:
    'Work with images in the document. Use action "list" to find all images. ' +
    'To insert a new image, use superdoc_create with type "image" instead.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      action: {
        type: 'string',
        enum: ['list', 'get', 'resize', 'set_alt_text', 'set_wrap', 'delete'],
        description: 'The image operation to perform.',
      },
      target: { type: 'string', description: 'JSON image address. Required for all actions except "list".' },
      width: { type: 'number', description: 'Width in points. For action "resize".' },
      height: { type: 'number', description: 'Height in points. For action "resize".' },
      alt_text: { type: 'string', description: 'Alt text for accessibility. For action "set_alt_text".' },
      wrap: {
        type: 'string',
        enum: ['inline', 'square', 'tight', 'behind', 'in_front'],
        description: 'Text wrap type. For action "set_wrap".',
      },
    },
    required: ['session_id', 'action'],
  },
  annotations: { readOnlyHint: false },
};
