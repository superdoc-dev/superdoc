import type { Executor } from '../types.js';
import { parseTarget } from './utils.js';

export async function routeComment(params: Record<string, unknown>, execute: Executor) {
  const action = params.action as string;

  switch (action) {
    case 'list': {
      const input: Record<string, unknown> = {};
      if (params.include_resolved) input.includeResolved = params.include_resolved;
      return execute('comments.list', input);
    }
    case 'create': {
      const target = parseTarget(params);
      if (!target)
        throw new Error('Target is required for "create" action. Use superdoc_find first to get a target address.');
      return execute('comments.create', { text: params.text, target });
    }
    case 'reply':
      return execute('comments.create', { parentCommentId: params.comment_id, text: params.text });
    case 'resolve':
      return execute('comments.patch', { commentId: params.comment_id, status: 'resolved' });
    case 'delete':
      return execute('comments.delete', { commentId: params.comment_id });
    default:
      throw new Error(`Unknown comment action: "${action}".`);
  }
}
