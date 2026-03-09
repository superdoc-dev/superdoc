import type { Executor } from '../types.js';

export async function routeFind(params: Record<string, unknown>, execute: Executor) {
  const input: Record<string, unknown> = {};

  if (params.pattern && params.type) {
    // Both: text search filtered by node type
    input.type = 'text';
    input.pattern = params.pattern;
    input.mode = 'contains';
    input.nodeType = params.type;
  } else if (params.pattern) {
    input.type = 'text';
    input.pattern = params.pattern;
    input.mode = 'contains';
  } else if (params.type) {
    input.type = 'node';
    input.nodeType = params.type;
  }

  if (params.limit != null || params.offset != null) {
    const select = { ...input };
    const outer: Record<string, unknown> = { select };
    if (params.limit != null) outer.limit = params.limit;
    if (params.offset != null) outer.offset = params.offset;
    return execute('find', outer);
  }

  return execute('find', input);
}
