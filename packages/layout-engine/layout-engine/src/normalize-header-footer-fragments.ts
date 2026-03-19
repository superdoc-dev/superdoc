import type { FlowBlock, ImageBlock, DrawingBlock, Fragment, Measure } from '@superdoc/contracts';
import { isPageRelativeAnchor } from './anchors';

/**
 * Subset of HeaderFooterConstraints needed for fragment normalization.
 * Defined locally to avoid circular imports with index.ts.
 */
type RegionConstraints = {
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
 * Compute the physical-page Y coordinate for a page-relative or margin-relative
 * anchored drawing, using the real page geometry from constraints.
 *
 * Mirrors the pre-registration anchor Y logic in layoutDocument (index.ts),
 * but substitutes the real physical page dimensions instead of the synthetic
 * measurement canvas used for header/footer inner layout.
 */
function computePhysicalAnchorY(
  block: ImageBlock | DrawingBlock,
  fragmentHeight: number,
  constraints: RegionConstraints,
): number {
  const vRelativeFrom = block.anchor?.vRelativeFrom ?? 'paragraph';
  const alignV = block.anchor?.alignV ?? 'top';
  const offsetV = block.anchor?.offsetV ?? 0;

  const pageHeight = constraints.pageHeight!;
  const marginTop = constraints.margins?.top ?? 0;
  const marginBottom = constraints.margins?.bottom ?? 0;

  if (vRelativeFrom === 'page') {
    if (alignV === 'bottom') {
      return pageHeight - fragmentHeight + offsetV;
    }
    if (alignV === 'center') {
      return (pageHeight - fragmentHeight) / 2 + offsetV;
    }
    // 'top' or unrecognized
    return offsetV;
  }

  if (vRelativeFrom === 'margin') {
    const contentTop = marginTop;
    const contentBottom = pageHeight - marginBottom;
    const contentHeight = Math.max(0, contentBottom - contentTop);

    if (alignV === 'bottom') {
      return contentBottom - fragmentHeight + offsetV;
    }
    if (alignV === 'center') {
      return contentTop + (contentHeight - fragmentHeight) / 2 + offsetV;
    }
    // 'top' or unrecognized
    return contentTop + offsetV;
  }

  // Not a page/margin-relative anchor — should not reach here
  return 0;
}

/**
 * Compute the band origin (physical-page Y that corresponds to local y=0).
 *
 * - Header band origin: margins.header (header distance from page top edge)
 * - Footer band origin: pageHeight - margins.bottom
 */
function computeBandOrigin(kind: 'header' | 'footer', constraints: RegionConstraints): number {
  if (kind === 'header') {
    return constraints.margins?.header ?? 0;
  }
  return (constraints.pageHeight ?? 0) - (constraints.margins?.bottom ?? 0);
}

/**
 * Post-normalize fragment positions for page-relative and margin-relative
 * anchored drawings in header/footer layout.
 *
 * After the inner `layoutDocument()` computes fragment positions using the
 * synthetic measurement canvas (body content height with zero margins),
 * this function corrects anchored drawing positions to use the real
 * physical page geometry and converts them to header/footer-local coordinates.
 *
 * Non-anchored fragments (paragraphs, inline images, etc.) pass through unchanged.
 * Block anchor properties are never mutated.
 *
 * @param pages - Layout pages with fragments from layoutDocument()
 * @param blocks - Original flow blocks (used to read anchor properties)
 * @param measures - Corresponding measures (unused but kept for symmetry with layoutHeaderFooter args)
 * @param kind - Whether this is a 'header' or 'footer' layout
 * @param constraints - Constraints with real page geometry (pageHeight + margins)
 * @returns The same pages array (mutated in place) with corrected fragment positions
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

  const bandOrigin = computeBandOrigin(kind, constraints);

  // Build block lookup by ID
  const blockById = new Map<string, FlowBlock>();
  for (const block of blocks) {
    blockById.set(block.id, block);
  }

  for (const page of pages) {
    for (const fragment of page.fragments) {
      const isAnchored =
        (fragment.kind === 'image' || fragment.kind === 'drawing') &&
        (fragment as { isAnchored?: boolean }).isAnchored === true;
      if (!isAnchored) continue;

      const block = blockById.get(fragment.blockId);
      if (!block || (block.kind !== 'image' && block.kind !== 'drawing')) continue;

      const anchoredBlock = block as ImageBlock | DrawingBlock;
      if (!isPageRelativeAnchor(anchoredBlock)) continue;

      const fragmentHeight = (fragment as { height?: number }).height ?? 0;
      const physicalY = computePhysicalAnchorY(anchoredBlock, fragmentHeight, constraints);
      fragment.y = physicalY - bandOrigin;
    }
  }

  return pages;
}
