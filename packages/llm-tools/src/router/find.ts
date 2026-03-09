import type { Executor } from '../types.js';
import { enrichFindResults } from './utils.js';

export async function routeFind(params: Record<string, unknown>, execute: Executor) {
  const select: Record<string, unknown> = {};

  if (params.pattern) {
    select.type = 'text';
    select.pattern = params.pattern;
    select.mode = 'contains';
    if (params.type) select.nodeKind = params.type;
  } else if (params.type) {
    select.type = 'node';
    select.nodeKind = params.type;
  }

  const query: Record<string, unknown> = { select };
  if (params.limit != null) query.limit = params.limit;
  if (params.offset != null) query.offset = params.offset;

  const result = await execute('find', query);
  return enrichFindResults(result, params.pattern as string | undefined);
}
