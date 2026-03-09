import type { Executor } from '../types.js';
import { parseTarget, trackedOptions } from './utils.js';

export async function routeEdit(params: Record<string, unknown>, execute: Executor) {
  const action = params.action as string;
  const target = parseTarget(params);
  const options = trackedOptions(params);

  switch (action) {
    case 'insert':
      return execute('insert', { text: params.text, target }, options);
    case 'replace':
      return execute('replace', { text: params.text, target }, options);
    case 'delete':
      return execute('delete', { target }, options);
    default:
      throw new Error(`Unknown edit action: "${action}". Expected one of: insert, replace, delete.`);
  }
}
