import type { ToolDefinition } from '../types.js';

export const referenceTool: ToolDefinition = {
  name: 'superdoc_reference',
  description:
    'Manage hyperlinks, bookmarks, and footnotes. ' +
    'Use superdoc_find to get a target address for inserting new references.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      action: {
        type: 'string',
        enum: [
          'list_links',
          'insert_link',
          'update_link',
          'remove_link',
          'list_bookmarks',
          'insert_bookmark',
          'remove_bookmark',
          'list_footnotes',
          'insert_footnote',
          'remove_footnote',
        ],
        description: 'The reference operation to perform.',
      },
      target: { type: 'string', description: 'JSON address for insertions.' },
      url: { type: 'string', description: 'URL for hyperlink actions.' },
      text: { type: 'string', description: 'Display text for insert_link, or footnote content for insert_footnote.' },
      tooltip: { type: 'string', description: 'Tooltip text for update_link.' },
      name: { type: 'string', description: 'Bookmark name.' },
      id: {
        type: 'string',
        description: 'JSON address of the reference (from list results) for update/remove actions.',
      },
    },
    required: ['session_id', 'action'],
  },
  annotations: { readOnlyHint: false },
};
