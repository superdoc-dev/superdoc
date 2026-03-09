import type { Executor } from '../types.js';
import { parseTarget } from './utils.js';

const BREAK_TYPE_MAP: Record<string, string> = {
  page: 'nextPage',
  continuous: 'continuous',
  even: 'evenPage',
  odd: 'oddPage',
};

export async function routeSection(params: Record<string, unknown>, execute: Executor) {
  const action = params.action as string;
  const target = parseTarget(params);

  switch (action) {
    case 'get_layout':
      return execute('sections.get', { address: target });
    case 'set_margins':
      return execute('sections.setPageMargins', {
        target,
        top: params.top,
        bottom: params.bottom,
        left: params.left,
        right: params.right,
      });
    case 'set_orientation':
      return execute('sections.setPageSetup', { target, orientation: params.orientation });
    case 'set_size':
      return execute('sections.setPageSetup', { target, width: params.width, height: params.height });
    case 'insert_break': {
      const breakType = BREAK_TYPE_MAP[params.break_type as string] ?? params.break_type;
      return execute('create.sectionBreak', { breakType });
    }
    case 'list_headers_footers':
      return execute('headerFooters.list', { section: target, kind: params.kind });
    case 'get_header_footer':
      return execute('headerFooters.get', {
        target: {
          kind: 'headerFooterSlot',
          section: target,
          headerFooterKind: params.kind,
          variant: params.slot ?? 'default',
        },
      });
    case 'set_header_footer':
      return execute('headerFooters.parts.create', { kind: params.kind });
    default:
      throw new Error(`Unknown section action: "${action}".`);
  }
}
