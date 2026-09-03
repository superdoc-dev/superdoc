import type { ColumnLayout } from './index.js';
import { cloneColumnLayout, resolveColumnCount } from './column-layout.js';

/**
 * `w15:footnoteColumns/@w:val` when the section wants the note band to match the body — Word's
 * default, and what an absent element means. The element is a Word 2012 extension
 * (`http://schemas.microsoft.com/office/word/2012/wordml`), not part of ECMA-376, and documents
 * list it in `mc:Ignorable` — so a reader that skips it is well-formed, just not faithful.
 */
export const FOOTNOTE_COLUMNS_MATCH_BODY = 0;

/**
 * Resolved column count of the FOOTNOTE BAND for a section: the declared `w15:footnoteColumns`
 * clamped to the body's resolved count.
 *
 * The clamp is deliberate and is the whole reason this is a shared helper rather than a raw read.
 * A band wider than the body is what Word draws for the common authored value (`1` under a
 * multi-column body: one note strip across the full content area), and the layout pipeline supports
 * it end to end. A band with MORE columns than the body would need the opposite — notes flowing
 * from one band column into the next when the first fills up — which the note planner does not do:
 * it carries a column's overflow to the SAME column on the next page. Honouring such a value would
 * paint a half-width band with an empty second column and push notes onto later pages, strictly
 * worse than the body-matching band Word's default already produces. So `>= bodyCount` collapses
 * to "match the body", which is exactly the semantic of the default.
 */
export function resolveFootnoteColumnCount(
  bodyColumns: ColumnLayout | undefined,
  footnoteColumns: number | undefined,
): number {
  const bodyCount = resolveColumnCount(bodyColumns);
  if (typeof footnoteColumns !== 'number' || !Number.isFinite(footnoteColumns)) return bodyCount;
  const declared = Math.floor(footnoteColumns);
  if (declared <= FOOTNOTE_COLUMNS_MATCH_BODY) return bodyCount;
  return Math.min(declared, bodyCount);
}

/**
 * Column layout of the footnote band for a section, as an unnormalized `ColumnLayout` ready for
 * `normalizeColumnLayout(bandColumns, contentWidth)`.
 *
 * Two outcomes only:
 * - band count === body count: the body layout itself, cloned. Bit-for-bit today's behaviour,
 *   including explicit `w:col/@w` widths — "match section layout" means match it exactly.
 * - band count < body count: that many EQUAL columns spanning the whole content area, taking the
 *   gutter from the body's `w:cols/@w:space` and the fill direction from the body's `w:bidi`.
 *   Explicit body widths are dropped on purpose: they describe a different number of columns and
 *   cannot be reused, and Word divides a narrower band evenly.
 *
 * `w:cols/@w:sep` is dropped by the merge branch and deliberately KEPT by the matching one, whose
 * contract is "the body layout, verbatim" -- that is what makes a document without
 * `w15:footnoteColumns` render byte-identically to before. Keeping it is inert either way: `@w:sep`
 * draws the VERTICAL rules between body columns, which the painter derives from `page.columns` and
 * not from this layout, and no footnote consumer reads the band geometry's `separatorX`. The band
 * draws its own horizontal `w:separator` and no vertical rules of its own.
 */
export function resolveFootnoteBandColumns(
  bodyColumns: ColumnLayout | undefined,
  footnoteColumns: number | undefined,
): ColumnLayout {
  const body = cloneColumnLayout(bodyColumns);
  const count = resolveFootnoteColumnCount(bodyColumns, footnoteColumns);
  if (count >= resolveColumnCount(bodyColumns)) return body;
  return {
    count,
    gap: Math.max(0, body.gap ?? 0),
    ...(body.direction !== undefined ? { direction: body.direction } : {}),
  };
}

/**
 * Band column that owns the notes anchored in body column `bodyColumnIndex`.
 *
 * Identity when the band matches the body, `0` when the band is a single merged strip, and a
 * monotone proportional split in between (3 body columns into a 2-column band groups them 0,0,1).
 * Monotone matters: a page's references are visited in document order, so a monotone map keeps each
 * band column's notes in ascending note order without a re-sort.
 */
export function mapBodyColumnToFootnoteColumn(
  bodyColumnIndex: number,
  bodyColumnCount: number,
  footnoteColumnCount: number,
): number {
  const bandCount = Number.isFinite(footnoteColumnCount) ? Math.max(1, Math.floor(footnoteColumnCount)) : 1;
  if (bandCount === 1) return 0;
  const bodyCount = Number.isFinite(bodyColumnCount) ? Math.max(1, Math.floor(bodyColumnCount)) : 1;
  const index = Number.isFinite(bodyColumnIndex)
    ? Math.max(0, Math.min(Math.floor(bodyColumnIndex), bodyCount - 1))
    : 0;
  if (bandCount >= bodyCount) return Math.min(index, bandCount - 1);
  return Math.min(bandCount - 1, Math.floor((index * bandCount) / bodyCount));
}
