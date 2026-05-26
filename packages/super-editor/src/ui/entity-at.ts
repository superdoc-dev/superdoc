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

function parseCommaSeparatedIds(value: string): string[] {
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function getTrackChangeIds(node: { getAttribute(name: string): string | null }): string[] {
  const trackChangeIds = node.getAttribute('data-track-change-ids');
  if (trackChangeIds !== null) {
    const ids = parseCommaSeparatedIds(trackChangeIds);
    if (ids.length > 0) return ids;
  }

  const trackChangeId = node.getAttribute('data-track-change-id');
  return trackChangeId ? [trackChangeId] : [];
}

function orderTrackChangeIds(ids: string[], preferredTargetId: string | null): string[] {
  if (!preferredTargetId || !ids.includes(preferredTargetId)) return ids;
  return [preferredTargetId, ...ids.filter((id) => id !== preferredTargetId)];
}

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
    const trackChangeIds = orderTrackChangeIds(
      getTrackChangeIds(node),
      node.getAttribute('data-track-change-preferred-target-id'),
    );
    for (const trackChangeId of trackChangeIds) {
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
    // Content controls (Structured Document Tags). The painter stamps
    // `data-sdt-id` and `data-sdt-type` on every SDT wrapper; only
    // `structuredContent` maps to the Document API's `contentControls.*`
    // namespace, so the walk filters explicitly on that. Other
    // `data-sdt-type` values (`fieldAnnotation`, `documentSection`,
    // `docPartObject`) intentionally do not surface here. Nested SDTs
    // surface innermost-first so a switch on `hits[0]` picks the
    // tightest control.
    const sdtType = node.getAttribute('data-sdt-type');
    const sdtId = node.getAttribute('data-sdt-id');
    if (sdtId && sdtType === 'structuredContent') {
      const key = `contentControl:${sdtId}`;
      if (!seen.has(key)) {
        seen.add(key);
        const scopeAttr = node.getAttribute('data-sdt-scope');
        const tag = node.getAttribute('data-sdt-tag');
        const hit: { type: 'contentControl'; id: string; scope?: 'block' | 'inline'; tag?: string } = {
          type: 'contentControl',
          id: sdtId,
        };
        if (scopeAttr === 'block' || scopeAttr === 'inline') hit.scope = scopeAttr;
        if (tag) hit.tag = tag;
        hits.push(hit);
      }
    }
    el = el.parentElement;
  }
  return hits;
}
