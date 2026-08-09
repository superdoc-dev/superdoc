import type {
  FlowBlock,
  ImageBlock,
  DrawingBlock,
  Fragment,
  Measure,
  ImageMeasure,
  DrawingMeasure,
} from '@superdoc/contracts';
import { isPagePositionedParagraphFrame, resolveFooterPageFrameOriginY } from '@superdoc/contracts';
/**
 * Subset of HeaderFooterConstraints needed for fragment normalization.
 * Defined locally to avoid circular imports with index.ts.
 */
export type RegionConstraints = {
  width?: number;
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

function isHeaderMarginContentBlock(block: FlowBlock): block is ImageBlock | DrawingBlock {
  if (block.kind !== 'image' && block.kind !== 'drawing') return false;
  if (block.anchor?.vRelativeFrom !== 'margin') return false;
  if (block.anchor.behindDoc === true) return false;
  return block.wrap?.type !== 'None';
}

/**
 * Post-normalize anchored fragment Y positions in header/footer layout.
 *
 * Problem: The inner `layoutDocument()` uses body content height as its page
 * height. For page-relative footer anchors and margin-relative header anchors,
 * this can produce incorrect Y positions because the real physical page/header
 * band geometry is different.
 *
 * Solution: After layout, rewrite affected anchored fragments into the region's
 * local coordinate system. Footer page-relative anchors use the real physical
 * page height and footer-band origin. Header page-relative anchors use their
 * physical page offset directly because header story coordinates are page-top
 * local. Header margin-relative content anchors reset to the header-local
 * offset so they do not inflate the reserved header height by carrying
 * body-canvas coordinates.
 *
 * Page-anchored paragraph frames are likewise converted from physical-page
 * coordinates; other paragraphs, inline images, and absolute overlays pass
 * through unchanged.
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
  const bandOrigin = computeFooterBandOrigin(constraints);

  const blockById = new Map<string, FlowBlock>();
  for (const block of blocks) {
    blockById.set(block.id, block);
  }

  for (const page of pages) {
    for (const fragment of page.fragments) {
      const block = blockById.get(fragment.blockId);
      if (!block) continue;

      const paragraphFrame = block.kind === 'paragraph' ? block.attrs?.frame : undefined;
      const horizontalAnchor = paragraphFrame?.hAnchor;
      const horizontalAlignment = paragraphFrame?.xAlign;
      if (fragment.kind === 'para' && isPagePositionedParagraphFrame(paragraphFrame)) {
        if (
          horizontalAnchor === 'page' &&
          horizontalAlignment &&
          typeof constraints.pageWidth === 'number' &&
          Number.isFinite(constraints.pageWidth) &&
          constraints.pageWidth > 0 &&
          typeof constraints.width === 'number' &&
          Number.isFinite(constraints.width) &&
          constraints.width > 0
        ) {
          const pageWidthDelta = constraints.pageWidth - constraints.width;
          if (horizontalAlignment === 'right') {
            fragment.x += pageWidthDelta;
          } else if (horizontalAlignment === 'center') {
            fragment.x += pageWidthDelta / 2;
          }
        }

        const physicalY = paragraphFrame.y;

        // Paragraph frames use the header/footer decoration container as their
        // local coordinate space. Footer decorations start at the top of the
        // bottom margin, unlike drawing anchors whose origin follows footerDistance.
        const regionOrigin =
          kind === 'footer' ? resolveFooterPageFrameOriginY(pageHeight, constraints.margins.bottom) : 0;
        fragment.y = physicalY - regionOrigin;
        continue;
      }

      if (!isAnchoredFragment(fragment)) continue;

      if (kind === 'header' && isHeaderMarginContentBlock(block)) {
        fragment.y = block.anchor?.offsetV ?? 0;
        continue;
      }

      if (!isPageRelativeBlock(block)) continue;

      const fragmentHeight = (fragment as { height?: number }).height ?? 0;
      const physicalY = computePhysicalAnchorY(block, fragmentHeight, pageHeight);
      fragment.y = kind === 'header' ? physicalY : physicalY - bandOrigin;
    }
  }

  return pages;
}
