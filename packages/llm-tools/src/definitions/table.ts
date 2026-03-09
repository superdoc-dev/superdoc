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
        enum: [
          'get',
          'set_cells',
          'insert_row',
          'delete_row',
          'insert_column',
          'delete_column',
          'merge_cells',
          'set_style',
          'sort',
        ],
        description: 'The table operation to perform.',
      },
      target: { type: 'string', description: 'JSON table address from superdoc_find results.' },
      data: {
        type: 'array',
        items: { type: 'array', items: { type: 'string' } },
        description:
          'For set_cells: 2D array of cell values. Row-major order, e.g. [["A1","B1"],["A2","B2"]]. ' +
          'Fills cells from the table node; skips null/empty values.',
      },
      position: {
        type: 'string',
        description: 'Position for insert operations (e.g. "above", "below", "left", "right").',
      },
      column_index: { type: 'number', description: 'Column index for insert_column/delete_column.' },
      start: {
        type: 'object',
        properties: { rowIndex: { type: 'number' }, columnIndex: { type: 'number' } },
        description: 'Start cell for merge_cells. e.g. {"rowIndex": 0, "columnIndex": 0}',
      },
      end: {
        type: 'object',
        properties: { rowIndex: { type: 'number' }, columnIndex: { type: 'number' } },
        description: 'End cell for merge_cells. e.g. {"rowIndex": 1, "columnIndex": 2}',
      },
      style: { type: 'string', description: 'Table style name for set_style.' },
      keys: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            columnIndex: { type: 'number' },
            direction: { type: 'string', enum: ['ascending', 'descending'] },
            type: { type: 'string', enum: ['text', 'number', 'date'] },
          },
        },
        description: 'Sort keys for action "sort". e.g. [{"columnIndex": 0, "direction": "ascending", "type": "text"}]',
      },
    },
    required: ['session_id', 'action', 'target'],
  },
  annotations: { readOnlyHint: false },
};
