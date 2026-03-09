import type { ToolDefinition } from '../types.js';

export const createTool: ToolDefinition = {
  name: 'superdoc_create',
  description:
    'Create a new block element in the document: paragraph, heading, table, image, list, section break, ' +
    'table of contents, or content control. Appends to the end if no position is specified.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      type: {
        type: 'string',
        enum: ['paragraph', 'heading', 'table', 'image', 'list', 'section_break', 'toc', 'content_control'],
        description: 'Type of block element to create.',
      },
      at: { type: 'string', description: 'JSON position address. Appends to end if omitted.' },
      text: { type: 'string', description: 'Initial text content for the block.' },
      level: {
        type: 'number',
        minimum: 1,
        maximum: 6,
        description: 'Heading level (1-6). Required for type "heading".',
      },
      rows: { type: 'number', minimum: 1, description: 'Number of rows. For type "table".' },
      cols: { type: 'number', minimum: 1, description: 'Number of columns. For type "table".' },
      src: { type: 'string', description: 'Image file path or URL. For type "image".' },
      kind: { type: 'string', enum: ['ordered', 'bullet'], description: 'List kind. For type "list".' },
      suggest: { type: 'boolean', description: 'If true, creates as a tracked change.' },
    },
    required: ['session_id', 'type'],
  },
  annotations: { readOnlyHint: false },
};
