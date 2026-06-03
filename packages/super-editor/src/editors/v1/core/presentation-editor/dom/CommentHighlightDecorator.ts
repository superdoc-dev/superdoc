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
type InlineStyleProperty = 'backgroundColor' | 'boxShadow';

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
 * Applies an inline style value with a concrete fallback for environments that
 * reject CSS custom property expressions (for example jsdom).
 *
 * We intentionally clear the previous inline value before assigning the
 * preferred one. Some engines leave the old serialized value in place when the
 * new value is invalid, which makes repeated apply() calls look successful even
 * though the new assignment was ignored.
 */
function applyInlineStyleValue(
  el: HTMLElement,
  property: InlineStyleProperty,
  preferredValue: string,
  fallbackValue: string,
): void {
  el.style[property] = '';
  el.style[property] = preferredValue;

  if (!el.style[property]) {
    el.style[property] = fallbackValue;
  }
}

function applyBgColor(el: HTMLElement, color: HighlightToken): void {
  applyInlineStyleValue(el, 'backgroundColor', color.css, color.fallback);
}

function applyBoxShadow(el: HTMLElement, border: HighlightToken): void {
  const preferredValue = `inset 1px 0 0 ${border.css}, inset -1px 0 0 ${border.css}`;
  const fallbackValue = `inset 1px 0 0 ${border.fallback}, inset -1px 0 0 ${border.fallback}`;

  applyInlineStyleValue(el, 'boxShadow', preferredValue, fallbackValue);
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
 * - After `setActiveComment()` when the caller wants to repaint existing DOM
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

      // SD-2528: a comment anchored on tracked-change text shows the TC's
      // own background (green for trackInsert, red for trackDelete) via
      // `.track-insert-dec.highlighted` / `.track-delete-dec.highlighted`.
      // The comment highlight stacking on top of that paints pink/green
      // over the TC color, making an "insert" look pink after re-import.
      // Leave the background alone in that case so the TC color wins
      // (matches Word — comments anchored on a redline don't recolor the
      // redline).
      //
      // AIDEV-NOTE: SD-2528 P2 #2. Suppress comment fill ONLY when the TC
      // is actually painting a competing background. Per layout-engine
      // styles.ts:270-294, that requires both:
      //   - the base class `track-insert-dec` or `track-delete-dec` (not
      //     `track-format-dec`, which only paints a `border-bottom`);
      //   - the `.highlighted` modifier — only applied in "review" / All
      //     Markup mode per renderer.ts:909-928. In Original/Final modes
      //     the modifier is `hidden` / `normal` / `before` and no
      //     background is painted.
      // Without this narrower gate the comment highlight was cleared with
      // nothing to replace it, making the bubble invisible in Original /
      // Final modes and on format-only changes. Hover/focus affordances
      // still come from the TC's own `.track-change-focused` class.
      const isTrackedChangeAnchored =
        el.classList.contains('highlighted') &&
        (el.classList.contains('track-insert-dec') || el.classList.contains('track-delete-dec'));

      if (activeId == null) {
        // No active comment → uniform light highlight
        if (!isTrackedChangeAnchored) {
          applyBgColor(el, primaryIsInternal ? H.INT : H.EXT);
        } else {
          el.style.backgroundColor = '';
        }
        el.style.boxShadow = '';
        continue;
      }

      // Try to match activeId against this element's comment IDs
      const matchedId = this.#resolveMatch(activeId, ids, el.dataset.commentImportedIds);

      if (matchedId != null) {
        // This element belongs to the active comment → bright highlight
        const matchIsInternal = internalIds.has(matchedId);
        if (!isTrackedChangeAnchored) {
          applyBgColor(el, matchIsInternal ? H.INT_ACTIVE : H.EXT_ACTIVE);
        } else {
          el.style.backgroundColor = '';
        }

        // Nested comments: other IDs besides the active one
        const hasNested = ids.length > 1;
        if (hasNested) {
          applyBoxShadow(el, matchIsInternal ? H.INT_NESTED_BDR : H.EXT_NESTED_BDR);
        } else {
          el.style.boxShadow = '';
        }
      } else {
        // Active comment is set but doesn't match this element → faded
        if (!isTrackedChangeAnchored) {
          applyBgColor(el, primaryIsInternal ? H.INT_FADED : H.EXT_FADED);
        } else {
          el.style.backgroundColor = '';
        }
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
