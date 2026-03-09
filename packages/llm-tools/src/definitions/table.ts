import type { ToolDefinition } from '../types.js';

export const tableTool: ToolDefinition = {
  name: 'superdoc_table',
  description:
    'Read or modify a table. Use superdoc_find with type "table" to get the table address first. ' +
    'Supports getting table info, inserting/deleting rows and columns, merging cells, styling, and sorting.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID from superdoc_open.' },
      action: {
        type: 'string',
        enum: ['get', 'insert_row', 'delete_row', 'insert_column', 'delete_column', 'merge_cells', 'set_style', 'sort'],
        description: 'The table operation to perform.',
      },
      target: { type: 'string', description: 'JSON table address from superdoc_find results.' },
      position: { type: 'number', description: 'Row or column index for insert/delete operations.' },
      range: { type: 'string', description: 'Cell range for merge_cells (e.g. "A1:C3").' },
      style: { type: 'string', description: 'Table style name for set_style.' },
      column: { type: 'number', description: 'Column index to sort by.' },
      direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction.' },
    },
    required: ['session_id', 'action', 'target'],
  },
  annotations: { readOnlyHint: false },
};
