import type { TextRun } from '@superdoc/contracts';
import type { PMNode } from '../../types.js';
import { textNodeToRun } from './text-run.js';
import { type InlineConverterParams } from './common.js';

/**
 * Converts a `bookmarkEnd` PM node.
 *
 * SD-2454: when `converterContext.showBookmarks` is true, emit a visible gray
 * `]` marker at the bookmark end. Matches Word's "Show bookmarks" rendering.
 * Returns void (no visual output) when the option is off, preserving today's
 * behavior where bookmarkEnd is an invisible structural marker.
 *
 * The PM schema does not store the bookmark name on bookmarkEnd — only the
 * numeric `id` that matches the corresponding bookmarkStart. We therefore
 * don't set a tooltip on the closing bracket (Word also omits the name on
 * the closing bracket's hover). Styling and identification happen on the
 * opening bracket.
 */
export function bookmarkEndNodeToRun(params: InlineConverterParams): TextRun | void {
  const { node, converterContext } = params;
  if (converterContext?.showBookmarks !== true) return;

  const nodeAttrs =
    typeof node.attrs === 'object' && node.attrs !== null ? (node.attrs as Record<string, unknown>) : {};
  const bookmarkId = typeof nodeAttrs.id === 'string' || typeof nodeAttrs.id === 'number' ? String(nodeAttrs.id) : '';

  // Only emit `]` if we emitted the matching `[`. Keeps brackets paired and
  // prevents an orphan closing bracket for a suppressed auto-generated
  // bookmark (`_Toc…`, `_Ref…`, `_GoBack`).
  const rendered = converterContext?.renderedBookmarkIds;
  if (rendered && bookmarkId && !rendered.has(bookmarkId)) return;

  const run = textNodeToRun({
    ...params,
    node: { type: 'text', text: ']', marks: [...(node.marks ?? [])] } as PMNode,
  });
  run.dataAttrs = {
    ...(run.dataAttrs ?? {}),
    'data-bookmark-marker': 'end',
    ...(bookmarkId ? { 'data-bookmark-id': bookmarkId } : {}),
  };
  return run;
}
