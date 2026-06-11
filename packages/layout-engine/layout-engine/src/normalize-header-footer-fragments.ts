import type {
  FlowBlock,
  ImageBlock,
  DrawingBlock,
  Fragment,
  Measure,
  ImageMeasure,
  DrawingMeasure,
} from '@superdoc/contracts';
import { resolveAnchoredGraphicX } from '@superdoc/contracts';
/**
 * Subset of HeaderFooterConstraints needed for fragment normalization.
 * Defined locally to avoid circular imports with index.ts.
 */
export type RegionConstraints = {
  /** Body content width (measurement canvas width). */
  width?: number;
  /** Physical page width for page-relative horizontal anchors. */
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

function computePhysicalAnchorX(
  block: ImageBlock | DrawingBlock,
  fragmentWidth: number,
  constraints: RegionConstraints,
): number | null {
  const pageWidth = constraints.pageWidth;
  const margins = constraints.margins;
  if (pageWidth == null || !margins || block.anchor?.hRelativeFrom !== 'page') {
    return null;
  }

  const contentWidth = constraints.width ?? Math.max(1, pageWidth - margins.left - Math.max(0, margins.right ?? 0));

  return resolveAnchoredGraphicX(
    block.anchor,
    0,
    { width: contentWidth, gap: 0, count: 1 },
    fragmentWidth,
    { left: margins.left, right: margins.right },
    pageWidth,
  );
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
 * Post-normalize page-relative anchored fragment positions in header/footer layout.
 *
 * Problem: The inner `layoutDocument()` uses the body measurement canvas
 * (content width × content height) as its coordinate space. Page-relative
 * anchors with bottom/center/right alignment need the real physical page
 * dimensions instead.
 *
 * Solution: After layout, rewrite page-relative anchored fragment coordinates
 * using physical page geometry:
 * - Headers: absolute page Y; X stored content-local (DomPainter adds marginLeft).
 * - Footers: footer-band-local Y; X stored content-local.
 */
export function normalizeFragmentsForRegion(
  pages: Array<{ number: number; fragments: Fragment[] }>,
  blocks: FlowBlock[],
  _measures: Measure[],
  kind: 'header' | 'footer',
  constraints: RegionConstraints,
): Array<{ number: number; fragments: Fragment[] }> {
  if (constraints.pageHeight == null || !constraints.margins) {
    return pages;
  }

  const pageHeight = constraints.pageHeight;
  const marginLeft = constraints.margins.left;
  const bandOrigin = kind === 'footer' ? computeFooterBandOrigin(constraints) : 0;

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
      const fragmentWidth = (fragment as { width?: number }).width ?? 0;
      const physicalY = computePhysicalAnchorY(block, fragmentHeight, pageHeight);
      fragment.y = kind === 'header' ? physicalY : physicalY - bandOrigin;

      const physicalX = computePhysicalAnchorX(block, fragmentWidth, constraints);
      if (physicalX != null) {
        fragment.x = physicalX - marginLeft;
      }
    }
  }

  return pages;
}
