/**
 * Pure RTL text-geometry substrate (V2 RTL Plan 004).
 *
 * A direction-aware bridge between a measured line's **logical** advance space
 * (what `measureCharacterX` / `findCharacterAtX` produce — always walked in
 * logical/source run order) and the **container-space x** the painter draws at.
 *
 * For LTR this is the identity: logical char 0 sits at the content's left edge
 * and the caret x grows with the logical advance. For a *simple* horizontal RTL
 * line the painter renders the same logical runs with `dir="rtl"`, so the
 * browser lays the content out right-to-left within the (right-aligned by
 * default) content box. The visual position is therefore the mirror of the
 * logical advance about the content box:
 *
 *   logical char 0  -> visual RIGHT edge   (contentLeft + contentWidth)
 *   logical char N  -> visual LEFT edge    (contentLeft)
 *
 * These helpers fold that mirror into one place so caret rects, click-to-offset,
 * selection rects, and vertical desired-x motion stay consistent and the
 * forward/inverse pair cannot drift apart. They are intentionally pure (no DOM,
 * no canvas, no block/line knowledge) so the caret/selection/keyboard and
 * (later) table-cell plans can all reuse them.
 *
 * Scope boundary — this is correct only for a **single bidi level** (pure RTL
 * script + neutral punctuation/whitespace). Mixed strong-LTR letters or Unicode
 * numbers form embedded runs whose visual order is NOT a simple reverse; callers
 * must detect that with {@link lineHasComplexBidiContent} and fail closed rather
 * than mirror. Vertical writing modes are a separate axis and are also out of
 * scope here.
 *
 * @spec ECMA-376 §17.3.1.6 (paragraph w:bidi), §17.3.2.30 (run w:rtl)
 */
import type { NeutralTextDirection } from '@superdoc/contracts';

/**
 * Strong-RTL character ranges: Hebrew/Arabic (and adjacent RTL blocks) plus the
 * Arabic/Hebrew presentation forms. Mirrors the painter's `STRONG_RTL_CHAR_RE`
 * block coverage; kept local so layout-bridge does not import the painter.
 */
const STRONG_RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/** Any Unicode letter. Used to separate "a letter" from neutral punctuation. */
const ANY_LETTER = /\p{L}/u;

/** Any Unicode number. Numeric runs break the single-level RTL mirror model. */
const ANY_NUMBER = /\p{N}/u;

/**
 * Whether a measured line's visible text mixes content that breaks the
 * single-level RTL reverse mapping.
 *
 * Returns `true` (→ caller fails closed with `unsupported-complex-bidi`) when
 * the text contains either:
 *   - any Unicode number (a weak-direction numeric run that the UBA can render
 *     as a contiguous number, not where a pure reverse would place it), or
 *   - a strong-LTR letter (any Unicode letter outside the strong-RTL ranges).
 *
 * Pure Hebrew/Arabic text with neutral punctuation, spaces, and RTL marks
 * returns `false` and is safe to mirror. Conservative by design: when in doubt
 * the caller fails closed rather than emit a mirrored-twice caret.
 */
export function lineHasComplexBidiContent(text: string): boolean {
  for (const char of text) {
    if (ANY_NUMBER.test(char)) return true;
    if (ANY_LETTER.test(char) && !STRONG_RTL_CHAR.test(char)) return true;
  }
  return false;
}

/**
 * Container-space x for a logical advance (px measured from the logical line
 * start, as returned by `measureCharacterX(..., 'left')`).
 *
 * LTR: `contentLeft + advance`. RTL: mirrored about the content box so the
 * logical start sits at the visual right edge.
 */
export function logicalAdvanceToContainerX(
  direction: NeutralTextDirection,
  contentLeft: number,
  contentWidth: number,
  advance: number,
): number {
  return direction === 'rtl' ? contentLeft + contentWidth - advance : contentLeft + advance;
}

/**
 * Logical advance (px from the logical line start, clamped to
 * `[0, contentWidth]`) for a container-space x.
 *
 * The exact inverse of {@link logicalAdvanceToContainerX}: feed the result to
 * `findCharacterAtX(..., 'left')` to recover the logical character offset for
 * either direction. For RTL the visual-left edge maps to the logical end and the
 * visual-right edge maps to the logical start.
 */
export function containerXToLogicalAdvance(
  direction: NeutralTextDirection,
  contentLeft: number,
  contentWidth: number,
  containerX: number,
): number {
  const fromContentLeft = containerX - contentLeft;
  const advance = direction === 'rtl' ? contentWidth - fromContentLeft : fromContentLeft;
  if (!Number.isFinite(advance)) return 0;
  return Math.max(0, Math.min(contentWidth, advance));
}
