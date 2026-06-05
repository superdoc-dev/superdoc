import type {
  FlowBlock,
  HeaderFooterLayout,
  Layout,
  PageNumberChapterSeparator,
  PageNumberFormat,
  SectionMetadata,
} from '@superdoc/contracts';
import {
  computeDisplayPageNumber,
  layoutHeaderFooterWithCache,
  buildSectionAwareHeaderFooterLayoutKey,
  buildSectionContentWidth,
  buildEffectiveHeaderFooterRefsBySection,
  collectReferencedHeaderFooterRIds,
  buildSectionAwareHeaderFooterMeasurementGroups,
} from '@superdoc/layout-bridge';
import type { HeaderFooterLayoutResult, HeaderFooterConstraints } from '@superdoc/layout-bridge';
import { measureBlock } from '@superdoc/measuring-dom';
import type { FontResolver, HasFace, FontMeasureContext } from '@superdoc/font-system';

export type HeaderFooterPerRidLayoutInput = {
  headerBlocks?: unknown;
  footerBlocks?: unknown;
  headerBlocksByRId: Map<string, FlowBlock[]> | undefined;
  footerBlocksByRId: Map<string, FlowBlock[]> | undefined;
  constraints: HeaderFooterConstraints;
};

type Constraints = HeaderFooterConstraints;
type PageResolver = (pageNumber: number) => {
  displayText: string;
  displayNumber: number;
  totalPages: number;
  sectionPageCount: number;
  pageFormat?: PageNumberFormat;
  chapterNumberText?: string;
  chapterSeparator?: PageNumberChapterSeparator;
};

/**
 * Layout header/footer blocks per rId, respecting per-section margins.
 *
 * For documents with multiple sections that have different margins, this function
 * measures the same header/footer content at different widths and stores results
 * with composite keys (`${rId}::s${sectionIndex}`) so each page gets the correctly
 * sized layout.
 */
export async function layoutPerRIdHeaderFooters(
  headerFooterInput: HeaderFooterPerRidLayoutInput | null,
  layout: Layout,
  sectionMetadata: SectionMetadata[],
  deps: {
    headerLayoutsByRId: Map<string, HeaderFooterLayoutResult>;
    footerLayoutsByRId: Map<string, HeaderFooterLayoutResult>;
  },
  // The calling document's resolver + its face-availability oracle (`hasFace`) and the render plan's
  // `effectiveSignature`. Per-rId header/footer measurement resolves FACE-aware through them and keys
  // the shared cache on effectiveSignature (NOT resolver.signature), so a single-face substitute is
  // safe in headers/footers and a fonts.add() busts the cache. Omitted => global default + family-level.
  fontResolver?: FontResolver,
  hasFace?: HasFace,
  effectiveSignature?: string,
): Promise<void> {
  deps.headerLayoutsByRId.clear();
  deps.footerLayoutsByRId.clear();

  if (!headerFooterInput) return;

  const { headerBlocksByRId, footerBlocksByRId, constraints } = headerFooterInput;

  const displayPages = computeDisplayPageNumber(layout.pages, sectionMetadata);
  const pageByNumber = new Map(layout.pages.map((page) => [page.number, page]));
  const totalPages = layout.pages.length;

  const pageResolver: PageResolver = (pageNumber: number) => {
    const pageIndex = pageNumber - 1;
    const displayInfo = displayPages[pageIndex];
    const page = pageByNumber.get(pageNumber);
    return {
      displayText: page?.numberText ?? displayInfo?.displayText ?? String(pageNumber),
      displayNumber: page?.displayNumber ?? displayInfo?.displayNumber ?? pageNumber,
      totalPages,
      sectionPageCount: displayInfo?.sectionPageCount ?? totalPages ?? 1,
      pageFormat: page?.pageNumberFormat,
      chapterNumberText: page?.pageNumberChapterText,
      chapterSeparator: page?.pageNumberChapterSeparator,
    };
  };

  const hasPerSectionMargins = sectionMetadata.length > 1 && sectionMetadata.some((s) => s.margins || s.pageSize);

  if (hasPerSectionMargins) {
    await layoutWithPerSectionConstraints(
      'header',
      headerBlocksByRId,
      sectionMetadata,
      constraints,
      pageResolver,
      deps.headerLayoutsByRId,
      fontResolver,
      hasFace,
      effectiveSignature,
    );
    await layoutWithPerSectionConstraints(
      'footer',
      footerBlocksByRId,
      sectionMetadata,
      constraints,
      pageResolver,
      deps.footerLayoutsByRId,
      fontResolver,
      hasFace,
      effectiveSignature,
    );
  } else {
    // Single-section or uniform margins: use original single-constraint path
    const effectiveHeaderRefsBySection = buildEffectiveHeaderFooterRefsBySection(sectionMetadata, 'header');
    const effectiveFooterRefsBySection = buildEffectiveHeaderFooterRefsBySection(sectionMetadata, 'footer');
    await layoutBlocksByRId(
      'header',
      headerBlocksByRId,
      collectReferencedHeaderFooterRIds(effectiveHeaderRefsBySection),
      constraints,
      pageResolver,
      deps.headerLayoutsByRId,
      fontResolver,
      hasFace,
      effectiveSignature,
    );
    await layoutBlocksByRId(
      'footer',
      footerBlocksByRId,
      collectReferencedHeaderFooterRIds(effectiveFooterRefsBySection),
      constraints,
      pageResolver,
      deps.footerLayoutsByRId,
      fontResolver,
      hasFace,
      effectiveSignature,
    );
  }
}

