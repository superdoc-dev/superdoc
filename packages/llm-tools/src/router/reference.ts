import type { Executor } from '../types.js';
import { parseTarget } from './utils.js';

export async function routeReference(params: Record<string, unknown>, execute: Executor) {
  const action = params.action as string;
  const target = parseTarget(params);

  switch (action) {
    // Hyperlinks
    case 'list_links':
      return execute('hyperlinks.list', {});
    case 'insert_link':
      return execute('hyperlinks.insert', {
        target,
        text: params.text,
        link: { destination: { href: params.url } },
      });
    case 'update_link': {
      const linkTarget = parseTarget(params, 'id');
      return execute('hyperlinks.patch', {
        target: linkTarget,
        patch: { href: params.url, ...(params.text != null ? { tooltip: params.text } : {}) },
      });
    }
    case 'remove_link': {
      const linkTarget = parseTarget(params, 'id');
      return execute('hyperlinks.remove', { target: linkTarget });
    }
    // Bookmarks
    case 'list_bookmarks':
      return execute('bookmarks.list', {});
    case 'insert_bookmark':
      return execute('bookmarks.insert', { at: target, name: params.name });
    case 'remove_bookmark': {
      const bookmarkTarget = parseTarget(params, 'id');
      return execute('bookmarks.remove', { target: bookmarkTarget });
    }
    // Footnotes
    case 'list_footnotes':
      return execute('footnotes.list', {});
    case 'insert_footnote':
      return execute('footnotes.insert', {
        at: target,
        type: params.note_type ?? 'footnote',
        content: params.text,
      });
    case 'remove_footnote': {
      const footnoteTarget = parseTarget(params, 'id');
      return execute('footnotes.remove', { target: footnoteTarget });
    }
    default:
      throw new Error(`Unknown reference action: "${action}".`);
  }
}
