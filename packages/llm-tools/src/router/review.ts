import type { Executor } from '../types.js';

export async function routeReview(params: Record<string, unknown>, execute: Executor) {
  const action = params.action as string;

  switch (action) {
    case 'list': {
      const input: Record<string, unknown> = {};
      if (params.type) input.type = params.type;
      return execute('trackChanges.list', input);
    }
    case 'accept':
      return execute('trackChanges.decide', { decision: 'accept', target: { id: params.id } });
    case 'reject':
      return execute('trackChanges.decide', { decision: 'reject', target: { id: params.id } });
    case 'accept_all':
      return execute('trackChanges.decide', { decision: 'accept', target: { scope: 'all' } });
    case 'reject_all':
      return execute('trackChanges.decide', { decision: 'reject', target: { scope: 'all' } });
    default:
      throw new Error(`Unknown review action: "${action}".`);
  }
}