/**
 * Layout blocks for a given kind (header/footer) using a single set of constraints.
 * This is the original code path for single-section or uniform-margin documents.
 */
async function layoutBlocksByRId(
  kind: 'header' | 'footer',
  blocksByRId: Map<string, FlowBlock[]> | undefined,
  referencedRIds: Set<string>,
  constraints: Constraints,
  pageResolver: PageResolver,
  layoutsByRId: Map<string, HeaderFooterLayoutResult>,
  fontResolver?: FontResolver,
  hasFace?: HasFace,
  effectiveSignature?: string,
): Promise<void> {
  if (!blocksByRId || referencedRIds.size === 0) return;

  // Face-aware per-document context for the measure callback; the (shared) header/footer cache keys
  // on the render plan's effectiveSignature (face-aware), NOT resolver.signature - so a single-face
  // substitute is safe here and a fonts.add() that changes a face's resolution busts the cache.
  const fontSignature = effectiveSignature ?? '';
  const fontMeasureContext: FontMeasureContext | undefined = fontResolver
    ? {
        resolvePhysical: (css, face) =>
          hasFace
            ? fontResolver.resolvePhysicalFamilyForFace(css, face, hasFace)
            : fontResolver.resolvePhysicalFamily(css),
        fontSignature,
      }
    : undefined;

  for (const [rId, blocks] of blocksByRId) {
    if (!referencedRIds.has(rId)) continue;
    if (!blocks || blocks.length === 0) continue;

    try {
      const batchResult = await layoutHeaderFooterWithCache(
        { default: blocks },
        constraints,
        (block: FlowBlock, c: { maxWidth: number; maxHeight: number }) => measureBlock(block, c, fontMeasureContext),
        undefined,
        undefined,
        pageResolver,
        kind,
        fontSignature,
      );

      if (batchResult.default) {
        layoutsByRId.set(rId, {
          kind,
          type: 'default',
          layout: batchResult.default.layout,
          blocks: batchResult.default.blocks,
          measures: batchResult.default.measures,
        });
      }
    } catch (error) {
      console.warn(`[PresentationEditor] Failed to layout ${kind} rId=${rId}:`, error);
    }
  }
}

/**
 * Deep-clone a HeaderFooterLayout so we can adjust fragment positions per-section
 * without mutating the shared measurement result.
 */
function cloneHeaderFooterLayout(layout: HeaderFooterLayout): HeaderFooterLayout {
  return {
    ...layout,
    pages: layout.pages.map((page) => ({
      ...page,
      fragments: page.fragments.map((f) => ({ ...f })),
    })),
  };
}

/**
 * Adjust frame-positioned paragraph fragments to use the section's content width
 * instead of the effective (table-extended) width for horizontal positioning.
 *
 * In Word, frame paragraphs with hAnchor="margin" are positioned relative to
 * the section's content margins, not the overflowed table width (SD-1837).
 */
