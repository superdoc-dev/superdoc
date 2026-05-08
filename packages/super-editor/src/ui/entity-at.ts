/**
 * Walk a painted-DOM element chain (innermost → outermost) and
 * collect entity hits for `ui.viewport.entityAt`.
 *
 * Pure function — takes a starting element, returns the hits. The
 * `document.elementFromPoint` lookup that produces the starting
 * element lives in the controller; this helper is what makes the
 * data-attribute walk testable without stubbing globals.
 */

import type { ViewportEntityHit } from './types.js';

/**
 * Read painted entities off `el` and every ancestor up to the document
 * root. Innermost-first ordering: a tracked change inside a comment
 * highlight returns `[{ trackedChange }, { comment }]`, matching what
 * a switch on `hits[0]` expects when picking the most specific entity.
 *
 * Returns `[]` for null / non-Element starts. Uses duck-typed
 * `getAttribute` access so it works under any DOM implementation
 * (happy-dom, jsdom, real browser) without an `instanceof` check that
 * could fail across realms.
 */
export function collectEntityHitsFromChain(start: Element | null): ViewportEntityHit[] {
  if (!start || typeof (start as { getAttribute?: unknown }).getAttribute !== 'function') {
    return [];
  }

  const hits: ViewportEntityHit[] = [];
  const seen = new Set<string>();
  let el: Element | null = start;
  while (el) {
    const node = el as { getAttribute(name: string): string | null };
    const trackChangeId = node.getAttribute('data-track-change-id');
    if (trackChangeId) {
      const key = `trackedChange:${trackChangeId}`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push({ type: 'trackedChange', id: trackChangeId });
      }
    }
    const commentIds = node.getAttribute('data-comment-ids');
    if (commentIds) {
      // The painter stamps overlapping comments as a comma-separated
      // list — surface each id as its own hit so a "Resolve this
      // comment" item in a context menu can target the right one.
      for (const id of commentIds.split(',')) {
        if (!id) continue;
        const key = `comment:${id}`;
        if (!seen.has(key)) {
          seen.add(key);
          hits.push({ type: 'comment', id });
        }
      }
    }
    el = el.parentElement;
  }
  return hits;
}
