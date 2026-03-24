import type {
  FlowBlock,
  ImageBlock,
  DrawingBlock,
  Fragment,
  Measure,
  ImageMeasure,
  DrawingMeasure,
} from '@superdoc/contracts';
/**
 * Subset of HeaderFooterConstraints needed for fragment normalization.
 * Defined locally to avoid circular imports with index.ts.
 */
export type RegionConstraints = {
  pageHeight?: number;
  margins?: {
    left: number;
    right: number;
    top?: number;
    bottom?: number;
    header?: number;
  };
};

/**
 * Compute the physical-page Y coordinate for a page-relative anchored drawing,
 * using the real page geometry from constraints.
 *
 * The inner header/footer layout uses body content height as its "page height",
 * which gives wrong positions for page-relative anchors that use bottom/center
 * alignment. This function computes the CORRECT Y using the real page dimensions.
 */
function computePhysicalAnchorY(block: ImageBlock | DrawingBlock, fragmentHeight: number, pageHeight: number): number {
  const alignV = block.anchor?.alignV ?? 'top';
  const offsetV = block.anchor?.offsetV ?? 0;

  if (alignV === 'bottom') {
    return pageHeight - fragmentHeight + offsetV;
  }
  if (alignV === 'center') {
    return (pageHeight - fragmentHeight) / 2 + offsetV;
  }
  // 'top' or unrecognized
  return offsetV;
}

/**
 * Compute the footer band origin: the physical-page Y that corresponds to
 * footer-local y=0. This is the top of the bottom margin area.
 */
function computeFooterBandOrigin(constraints: RegionConstraints): number {
  return (constraints.pageHeight ?? 0) - (constraints.margins?.bottom ?? 0);
}

function isAnchoredFragment(fragment: Fragment): boolean {
  return (
    (fragment.kind === 'image' || fragment.kind === 'drawing') &&
    (fragment as { isAnchored?: boolean }).isAnchored === true
  );
}

function isPageRelativeBlock(block: FlowBlock): block is ImageBlock | DrawingBlock {
  return (block.kind === 'image' || block.kind === 'drawing') && block.anchor?.vRelativeFrom === 'page';
}

/**
 * Post-normalize page-relative anchored fragment Y positions in footer layout.
 *
 * Problem: The inner `layoutDocument()` uses body content height as its page
 * height. For page-relative anchors with bottom/center alignment, this produces
 * incorrect Y positions because the real physical page is much taller.
 *
 * Solution: After layout, rewrite each page-relative anchored fragment's Y
 * using the real physical page height, then convert to footer-band-local
 * coordinates (where y=0 = top of the bottom margin area).
 *
 * Only affects `vRelativeFrom === 'page'` anchored image/drawing fragments.
 * Paragraphs, inline images, and margin-relative anchors pass through unchanged.
 */
export function normalizeFragmentsForRegion(
  pages: Array<{ number: number; fragments: Fragment[] }>,
  blocks: FlowBlock[],
  _measures: Measure[],
  _kind: 'header' | 'footer',
  constraints: RegionConstraints,
): Array<{ number: number; fragments: Fragment[] }> {
  if (constraints.pageHeight == null || !constraints.margins) {
    return pages;
  }

  const pageHeight = constraints.pageHeight;
  const bandOrigin = computeFooterBandOrigin(constraints);

  const blockById = new Map<string, FlowBlock>();
  for (const block of blocks) {
    blockById.set(block.id, block);
  }

  for (const page of pages) {
    for (const fragment of page.fragments) {
      if (!isAnchoredFragment(fragment)) continue;

      const block = blockById.get(fragment.blockId);
      if (!block || !isPageRelativeBlock(block)) continue;

      const fragmentHeight = (fragment as { height?: number }).height ?? 0;
      const physicalY = computePhysicalAnchorY(block, fragmentHeight, pageHeight);
      fragment.y = physicalY - bandOrigin;
    }
  }

  return pages;
}
