// ---------------------------------------------------------------------------
// Comment Highlight Color Tokens
// ---------------------------------------------------------------------------

interface HighlightToken {
  css: string;
  fallback: string;
}

const token = (varName: string, fallback: string): HighlightToken => ({
  css: `var(${varName}, ${fallback})`,
  fallback,
});

const H = {
  EXT: token('--sd-comments-highlight-external', '#B1124B40'),
  EXT_ACTIVE: token('--sd-comments-highlight-external-active', '#B1124B66'),
  EXT_FADED: token('--sd-comments-highlight-external-faded', '#B1124B20'),
  INT: token('--sd-comments-highlight-internal', '#07838340'),
  INT_ACTIVE: token('--sd-comments-highlight-internal-active', '#07838366'),
  INT_FADED: token('--sd-comments-highlight-internal-faded', '#07838320'),
  EXT_NESTED_BDR: token('--sd-comments-highlight-external-nested-border', '#B1124B99'),
  INT_NESTED_BDR: token('--sd-comments-highlight-internal-nested-border', '#07838399'),
} as const;

const TRACK_CHANGE_FOCUSED_CLASS = 'track-change-focused';
const COMMENT_HIGHLIGHT_SELECTOR = '.superdoc-comment-highlight';
const TRACK_CHANGE_SELECTOR = '[data-track-change-id]';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').filter(Boolean);
}

/**
 * Parse `data-comment-imported-ids` into a map of importedId → commentId.
 * Format: "imp1=cid1,imp2=cid2"
 */
function parseImportedIdMap(value: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!value) return map;
  for (const entry of value.split(',')) {
    const eq = entry.indexOf('=');
    if (eq > 0) {
      map.set(entry.slice(0, eq), entry.slice(eq + 1));
    }
  }
  return map;
}

/**
 * Applies a CSS color token to an element's backgroundColor with a jsdom
 * fallback. jsdom drops var() values, so we detect that and use the concrete
 * fallback instead.
 */
function applyBgColor(el: HTMLElement, color: HighlightToken): void {
  const prev = el.style.backgroundColor;
  el.style.backgroundColor = color.css;
  if (!el.style.backgroundColor || el.style.backgroundColor === prev) {
    el.style.backgroundColor = color.fallback;
  }
}

function applyBoxShadow(el: HTMLElement, border: HighlightToken): void {
  el.style.boxShadow = `inset 1px 0 0 ${border.css}, inset -1px 0 0 ${border.css}`;
  if (!el.style.boxShadow) {
    el.style.boxShadow = `inset 1px 0 0 ${border.fallback}, inset -1px 0 0 ${border.fallback}`;
  }
}

// ---------------------------------------------------------------------------
// CommentHighlightDecorator
// ---------------------------------------------------------------------------

/**
 * Applies comment highlight styles to painter-rendered DOM elements.
 *
 * The DomPainter stamps metadata attributes (`data-comment-ids`,
 * `data-comment-internal-ids`, etc.) and the `.superdoc-comment-highlight`
 * class on text runs that belong to comments. This decorator reads that
 * metadata and applies the appropriate `backgroundColor` and `boxShadow`
 * inline styles based on which comment is currently active.
 *
 * ## Ownership boundary
 * The decorator only writes `backgroundColor`, `boxShadow`, and the
 * `track-change-focused` class. It never touches other painter-owned
 * styles or attributes.
 *
 * ## When to call `apply()`
 * - After every `painter.paint()` (new elements in DOM)
 * - After DomPositionIndex observer rebuild (elements may have been replaced)
 * - Internally by `setActiveComment()` (active state changed)
 */
export class CommentHighlightDecorator {
  #activeCommentId: string | null = null;
  #container: HTMLElement | null = null;

  setContainer(container: HTMLElement | null): void {
    this.#container = container;
  }

  getActiveCommentId(): string | null {
    return this.#activeCommentId;
  }

  setActiveComment(commentId: string | null): boolean {
    if (this.#activeCommentId === commentId) return false;
    this.#activeCommentId = commentId;
    this.apply();
    return true;
  }

  apply(): void {
    const root = this.#container;
    if (!root) return;

    this.#applyCommentHighlights(root);
    this.#applyTrackChangeFocus(root);
  }

  destroy(): void {
    const root = this.#container;
    if (!root) return;

    const commentEls = root.querySelectorAll(COMMENT_HIGHLIGHT_SELECTOR);
    for (let i = 0; i < commentEls.length; i++) {
      const el = commentEls[i] as HTMLElement;
      el.style.backgroundColor = '';
      el.style.boxShadow = '';
    }

    const focusedEls = root.querySelectorAll(`.${TRACK_CHANGE_FOCUSED_CLASS}`);
    for (let i = 0; i < focusedEls.length; i++) {
      focusedEls[i].classList.remove(TRACK_CHANGE_FOCUSED_CLASS);
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  #applyCommentHighlights(root: HTMLElement): void {
    const activeId = this.#activeCommentId;
    const elements = root.querySelectorAll(COMMENT_HIGHLIGHT_SELECTOR);

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement;
      const ids = parseCommaSeparated(el.dataset.commentIds);
      if (ids.length === 0) continue;

      const internalIds = new Set(parseCommaSeparated(el.dataset.commentInternalIds));

      // Determine if primary (first) comment is internal — used for uniform/faded colors.
      const primaryIsInternal = internalIds.has(ids[0]);

      if (activeId == null) {
        // No active comment → uniform light highlight
        applyBgColor(el, primaryIsInternal ? H.INT : H.EXT);
        el.style.boxShadow = '';
        continue;
      }

      // Try to match activeId against this element's comment IDs
      const matchedId = this.#resolveMatch(activeId, ids, el.dataset.commentImportedIds);

      if (matchedId != null) {
        // This element belongs to the active comment → bright highlight
        const matchIsInternal = internalIds.has(matchedId);
        applyBgColor(el, matchIsInternal ? H.INT_ACTIVE : H.EXT_ACTIVE);

        // Nested comments: other IDs besides the active one
        const hasNested = ids.length > 1;
        if (hasNested) {
          applyBoxShadow(el, matchIsInternal ? H.INT_NESTED_BDR : H.EXT_NESTED_BDR);
        } else {
          el.style.boxShadow = '';
        }
      } else {
        // Active comment is set but doesn't match this element → faded
        applyBgColor(el, primaryIsInternal ? H.INT_FADED : H.EXT_FADED);
        el.style.boxShadow = '';
      }
    }
  }

  /**
   * Resolve whether `activeId` matches any comment on this element.
   * Returns the canonical commentId if matched, or null.
   */
  #resolveMatch(activeId: string, commentIds: string[], importedIdsAttr: string | undefined): string | null {
    // Direct match by commentId
    if (commentIds.includes(activeId)) return activeId;

    // Fallback: match by importedId alias
    if (importedIdsAttr) {
      const aliases = parseImportedIdMap(importedIdsAttr);
      const canonicalId = aliases.get(activeId);
      if (canonicalId && commentIds.includes(canonicalId)) return canonicalId;
    }

    return null;
  }

  #applyTrackChangeFocus(root: HTMLElement): void {
    const activeId = this.#activeCommentId;
    const elements = root.querySelectorAll(TRACK_CHANGE_SELECTOR);

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement;
      if (activeId && el.dataset.trackChangeId === activeId) {
        el.classList.add(TRACK_CHANGE_FOCUSED_CLASS);
      } else {
        el.classList.remove(TRACK_CHANGE_FOCUSED_CLASS);
      }
    }
  }
}
