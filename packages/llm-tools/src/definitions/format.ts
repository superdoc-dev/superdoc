import type { ToolDefinition } from '../types.js';

export const formatTool: ToolDefinition = {
  name: 'superdoc_format',
  description:
    'Change how content looks. Supports inline styles (bold, italic, font, size, color), ' +
    'paragraph formatting (alignment, spacing, indentation), and named styles. ' +
    'Provide any combination of properties — they are applied together. ' +
    'Use superdoc_find first to get a target address.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      target: {
        type: 'string',
        description:
          'JSON address from superdoc_find. Accepts both text addresses (with range) and content addresses ' +
          '(just nodeId) — content addresses are auto-resolved to cover the full block text.',
      },
      suggest: { type: 'boolean', description: 'If true, creates a tracked change.' },
      // Inline formatting
      bold: { type: 'boolean', description: 'Set or remove bold.' },
      italic: { type: 'boolean', description: 'Set or remove italic.' },
      underline: { type: 'boolean', description: 'Set or remove underline.' },
      strikethrough: { type: 'boolean', description: 'Set or remove strikethrough.' },
      font: { type: 'string', description: 'Font family name (e.g. "Arial", "Times New Roman").' },
      size: { type: 'number', description: 'Font size in points.' },
      color: { type: 'string', description: 'Text color as hex (e.g. "#FF0000") or name.' },
      highlight: { type: 'string', description: 'Highlight/background color.' },
      // Paragraph formatting
      alignment: {
        type: 'string',
        enum: ['left', 'center', 'right', 'justified'],
        description: 'Paragraph alignment.',
      },
      line_spacing: { type: 'number', description: 'Line spacing multiplier.' },
      space_before: { type: 'number', description: 'Space before paragraph in points.' },
      space_after: { type: 'number', description: 'Space after paragraph in points.' },
      indent_left: { type: 'number', description: 'Left indentation in points.' },
      indent_right: { type: 'number', description: 'Right indentation in points.' },
      // Named style
      style: { type: 'string', description: 'Named style to apply (e.g. "Heading 1", "Normal", "Title").' },
    },
    required: ['session_id', 'target'],
  },
  annotations: { readOnlyHint: false, idempotentHint: true },
};
