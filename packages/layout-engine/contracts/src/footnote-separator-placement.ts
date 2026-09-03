import type { ParagraphAttrs } from './index.js';
import { getParagraphInlineDirection } from './direction-context.js';

/**
 * Horizontal placement of a footnote separator mark inside its note column.
 *
 * `<w:separator/>` and `<w:continuationSeparator/>` are not engine decoration: each is a RUN, and it
 * lives in its own paragraph in footnotes.xml (`w:footnote w:type="separator"` and
 * `w:type="continuationSeparator"`, ids -1 and 0). So the mark is placed the way any run is placed —
 * by the inline direction, `w:jc` and `w:ind` OF THAT PARAGRAPH, resolved through its style chain.
 *
 * It is specifically NOT placed by the section's `w:bidi`. The two axes are independent
 * (§17.6.1 for the section, §17.3.1.6 for the paragraph; see `direction-context.ts`), and they do
 * come apart in practice: a Hebrew section whose separator paragraph resolves LTR gets a rule on the
 * left in Word, and an LTR section whose separator paragraph resolves RTL gets one on the right.
 * Reading the section direction here would render both of those backwards.
 *
 * `attrs` is the resolved `w:pPr` of that paragraph. When it is absent the engine has no evidence
 * about the mark's paragraph and keeps the LTR start edge, which is the historical placement — a
 * guess from some other paragraph's direction would be wrong exactly when it mattered.
 */
export type FootnoteSeparatorPlacement = {
  /** Absolute x of the note column's text extent (the column's left edge). */
  columnX: number;
  /** Width of the note column's text extent. */
  columnWidth: number;
  /** Painted length of the mark. */
  separatorWidth: number;
  /** Resolved paragraph properties of the separator paragraph in footnotes.xml. */
  attrs?: ParagraphAttrs;
};

/**
 * Physical edge the mark is laid out from, mirroring `resolveTextAlign` in the DOM painter: an
 * explicit `left`/`right`/`center` is physical, and `justify` or an absent `w:jc` resolves to the
 * paragraph's START edge — the right in an RTL paragraph. A separator paragraph's single line is
 * also its last line, which justification never stretches, so `justify` behaves as start.
 */
function resolveSeparatorEdge(attrs: ParagraphAttrs | undefined): 'left' | 'right' | 'center' {
  const alignment = attrs?.alignment;
  if (alignment === 'left' || alignment === 'right' || alignment === 'center') return alignment;
  return getParagraphInlineDirection(attrs) === 'rtl' ? 'right' : 'left';
}

/**
 * Absolute x of the separator mark.
 *
 * `w:ind/@w:left` and `@w:right` narrow the extent the mark is aligned in, as they do for text.
 * `firstLine` / `hanging` are deliberately not read: they move the first line of a text paragraph,
 * and there is no evidence Word applies them to a lone separator run — a separator paragraph that
 * carries one should be handled once that behaviour is known, not guessed at here.
 */
export function resolveFootnoteSeparatorX(placement: FootnoteSeparatorPlacement): number {
  const { columnX, columnWidth, separatorWidth, attrs } = placement;
  const indentLeft = Math.max(0, attrs?.indent?.left ?? 0);
  const indentRight = Math.max(0, attrs?.indent?.right ?? 0);

  const extentX = columnX + indentLeft;
  const extentWidth = columnWidth - indentLeft - indentRight;
  // An indent pair wider than the column leaves no extent to align in; fall back to the column's own
  // start edge rather than emitting a mark at a negative offset from it.
  if (!Number.isFinite(extentWidth) || extentWidth <= 0) return columnX;

  const slack = extentWidth - separatorWidth;
  if (slack <= 0) return extentX;

  switch (resolveSeparatorEdge(attrs)) {
    case 'right':
      return extentX + slack;
    case 'center':
      return extentX + slack / 2;
    default:
      return extentX;
  }
}
