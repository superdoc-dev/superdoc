import type { Executor } from '../types.js';
import { parseTarget } from './utils.js';

const WRAP_TYPE_MAP: Record<string, string> = {
  inline: 'Inline',
  square: 'Square',
  tight: 'Tight',
  through: 'Through',
  top_and_bottom: 'TopAndBottom',
  none: 'None',
};

export async function routeImage(params: Record<string, unknown>, execute: Executor) {
  const action = params.action as string;

  if (action === 'list') {
    return execute('images.list', {});
  }

  // Image operations use imageId (string), not a structured address.
  // The target from superdoc_find is a JSON string; we parse it and
  // extract the node ID if it's an object, or use it directly if it's a string.
  const parsed = parseTarget(params);
  const imageId =
    typeof parsed === 'object' && parsed !== null
      ? ((parsed as Record<string, unknown>).nodeId ?? (parsed as Record<string, unknown>).id)
      : parsed;

  switch (action) {
    case 'get':
      return execute('images.get', { imageId });
    case 'resize':
      return execute('images.setSize', { imageId, size: { width: params.width, height: params.height } });
    case 'set_alt_text':
      return execute('images.setAltText', { imageId, description: params.alt_text });
    case 'set_wrap': {
      const wrapType = WRAP_TYPE_MAP[params.wrap as string] ?? params.wrap;
      return execute('images.setWrapType', { imageId, type: wrapType });
    }
    case 'delete':
      return execute('images.delete', { imageId });
    default:
      throw new Error(`Unknown image action: "${action}".`);
  }
}
