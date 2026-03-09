import type { Executor } from '../types.js';
import { parseTarget } from './utils.js';

export async function routeTable(params: Record<string, unknown>, execute: Executor) {
  const action = params.action as string;
  const target = parseTarget(params);

  switch (action) {
    case 'get':
      return execute('tables.get', { target });
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
      throw new Error(`Unknown table action: "${action}".`);
  }
}
