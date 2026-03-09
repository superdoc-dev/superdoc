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
    case 'update_link':
      return execute('hyperlinks.patch', {
        target: params.id,
        patch: { href: params.url, ...(params.text != null ? { text: params.text } : {}) },
      });
    case 'remove_link':
      return execute('hyperlinks.remove', { target: params.id });
    // Bookmarks
    case 'list_bookmarks':
      return execute('bookmarks.list', {});
    case 'insert_bookmark':
      return execute('bookmarks.insert', { at: target, name: params.name });
    case 'remove_bookmark':
      return execute('bookmarks.remove', { target: params.id });
    // Footnotes
    case 'list_footnotes':
      return execute('footnotes.list', {});
    case 'insert_footnote':
      return execute('footnotes.insert', {
        at: target,
        type: params.note_type ?? 'footnote',
        content: params.text,
      });
    case 'remove_footnote':
      return execute('footnotes.remove', { target: params.id });
    default:
      throw new Error(`Unknown reference action: "${action}".`);
  }
}
