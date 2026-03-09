import type { ToolDefinition } from '../types.js';

export const controlTool: ToolDefinition = {
  name: 'superdoc_control',
  description:
    'Work with form fields (content controls): text inputs, checkboxes, dropdowns, date pickers. ' +
    'Use action "list" to find all form fields, then "fill" to set values. ' +
    'The "fill" action auto-detects the control type — just provide a value.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      action: {
        type: 'string',
        enum: ['list', 'get', 'fill', 'wrap'],
        description: 'The content control operation to perform.',
      },
      target: { type: 'string', description: 'JSON content control address.' },
      value: {
        description:
          'Value to set. Accepts text string, true/false for checkboxes, or selection value for dropdowns. For action "fill".',
      },
      kind: {
        type: 'string',
        enum: ['block', 'inline'],
        description: 'Content control scope. For action "wrap". Defaults to "block".',
      },
    },
    required: ['session_id', 'action'],
  },
  annotations: { readOnlyHint: false },
};
