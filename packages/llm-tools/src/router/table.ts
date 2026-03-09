import type { Executor } from '../types.js';
import { parseTarget, extractTableCellParagraphIds } from './utils.js';

export async function routeTable(params: Record<string, unknown>, execute: Executor) {
  const action = params.action as string;
  const target = parseTarget(params);

  switch (action) {
    case 'get':
      return execute('tables.get', { target });
    case 'set_cells':
      return setTableCells(target, params.data as unknown[][], execute);
    case 'insert_row':
      return execute('tables.insertRow', { target, position: params.position });
    case 'delete_row':
      return execute('tables.deleteRow', { target });
    case 'insert_column':
      return execute('tables.insertColumn', {
        tableTarget: target,
        columnIndex: params.column_index,
        position: params.position,
      });
    case 'delete_column':
      return execute('tables.deleteColumn', {
        tableTarget: target,
        columnIndex: params.column_index,
      });
    case 'merge_cells':
      return execute('tables.mergeCells', {
        tableTarget: target,
        start: params.start,
        end: params.end,
      });
    case 'set_style':
      return execute('tables.setStyle', { target, styleId: params.style });
    case 'sort':
      return execute('tables.sort', { target, keys: params.keys });
    default:
      throw new Error(
        `Unknown table action: "${action}". Expected one of: get, set_cells, insert_row, delete_row, insert_column, delete_column, merge_cells, set_style, sort.`,
      );
  }
}

/**
 * Batch-populate table cells from a 2D data array.
 * Resolves the table node, extracts each cell's paragraph ID,
 * then inserts text into each cell in a single logical operation.
 */
async function setTableCells(target: unknown, data: unknown[][], execute: Executor) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('set_cells requires a "data" array of rows, e.g. [["A","B"],["C","D"]].');
  }

  // Resolve the table target to get the node structure
  const tgt = target as Record<string, unknown>;
  const nodeId = tgt?.nodeId ?? tgt?.blockId;
  if (!nodeId) throw new Error('set_cells target must include a nodeId (content address of the table).');

  const nodeResult = (await execute('getNodeById', { nodeId })) as Record<string, unknown>;
  const node = nodeResult.node as Record<string, unknown>;
  if (!node) throw new Error('Could not resolve table node.');

  const cellIds = extractTableCellParagraphIds(node);
  if (!cellIds) throw new Error('Target is not a table or has no rows.');

  let cellsSet = 0;
  for (let r = 0; r < data.length && r < cellIds.length; r++) {
    const row = data[r] as unknown[];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length && c < cellIds[r].length; c++) {
      const text = row[c];
      if (text == null || text === '') continue;
      const paragraphId = cellIds[r][c];
      if (!paragraphId) continue;
      const cellTarget = { kind: 'text', blockId: paragraphId, range: { start: 0, end: 0 } };
      await execute('insert', { value: String(text), target: cellTarget });
      cellsSet++;
    }
  }

  return { success: true, cellsSet, rows: Math.min(data.length, cellIds.length), columns: cellIds[0]?.length ?? 0 };
}
