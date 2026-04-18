import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommentHighlightDecorator } from './CommentHighlightDecorator.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLDivElement {
  return document.createElement('div');
}

/**
 * Creates a comment-highlighted span with the given metadata.
 * Replicates the attributes the painter stamps on text runs.
 */
function commentSpan(opts: {
  commentIds: string[];
  internalIds?: string[];
  importedIds?: Array<{ importedId: string; commentId: string }>;
  text?: string;
}): HTMLSpanElement {
  const el = document.createElement('span');
  el.classList.add('superdoc-comment-highlight');
  el.dataset.commentIds = opts.commentIds.join(',');
  if (opts.internalIds && opts.internalIds.length > 0) {
    el.dataset.commentInternal = 'true';
    el.dataset.commentInternalIds = opts.internalIds.join(',');
  }
  if (opts.importedIds && opts.importedIds.length > 0) {
    el.dataset.commentImportedIds = opts.importedIds.map((e) => `${e.importedId}=${e.commentId}`).join(',');
  }
  el.textContent = opts.text ?? 'text';
  return el;
}

/** Creates a tracked-change element with the given ID. */
function trackChangeSpan(id: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.dataset.trackChangeId = id;
  el.textContent = 'tracked';
  return el;
}

function setActiveCommentAndApply(decorator: CommentHighlightDecorator, commentId: string | null): void {
  decorator.setActiveComment(commentId);
  decorator.apply();
}

/**
 * Simulates a browser that preserves CSS custom property expressions in the
 * inline backgroundColor style. jsdom drops them, so tests need an explicit
 * stand-in when verifying token-backed reapplication behavior.
 */
function preserveAssignedBackgroundColor(el: HTMLElement): () => void {
  let value = '';

  Object.defineProperty(el.style, 'backgroundColor', {
    configurable: true,
    get() {
      return value;
    },
    set(nextValue: string) {
      value = nextValue;
    },
  });

  return () => {
    Reflect.deleteProperty(el.style, 'backgroundColor');
  };
}