function adjustFramePositionsForContentWidth(
  layout: HeaderFooterLayout,
  blocks: FlowBlock[],
  effectiveWidth: number,
  contentWidth: number,
): void {
  if (effectiveWidth <= contentWidth) return;

  const widthDiff = effectiveWidth - contentWidth;

  // Build block lookup by id
  const blockById = new Map<string, FlowBlock>();
  for (const block of blocks) {
    blockById.set(block.id, block);
  }

  for (const page of layout.pages) {
    for (const fragment of page.fragments) {
      if (fragment.kind !== 'para') continue;

      const block = blockById.get(fragment.blockId);
      if (!block || block.kind !== 'paragraph') continue;

      const frame = block.attrs?.frame;
      if (!frame || frame.wrap !== 'none') continue;

      if (frame.xAlign === 'right') {
        fragment.x -= widthDiff;
      } else if (frame.xAlign === 'center') {
        fragment.x -= widthDiff / 2;
      }
    }
  }
}

/**
 * Layout blocks with per-section constraints. Groups sections by (rId, contentWidth)
 * to avoid redundant measurements, and stores results with composite keys.
 */
async function layoutWithPerSectionConstraints(
  kind: 'header' | 'footer',
  blocksByRId: Map<string, FlowBlock[]> | undefined,
  sectionMetadata: SectionMetadata[],
  fallbackConstraints: Constraints,
  pageResolver: PageResolver,
  layoutsByRId: Map<string, HeaderFooterLayoutResult>,
  fontResolver?: FontResolver,
  hasFace?: HasFace,
  effectiveSignature?: string,
): Promise<void> {
  if (!blocksByRId) return;

  // See layoutBlocksByRId: face-aware per-document context + render-plan effectiveSignature as the cache key.
  const fontSignature = effectiveSignature ?? '';
  const fontMeasureContext: FontMeasureContext | undefined = fontResolver
    ? {
        resolvePhysical: (css, face) =>
          hasFace
            ? fontResolver.resolvePhysicalFamilyForFace(css, face, hasFace)
            : fontResolver.resolvePhysicalFamily(css),
        fontSignature,
      }
    : undefined;

  const groups = buildSectionAwareHeaderFooterMeasurementGroups(
    kind,
    blocksByRId,
    sectionMetadata,
    fallbackConstraints,
  );

  // Measure and layout each unique (rId, effectiveWidth) group.
  for (const group of groups) {
    const blocks = blocksByRId.get(group.rId);
    if (!blocks || blocks.length === 0) continue;

    try {
      const batchResult = await layoutHeaderFooterWithCache(
        { default: blocks },
        group.sectionConstraints,
        (block: FlowBlock, c: { maxWidth: number; maxHeight: number }) => measureBlock(block, c, fontMeasureContext),
        undefined,
        undefined,
        pageResolver,
        kind,
        fontSignature,
      );

      if (batchResult.default) {
        // Store a result per section. Sections in the same group share the same
        // measured layout, but may need different frame position adjustments
        // because they have different content widths (SD-1837).
        for (const sectionIndex of group.sectionIndices) {
          const section = sectionMetadata.find((s) => s.sectionIndex === sectionIndex)!;
          const contentWidth = buildSectionContentWidth(section, fallbackConstraints);
          const needsFrameAdjust = group.effectiveWidth > contentWidth;

          // Frame-positioned paragraphs (e.g. page numbers with framePr hAnchor="margin")
          // must be positioned relative to the section's content width, not the effective
          // (table-extended) width. Word positions these frames within the margin area
          // independently of any table overflow. Clone the layout when adjusting to avoid
          // mutating the shared result.
          let layout = batchResult.default.layout;
          if (needsFrameAdjust) {
            layout = cloneHeaderFooterLayout(layout);
            adjustFramePositionsForContentWidth(layout, batchResult.default.blocks, group.effectiveWidth, contentWidth);
          }

          const result: HeaderFooterLayoutResult = {
            kind,
            type: 'default',
            layout,
            blocks: batchResult.default.blocks,
            measures: batchResult.default.measures,
            effectiveWidth: needsFrameAdjust ? group.effectiveWidth : undefined,
          };

          layoutsByRId.set(buildSectionAwareHeaderFooterLayoutKey(group.rId, sectionIndex), result);
        }
      }
    } catch (error) {
      console.warn(`[PresentationEditor] Failed to layout ${kind} rId=${group.rId}:`, error);
    }
  }
}
