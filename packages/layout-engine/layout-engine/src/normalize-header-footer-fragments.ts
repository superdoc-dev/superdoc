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
  pageWidth?: number;
  pageHeight?: number;
  margins?: {
    left: number;
    right: number;
    top?: number;
    bottom?: number;
    header?: number;
    footer?: number;
  };
};

function computePhysicalAnchorX(block: ImageBlock | DrawingBlock, fragmentWidth: number, pageWidth: number): number {
  const alignH = block.anchor?.alignH ?? 'left';
  const offsetH = block.anchor?.offsetH ?? 0;

  if (alignH === 'right') {
    return pageWidth - fragmentWidth - offsetH;
  }
  if (alignH === 'center') {
    return (pageWidth - fragmentWidth) / 2 + offsetH;
  }
  return offsetH;
}

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
  const pageHeight = constraints.pageHeight ?? 0;
  const footerDistance = constraints.margins?.footer;
  if (typeof footerDistance === 'number' && Number.isFinite(footerDistance)) {
    return Math.max(0, pageHeight - Math.max(0, footerDistance));
  }
  return Math.max(0, pageHeight - (constraints.margins?.bottom ?? 0));
}

function computeBandOrigin(kind: 'header' | 'footer', constraints: RegionConstraints): number {
  return kind === 'footer' ? computeFooterBandOrigin(constraints) : 0;
}

function isAnchoredFragment(fragment: Fragment): boolean {
  return (
    (fragment.kind === 'image' || fragment.kind === 'drawing') &&
    (fragment as { isAnchored?: boolean }).isAnchored === true
  );
}

function isPageRelativeBlock(block: FlowBlock): block is ImageBlock | DrawingBlock {
  return (
    (block.kind === 'image' || block.kind === 'drawing') &&
    (block.anchor?.hRelativeFrom === 'page' || block.anchor?.vRelativeFrom === 'page')
  );
}

/**
 * Post-normalize page-relative anchored fragment positions in header/footer layout.
 *
 * Problem: The inner `layoutDocument()` uses body content height as its page
 * height and content width as its page size. For page-relative anchors with
 * center/right or bottom/center alignment, this produces incorrect positions
 * because the real physical page is larger.
 *
 * Solution: After layout, rewrite each page-relative anchored fragment using
 * the real physical page dimensions, then convert Y to the region's local
 * coordinate system. Headers use page-local Y; footers use footer-band-local Y
 * where y=0 is the top of the bottom margin area.
 *
 * Only affects anchored image/drawing fragments whose anchor is page-relative.
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
  const pageWidth = constraints.pageWidth;
  const bandOrigin = computeBandOrigin(_kind, constraints);

  const blockById = new Map<string, FlowBlock>();
  for (const block of blocks) {
    blockById.set(block.id, block);
  }

  for (const page of pages) {
    for (const fragment of page.fragments) {
      if (!isAnchoredFragment(fragment)) continue;

      const block = blockById.get(fragment.blockId);
      if (!block || !isPageRelativeBlock(block)) continue;

      if (block.anchor?.hRelativeFrom === 'page' && pageWidth != null) {
        const fragmentWidth = (fragment as { width?: number }).width ?? 0;
        fragment.x = computePhysicalAnchorX(block, fragmentWidth, pageWidth);
      }

      if (block.anchor?.vRelativeFrom === 'page') {
        const fragmentHeight = (fragment as { height?: number }).height ?? 0;
        const physicalY = computePhysicalAnchorY(block, fragmentHeight, pageHeight);
        fragment.y = physicalY - bandOrigin;
      }
    }
  }

  return pages;
}