// Fallback color constants (jsdom doesn't support var())
const EXT = '#B1124B40';
const EXT_ACTIVE = '#B1124B66';
const EXT_FADED = '#B1124B20';
const INT = '#07838340';
const INT_ACTIVE = '#07838366';
const INT_FADED = '#07838320';
const EXT_NESTED_BDR = '#B1124B99';
const INT_NESTED_BDR = '#07838399';
const EXT_ACTIVE_TOKEN = `var(--sd-comments-highlight-external-active, ${EXT_ACTIVE})`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommentHighlightDecorator', () => {
  let container: HTMLDivElement;
  let decorator: CommentHighlightDecorator;

  beforeEach(() => {
    container = createContainer();
    decorator = new CommentHighlightDecorator();
    decorator.setContainer(container);
  });

  afterEach(() => {
    decorator.destroy();
  });

  // ── No active comment ──────────────────────────────────────────────

  describe('no active comment (uniform highlight)', () => {
    it('applies external highlight color to external comments', () => {
      const span = commentSpan({ commentIds: ['c-1'] });
      container.appendChild(span);

      decorator.apply();

      expect(span.style.backgroundColor).toBe(EXT);
      expect(span.style.boxShadow).toBe('');
    });

    it('applies internal highlight color to internal comments', () => {
      const span = commentSpan({ commentIds: ['c-1'], internalIds: ['c-1'] });
      container.appendChild(span);

      decorator.apply();

      expect(span.style.backgroundColor).toBe(INT);
    });

    it('applies uniform highlight to multiple elements', () => {
      const s1 = commentSpan({ commentIds: ['c-1'] });
      const s2 = commentSpan({ commentIds: ['c-2'], internalIds: ['c-2'] });
      container.append(s1, s2);

      decorator.apply();

      expect(s1.style.backgroundColor).toBe(EXT);
      expect(s2.style.backgroundColor).toBe(INT);
    });
  });

  // ── Active comment matches ─────────────────────────────────────────

  describe('active comment matches element', () => {
    it('applies active highlight to matching element', () => {
      const span = commentSpan({ commentIds: ['c-1'] });
      container.appendChild(span);

      setActiveCommentAndApply(decorator, 'c-1');

      expect(span.style.backgroundColor).toBe(EXT_ACTIVE);
      expect(span.style.boxShadow).toBe('');
    });

    it('applies internal active highlight when match is internal', () => {
      const span = commentSpan({ commentIds: ['c-1'], internalIds: ['c-1'] });
      container.appendChild(span);

      setActiveCommentAndApply(decorator, 'c-1');

      expect(span.style.backgroundColor).toBe(INT_ACTIVE);
    });

    it('fades non-matching elements when active is set', () => {
      const active = commentSpan({ commentIds: ['c-1'] });
      const other = commentSpan({ commentIds: ['c-2'] });
      container.append(active, other);

      setActiveCommentAndApply(decorator, 'c-1');

      expect(active.style.backgroundColor).toBe(EXT_ACTIVE);
      expect(other.style.backgroundColor).toBe(EXT_FADED);
    });

    it('uses internal faded color for non-matching internal comments', () => {
      const active = commentSpan({ commentIds: ['c-1'] });
      const other = commentSpan({ commentIds: ['c-2'], internalIds: ['c-2'] });
      container.append(active, other);

      setActiveCommentAndApply(decorator, 'c-1');

      expect(other.style.backgroundColor).toBe(INT_FADED);
    });
  });

  // ── Nested comments ────────────────────────────────────────────────

  describe('nested comments', () => {
    it('applies box-shadow when element has multiple comment IDs and active matches', () => {
      const span = commentSpan({ commentIds: ['c-1', 'c-2'] });
      container.appendChild(span);

      setActiveCommentAndApply(decorator, 'c-1');

      expect(span.style.backgroundColor).toBe(EXT_ACTIVE);
      expect(span.style.boxShadow).toContain(EXT_NESTED_BDR);
    });

    it('uses internal nested border when active comment is internal', () => {
      const span = commentSpan({ commentIds: ['c-1', 'c-2'], internalIds: ['c-1'] });
      container.appendChild(span);

      setActiveCommentAndApply(decorator, 'c-1');

      expect(span.style.boxShadow).toContain(INT_NESTED_BDR);
    });

    it('clears box-shadow when element has only one comment ID', () => {
      const span = commentSpan({ commentIds: ['c-1'] });
      span.style.boxShadow = 'stale';
      container.appendChild(span);

      setActiveCommentAndApply(decorator, 'c-1');

      expect(span.style.boxShadow).toBe('');
    });
  });

  // ── importedId matching ────────────────────────────────────────────

  describe('importedId matching', () => {
    it('matches active comment by importedId alias', () => {
      const span = commentSpan({
        commentIds: ['uuid-1'],
        importedIds: [{ importedId: 'w:comment-7', commentId: 'uuid-1' }],
      });
      container.appendChild(span);

      setActiveCommentAndApply(decorator, 'w:comment-7');

      expect(span.style.backgroundColor).toBe(EXT_ACTIVE);
    });

    it('uses correct internal flag when matched via importedId', () => {
      const span = commentSpan({
        commentIds: ['uuid-1'],
        internalIds: ['uuid-1'],
        importedIds: [{ importedId: 'w:comment-7', commentId: 'uuid-1' }],
      });
      container.appendChild(span);

      setActiveCommentAndApply(decorator, 'w:comment-7');

      expect(span.style.backgroundColor).toBe(INT_ACTIVE);
    });
  });

  // ── setActiveComment lifecycle ─────────────────────────────────────

  describe('setActiveComment', () => {
    it('returns true when value changes', () => {
      expect(decorator.setActiveComment('c-1')).toBe(true);
    });

    it('updates state without mutating DOM until apply() runs', () => {
      const span = commentSpan({ commentIds: ['c-1'] });
      container.appendChild(span);

      decorator.setActiveComment('c-1');
      expect(span.style.backgroundColor).toBe('');

      decorator.apply();
      expect(span.style.backgroundColor).toBe(EXT_ACTIVE);
    });

    it('returns false when value is the same', () => {
      decorator.setActiveComment('c-1');
      expect(decorator.setActiveComment('c-1')).toBe(false);
    });

    it('reverts to uniform highlight when set to null', () => {
      const span = commentSpan({ commentIds: ['c-1'] });
      container.appendChild(span);

      setActiveCommentAndApply(decorator, 'c-1');
      expect(span.style.backgroundColor).toBe(EXT_ACTIVE);

      setActiveCommentAndApply(decorator, null);
      expect(span.style.backgroundColor).toBe(EXT);
    });

    it('exposes active comment ID via getter', () => {
      expect(decorator.getActiveCommentId()).toBe(null);
      decorator.setActiveComment('c-1');
      expect(decorator.getActiveCommentId()).toBe('c-1');
    });

    it('keeps CSS-variable-backed colors on repeated apply() calls when the browser accepts them', () => {
      const span = commentSpan({ commentIds: ['c-1'] });
      const restoreBackgroundColor = preserveAssignedBackgroundColor(span);
      container.appendChild(span);

      try {
        setActiveCommentAndApply(decorator, 'c-1');
        expect(span.style.backgroundColor).toBe(EXT_ACTIVE_TOKEN);

        decorator.apply();

        expect(span.style.backgroundColor).toBe(EXT_ACTIVE_TOKEN);
      } finally {
        restoreBackgroundColor();
      }
    });
  });

  // ── Track change focused ───────────────────────────────────────────

  describe('track change focused', () => {
    it('adds track-change-focused class when ID matches active comment', () => {
      const tc = trackChangeSpan('tc-1');
      container.appendChild(tc);

      setActiveCommentAndApply(decorator, 'tc-1');

      expect(tc.classList.contains('track-change-focused')).toBe(true);
    });

    it('removes track-change-focused class when active changes', () => {
      const tc = trackChangeSpan('tc-1');
      container.appendChild(tc);

      setActiveCommentAndApply(decorator, 'tc-1');
      expect(tc.classList.contains('track-change-focused')).toBe(true);

      setActiveCommentAndApply(decorator, 'other');
      expect(tc.classList.contains('track-change-focused')).toBe(false);
    });

    it('removes class when active is cleared', () => {
      const tc = trackChangeSpan('tc-1');
      container.appendChild(tc);

      setActiveCommentAndApply(decorator, 'tc-1');
      setActiveCommentAndApply(decorator, null);

      expect(tc.classList.contains('track-change-focused')).toBe(false);
    });
  });

  // ── destroy ────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('clears all applied styles', () => {
      const span = commentSpan({ commentIds: ['c-1', 'c-2'] });
      const tc = trackChangeSpan('c-1');
      container.append(span, tc);

      setActiveCommentAndApply(decorator, 'c-1');
      expect(span.style.backgroundColor).not.toBe('');
      expect(tc.classList.contains('track-change-focused')).toBe(true);

      decorator.destroy();

      expect(span.style.backgroundColor).toBe('');
      expect(span.style.boxShadow).toBe('');
      expect(tc.classList.contains('track-change-focused')).toBe(false);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('apply() is a no-op when no container is set', () => {
      const dec = new CommentHighlightDecorator();
      // Should not throw
      dec.apply();
      dec.setActiveComment('c-1');
      dec.apply();
    });

    it('skips elements without data-comment-ids', () => {
      const span = document.createElement('span');
      span.classList.add('superdoc-comment-highlight');
      container.appendChild(span);

      // Should not throw
      decorator.apply();
      expect(span.style.backgroundColor).toBe('');
    });
  });
});
