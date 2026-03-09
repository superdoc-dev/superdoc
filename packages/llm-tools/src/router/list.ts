import type { Executor } from '../types.js';
import { parseTarget } from './utils.js';

export async function routeList(params: Record<string, unknown>, execute: Executor) {
  const action = params.action as string;
  const target = parseTarget(params);

  switch (action) {
    case 'insert': {
      const input: Record<string, unknown> = { target, position: params.position ?? 'after' };
      if (params.text) input.text = params.text;
      return execute('lists.insert', input);
    }
    case 'indent':
      return execute('lists.indent', { target });
    case 'outdent':
      return execute('lists.outdent', { target });
    case 'set_type':
      return execute('lists.setType', { target, kind: params.kind });
    case 'detach':
      return execute('lists.detach', { target });
    default:
      throw new Error(`Unknown list action: "${action}".`);
  }
}
