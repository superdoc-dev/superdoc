/**
 * Paragraph border group analysis.
 *
 * Determines which consecutive fragments form "border groups" — runs of
 * paragraphs with identical border definitions that Word renders as a
 * single continuous bordered box with between-borders separating them.
 *
 * @ooxml w:pPr/w:pBdr/w:between — between border for grouped paragraphs
 * @spec  ECMA-376 §17.3.1.24 (pBdr)
 */
import type { Fragment, ListItemFragment, ResolvedPaintItem, ResolvedFragmentItem } from '@superdoc/contracts';
import { hashParagraphBorders } from '../../paragraph-hash-utils.js';

/**
 * Per-fragment rendering info for between-border groups.
 *
 * - showBetweenBorder: replace bottom border with the between definition
 * - suppressTopBorder: hide this fragment's top border (covered by previous fragment's extension)
 * - gapBelow: px to extend the border layer downward into the paragraph-spacing gap
 */
export type BetweenBorderInfo = {
  showBetweenBorder: boolean;
  suppressTopBorder: boolean;
  suppressBottomBorder: boolean;
  gapBelow: number;
};

/**
 * Whether a between border is effectively absent (nil/none or missing).
 */
const isBetweenBorderNone = (borders: ResolvedFragmentItem['paragraphBorders']): boolean => {
  if (!borders?.between) return true;
  return borders.between.style === 'none';
};

/**
 * Helper: check whether a resolved item is a ResolvedFragmentItem (para/list-item)
 * with pre-computed paragraph border data.
 */
function isResolvedFragmentWithBorders(
  item: ResolvedPaintItem | undefined,
): item is ResolvedFragmentItem & { paragraphBorders: NonNullable<ResolvedFragmentItem['paragraphBorders']> } {
  return (
    item !== undefined && item.kind === 'fragment' && 'paragraphBorders' in item && item.paragraphBorders !== undefined
  );
}

/**
 * Pre-computes per-fragment between-border rendering info for a page.
 *
 * Two fragments (i, i+1) form a border group pair when:
 * 1. Both are para or list-item (not table/image/drawing)
 * 2. Neither is a page-split continuation
 * 3. They represent different logical paragraphs
 * 4. Both have border definitions
 * 5. Their full border definitions match (same border group)
 *
 * Per ECMA-376 §17.3.1.5: grouping occurs when all border properties are
 * identical. A `between` border is NOT required — when absent, the group
 * is rendered as a single box without a separator line.
 *
 * For each pair, the first fragment gets:
 * - showBetweenBorder: true — bottom border replaced with between definition
 * - gapBelow: px distance to extend border layer into spacing gap
 *
 * The second fragment gets:
 * - suppressTopBorder: true — the previous fragment's extension covers the boundary
 *
 * Middle fragments in a chain of 3+ get both flags.
 */
export const computeBetweenBorderFlags = (
  fragments: readonly Fragment[],
  resolvedItems: readonly ResolvedPaintItem[],
): Map<number, BetweenBorderInfo> => {
  // Phase 1: determine which consecutive pairs form between-border groups
  const pairFlags = new Set<number>();
  const noBetweenPairs = new Set<number>();

  for (let i = 0; i < fragments.length - 1; i += 1) {
    const frag = fragments[i];
    if (frag.kind !== 'para' && frag.kind !== 'list-item') continue;
    if (frag.continuesOnNext) continue;

    const resolvedCur = resolvedItems[i];
    if (!isResolvedFragmentWithBorders(resolvedCur)) continue;
    const borders = resolvedCur.paragraphBorders;

    const next = fragments[i + 1];
    if (next.kind !== 'para' && next.kind !== 'list-item') continue;
    if (next.continuesFromPrev) continue;
    if (next.blockId === frag.blockId && next.kind === 'para') continue;
    if (
      next.blockId === frag.blockId &&
      next.kind === 'list-item' &&
      frag.kind === 'list-item' &&
      (next as ListItemFragment).itemId === (frag as ListItemFragment).itemId
    )
      continue;

    const resolvedNext = resolvedItems[i + 1];
    if (!isResolvedFragmentWithBorders(resolvedNext)) continue;
    const nextBorders = resolvedNext.paragraphBorders;

    // Compare using pre-computed hashes when available, falling back to computing on-the-fly.
    const curHash =
      'paragraphBorderHash' in resolvedCur && (resolvedCur as ResolvedFragmentItem).paragraphBorderHash
        ? (resolvedCur as ResolvedFragmentItem).paragraphBorderHash!
        : hashParagraphBorders(borders);
    const nextHash =
      'paragraphBorderHash' in resolvedNext && (resolvedNext as ResolvedFragmentItem).paragraphBorderHash
        ? (resolvedNext as ResolvedFragmentItem).paragraphBorderHash!
        : hashParagraphBorders(nextBorders);
    if (curHash !== nextHash) continue;

    // Skip fragments in different columns (different x positions)
    if (frag.x !== next.x) continue;

    pairFlags.add(i);

    // Track nil/none/absent between pairs — these get suppressBottomBorder instead of showBetweenBorder.
    // Per ECMA-376 §17.3.1.5: grouping happens when ALL borders are identical.
    // When no between border is defined, the group has no separator line.
    if (isBetweenBorderNone(borders) && isBetweenBorderNone(nextBorders)) {
      noBetweenPairs.add(i);
    }
  }

  // Phase 2: build per-fragment info with gap distances and top suppression
  const result = new Map<number, BetweenBorderInfo>();

  for (const i of pairFlags) {
    const frag = fragments[i];
    const next = fragments[i + 1];
    const resolvedCur = resolvedItems[i];
    const fragHeight = resolvedCur && 'height' in resolvedCur && resolvedCur.height != null ? resolvedCur.height : 0;
    const gapBelow = Math.max(0, next.y - (frag.y + fragHeight));
    const isNoBetween = noBetweenPairs.has(i);

    // Current fragment: extend into gap.
    // Real between → showBetweenBorder (replace bottom with between definition).
    // Nil/none between → suppressBottomBorder (hide bottom, keep left/right continuous).
    if (!result.has(i)) {
      result.set(i, {
        showBetweenBorder: !isNoBetween,
        suppressTopBorder: false,
        suppressBottomBorder: isNoBetween,
        gapBelow,
      });
    } else {
      const existing = result.get(i)!;
      existing.showBetweenBorder = !isNoBetween;
      existing.suppressBottomBorder = isNoBetween;
      existing.gapBelow = gapBelow;
    }

    // Next fragment: suppress top border (previous fragment's extended layer covers boundary)
    if (!result.has(i + 1)) {
      result.set(i + 1, {
        showBetweenBorder: false,
        suppressTopBorder: true,
        suppressBottomBorder: false,
        gapBelow: 0,
      });
    } else {
      result.get(i + 1)!.suppressTopBorder = true;
    }
  }

  return result;
};
