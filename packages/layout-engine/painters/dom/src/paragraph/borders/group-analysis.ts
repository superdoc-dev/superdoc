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
import type { ParagraphBorders, ResolvedPaintItem, ResolvedFragmentItem } from '@superdoc/contracts';
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

export type ParagraphBorderGroupEntry = {
  blockId: string;
  x: number;
  y: number;
  height: number;
  borders?: ParagraphBorders;
  borderHash?: string;
  continuesFromPrev?: boolean;
  continuesOnNext?: boolean;
};

export const computeBetweenBorderContext = (
  entries: readonly ParagraphBorderGroupEntry[],
): Map<number, BetweenBorderInfo> => {
  const pairFlags = new Set<number>();
  const noBetweenPairs = new Set<number>();

  for (let i = 0; i < entries.length - 1; i += 1) {
    const current = entries[i];
    const next = entries[i + 1];
    if (current.continuesOnNext || next.continuesFromPrev || current.blockId === next.blockId) continue;
    if (!current.borders || !next.borders) continue;

    const currentHash = current.borderHash ?? hashParagraphBorders(current.borders);
    const nextHash = next.borderHash ?? hashParagraphBorders(next.borders);
    if (currentHash !== nextHash) continue;
    if (current.x !== next.x) continue;

    pairFlags.add(i);
    if (isBetweenBorderNone(current.borders) && isBetweenBorderNone(next.borders)) {
      noBetweenPairs.add(i);
    }
  }

  const result = new Map<number, BetweenBorderInfo>();

  for (const i of pairFlags) {
    const current = entries[i];
    const next = entries[i + 1];
    const gapBelow = Math.max(0, next.y - (current.y + current.height));
    const isNoBetween = noBetweenPairs.has(i);

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

/**
 * Helper: check whether a resolved item is a ResolvedFragmentItem with
 * pre-computed paragraph border data.
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
 * 1. Both are para fragments (not table/image/drawing)
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
  resolvedItems: readonly ResolvedPaintItem[],
): Map<number, BetweenBorderInfo> => {
  const entries = resolvedItems.map((item, index): ParagraphBorderGroupEntry => {
    const fallbackEntry = {
      blockId: `item:${index}`,
      x: 0,
      y: 0,
      height: 0,
    };
    if (item.kind !== 'fragment') return fallbackEntry;
    const fragment = item.fragment;
    if (fragment.kind !== 'para' || !isResolvedFragmentWithBorders(item)) {
      return {
        ...fallbackEntry,
        blockId: fragment.blockId,
        x: 'x' in fragment ? fragment.x : 0,
        y: 'y' in fragment ? fragment.y : 0,
      };
    }

    return {
      blockId: fragment.blockId,
      x: fragment.x,
      y: fragment.y,
      height: 'height' in item && item.height != null ? item.height : 0,
      borders: item.paragraphBorders,
      borderHash: item.paragraphBorderHash,
      continuesFromPrev: fragment.continuesFromPrev,
      continuesOnNext: fragment.continuesOnNext,
    };
  });

  return computeBetweenBorderContext(entries);
};
