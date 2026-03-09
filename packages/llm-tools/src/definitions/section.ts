import type { ToolDefinition } from '../types.js';

export const sectionTool: ToolDefinition = {
  name: 'superdoc_section',
  description:
    'Configure page layout, sections, and headers/footers. ' +
    'Use action "get_layout" to see current page setup before making changes.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      action: {
        type: 'string',
        enum: [
          'get_layout',
          'set_margins',
          'set_orientation',
          'set_size',
          'insert_break',
          'list_headers_footers',
          'get_header_footer',
          'set_header_footer',
        ],
        description: 'The section/layout operation to perform.',
      },
      target: { type: 'string', description: 'JSON section address. Defaults to first section if omitted.' },
      // Margins
      top: { type: 'number', description: 'Top margin in points. For action "set_margins".' },
      bottom: { type: 'number', description: 'Bottom margin in points. For action "set_margins".' },
      left: { type: 'number', description: 'Left margin in points. For action "set_margins".' },
      right: { type: 'number', description: 'Right margin in points. For action "set_margins".' },
      // Orientation & size
      orientation: {
        type: 'string',
        enum: ['portrait', 'landscape'],
        description: 'Page orientation. For action "set_orientation".',
      },
      width: { type: 'number', description: 'Page width in points. For action "set_size".' },
      height: { type: 'number', description: 'Page height in points. For action "set_size".' },
      // Section break
      break_type: {
        type: 'string',
        enum: ['page', 'continuous', 'even', 'odd'],
        description: 'Break type. For action "insert_break".',
      },
      // Header/footer
      slot: {
        type: 'string',
        enum: ['default', 'first', 'even'],
        description: 'Header/footer slot. For header/footer actions.',
      },
      kind: { type: 'string', enum: ['header', 'footer'], description: 'Header or footer. For header/footer actions.' },
      content: { type: 'string', description: 'Text content. For action "set_header_footer".' },
    },
    required: ['session_id', 'action'],
  },
  annotations: { readOnlyHint: false },
};
