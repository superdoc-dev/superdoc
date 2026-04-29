import type { RangeRect } from '../types.js';
import { BODY_STORY_KEY } from '../../../document-api-adapters/story-runtime/story-key.js';

/**
 * Pure DOM helpers shared by `PresentationEditor.getEntityRects` and
 * tests. Kept module-local so the rendering lookup stays a private
 * implementation detail of the presentation editor — `superdoc/ui`
 * never sees the elements, only the resulting rect value objects.
 */

/**
 * Find painted text-run elements that anchor a given comment.
 *
 * The painter writes `data-comment-ids="c1,c2,c3"` (comma-separated)
 * on every text run that carries one or more comment annotations.
 * CSS attribute selectors split tokens on whitespace, not commas, so
 * a naive `[data-comment-ids~="c1"]` would miss every match and a
 * naive `[data-comment-ids*="c1"]` would partial-match `c12` (and
 * any other id whose string contains `c1`). Hand-parse the attribute
 * and compare each token by exact equality.
 *
 * `storyKey` filters by the painted run's enclosing story:
 *   - undefined: match across all stories.
 *   - BODY_STORY_KEY: match runs whose `data-story-key` is body, or
 *     whose attribute is missing entirely (legacy / body runs may
 *     omit the attribute).
 *   - any other: exact match required.
 */
export function findRenderedCommentElements(host: HTMLElement, commentId: string, storyKey?: string): HTMLElement[] {
  if (!host || !commentId) return [];
  const candidates = Array.from(host.querySelectorAll<HTMLElement>('[data-comment-ids]'));
  return candidates.filter((el) => {
    const raw = el.dataset.commentIds;
    if (!raw) return false;
    const matchesId = raw.split(',').some((token) => token.trim() === commentId);
    if (!matchesId) return false;
    if (!storyKey) return true;
    const elStoryKey = el.dataset.storyKey;
    if (elStoryKey) return elStoryKey === storyKey;
    return storyKey === BODY_STORY_KEY;
  });
}

/**
 * Find painted text-run elements that anchor a given tracked change.
 *
 * Strictly story-filtered. The PresentationEditor's existing
 * navigation helper (`#findRenderedTrackedChangeElements`) deliberately
 * falls back to *all* same-id matches when an exact story match
 * doesn't satisfy a navigation heuristic — that fallback is correct
 * for "scroll to this change" because it lets navigation jump to
 * whichever copy is mounted, but it's wrong for `ui.viewport.getRect`:
 * a sticky card asked to anchor a header/footer change must NOT get a
 * body rect just because the body copy happens to be painted. When a
 * `storyKey` is provided here we return *only* exact matches; when no
 * story is provided we return every painted occurrence.
 *
 * The CSS escape inside the selector is mandatory because tracked
 * change ids may contain attribute-special characters (quotes,
 * backslashes); pass an escape function so this helper stays free of
 * the platform-specific `CSS.escape` shim that PresentationEditor
 * already owns.
 */
export function findRenderedTrackedChangeElementsStrict(
  host: HTMLElement,
  entityId: string,
  escapeAttrValue: (value: string) => string,
  storyKey?: string,
): HTMLElement[] {
  if (!host || !entityId) return [];
  const baseSelector = `[data-track-change-id="${escapeAttrValue(entityId)}"]`;
  if (!storyKey) {
    return Array.from(host.querySelectorAll<HTMLElement>(baseSelector));
  }
  const storySelector = `${baseSelector}[data-story-key="${escapeAttrValue(storyKey)}"]`;
  return Array.from(host.querySelectorAll<HTMLElement>(storySelector));
}

/**
 * Convert painted DOM elements to plain viewport-coord `RangeRect`
 * value objects. Drops elements whose `getBoundingClientRect`
 * returns non-finite numbers (defensive: jsdom can return `NaN` for
 * unmounted nodes) and resolves the page index from the enclosing
 * `.superdoc-page` wrapper so callers can route per-page geometry.
 */
export function elementsToRangeRects(elements: HTMLElement[]): RangeRect[] {
  const result: RangeRect[] = [];
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (![rect.top, rect.left, rect.right, rect.bottom, rect.width, rect.height].every(Number.isFinite)) {
      continue;
    }
    const pageEl = element.closest<HTMLElement>('.superdoc-page');
    const pageIndexAttr = Number(pageEl?.dataset?.pageIndex ?? 0);
    result.push({
      pageIndex: Number.isFinite(pageIndexAttr) ? pageIndexAttr : 0,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
  }
  return result;
}
