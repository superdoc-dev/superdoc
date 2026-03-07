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
import type {
  Fragment,
  ListItemFragment,
  ListBlock,
  ListMeasure,
  ParagraphBlock,
  ParagraphAttrs,
} from '@superdoc/contracts';
import type { BlockLookup } from './types.js';
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
 * Extracts the paragraph borders for a fragment, looking up the block data.
 * Handles both paragraph and list-item fragments.
 */
export const getFragmentParagraphBorders = (
  fragment: Fragment,
  blockLookup: BlockLookup,
): ParagraphAttrs['borders'] | undefined => {
  const lookup = blockLookup.get(fragment.blockId);
  if (!lookup) return undefined;

  if (fragment.kind === 'para' && lookup.block.kind === 'paragraph') {
    return (lookup.block as ParagraphBlock).attrs?.borders;
  }

  if (fragment.kind === 'list-item' && lookup.block.kind === 'list') {
    const block = lookup.block as ListBlock;
    const item = block.items.find((entry) => entry.id === fragment.itemId);
    return item?.paragraph.attrs?.borders;
  }

  return undefined;
};

/**
 * Computes the height of a fragment from its measured line heights.
 * Used to calculate the spacing gap between consecutive fragments.
 */
export const getFragmentHeight = (fragment: Fragment, blockLookup: BlockLookup): number => {
  if (fragment.kind === 'table' || fragment.kind === 'image' || fragment.kind === 'drawing') {
    return fragment.height;
  }

  const lookup = blockLookup.get(fragment.blockId);
  if (!lookup) return 0;

  if (fragment.kind === 'para' && lookup.measure.kind === 'paragraph') {
    const lines = fragment.lines ?? lookup.measure.lines.slice(fragment.fromLine, fragment.toLine);
    let totalHeight = 0;
    for (const line of lines) {
      totalHeight += line.lineHeight ?? 0;
    }
    return totalHeight;
  }

  if (fragment.kind === 'list-item' && lookup.measure.kind === 'list') {
    const listMeasure = lookup.measure as ListMeasure;
    const item = listMeasure.items.find((it) => it.itemId === fragment.itemId);
    if (!item) return 0;
    const lines = item.paragraph.lines.slice(fragment.fromLine, fragment.toLine);
    let totalHeight = 0;
    for (const line of lines) {
      totalHeight += line.lineHeight ?? 0;
    }
    return totalHeight;
  }

  return 0;
};

/**
 * Whether a between border is effectively absent (nil/none or missing).
 */
const isBetweenBorderNone = (borders: ParagraphAttrs['borders']): boolean => {
  if (!borders?.between) return true;
  return borders.between.style === 'none';
};

/**
 * Pre-computes per-fragment between-border rendering info for a page.
 *
 * Two fragments (i, i+1) form a border group pair when:
 * 1. Both are para or list-item (not table/image/drawing)
 * 2. Neither is a page-split continuation
 * 3. They represent different logical paragraphs
 * 4. Both have a `between` border defined (not nil/none)
 * 5. Their full border definitions match (same border group)
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
  blockLookup: BlockLookup,
): Map<number, BetweenBorderInfo> => {
  // Phase 1: determine which consecutive pairs form between-border groups
  const pairFlags = new Set<number>();
  const noBetweenPairs = new Set<number>();

  for (let i = 0; i < fragments.length - 1; i += 1) {
    const frag = fragments[i];
    if (frag.kind !== 'para' && frag.kind !== 'list-item') continue;
    if (frag.continuesOnNext) continue;

    const borders = getFragmentParagraphBorders(frag, blockLookup);
    // Skip if no between element at all (no grouping intent).
    // between: {style: 'none'} (nil/none) IS allowed — it signals grouping without a separator.
    if (!borders?.between) continue;

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

    const nextBorders = getFragmentParagraphBorders(next, blockLookup);
    if (!nextBorders?.between) continue;
    if (hashParagraphBorders(borders!) !== hashParagraphBorders(nextBorders!)) continue;

    // Skip fragments in different columns (different x positions)
    if (frag.x !== next.x) continue;

    pairFlags.add(i);

    // Track nil/none between pairs — these get suppressBottomBorder instead of showBetweenBorder
    if (isBetweenBorderNone(borders) && isBetweenBorderNone(nextBorders)) {
      noBetweenPairs.add(i);
    }
  }

  // Phase 2: build per-fragment info with gap distances and top suppression
  const result = new Map<number, BetweenBorderInfo>();

  for (const i of pairFlags) {
    const frag = fragments[i];
    const next = fragments[i + 1];
    const fragHeight = getFragmentHeight(frag, blockLookup);
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
