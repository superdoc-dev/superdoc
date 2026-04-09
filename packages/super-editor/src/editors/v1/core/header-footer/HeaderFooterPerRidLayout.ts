import type { FlowBlock, HeaderFooterLayout, Layout, SectionMetadata, SectionRefType } from '@superdoc/contracts';
import { OOXML_PCT_DIVISOR } from '@superdoc/contracts';
import { computeDisplayPageNumber, layoutHeaderFooterWithCache } from '@superdoc/layout-bridge';
import type { HeaderFooterLayoutResult, HeaderFooterConstraints } from '@superdoc/layout-bridge';
import { measureBlock } from '@superdoc/measuring-dom';

export type HeaderFooterPerRidLayoutInput = {
  headerBlocks?: unknown;
  footerBlocks?: unknown;
  headerBlocksByRId: Map<string, FlowBlock[]> | undefined;
  footerBlocksByRId: Map<string, FlowBlock[]> | undefined;
  constraints: HeaderFooterConstraints;
};

type Constraints = HeaderFooterConstraints;
type HeaderFooterRefs = Partial<Record<SectionRefType, string>>;
const HEADER_FOOTER_VARIANTS: SectionRefType[] = ['default', 'first', 'even', 'odd'];

/**
 * Compute the content width for a section, falling back to global constraints.
 */
function buildSectionContentWidth(section: SectionMetadata, fallback: Constraints): number {
  const pageW = section.pageSize?.w ?? fallback.pageWidth ?? 0;
  const marginL = section.margins?.left ?? fallback.margins?.left ?? 0;
  const marginR = section.margins?.right ?? fallback.margins?.right ?? 0;
  return pageW - marginL - marginR;
}

/**
 * Build constraints for a section using its margins/pageSize, falling back to global.
 * When a table's grid width exceeds the content width, use the grid width instead (SD-1837).
 * Word allows auto-width tables in headers/footers to extend beyond the body margins.
 */
function buildConstraintsForSection(section: SectionMetadata, fallback: Constraints, minWidth?: number): Constraints {
  const pageW = section.pageSize?.w ?? fallback.pageWidth ?? 0;
  const pageH = section.pageSize?.h ?? fallback.pageHeight;
  const marginL = section.margins?.left ?? fallback.margins?.left ?? 0;
  const marginR = section.margins?.right ?? fallback.margins?.right ?? 0;
  const marginT = section.margins?.top ?? fallback.margins?.top;
  const marginB = section.margins?.bottom ?? fallback.margins?.bottom;
  const marginHeader = section.margins?.header ?? fallback.margins?.header;
  const contentWidth = pageW - marginL - marginR;
  // Allow tables to extend beyond right margin when grid width > content width.
  // Capped at pageWidth - marginLeft to avoid going past the page edge.
  const maxWidth = pageW - marginL;
  const effectiveWidth = minWidth ? Math.min(Math.max(contentWidth, minWidth), maxWidth) : contentWidth;

  // Recompute body content height if section has its own page size / vertical margins
  const sectionMarginTop = marginT ?? 0;
  const sectionMarginBottom = marginB ?? 0;
  const sectionHeight = pageH != null ? Math.max(1, pageH - sectionMarginTop - sectionMarginBottom) : fallback.height;

  return {
    width: effectiveWidth,
    height: sectionHeight,
    pageWidth: pageW,
    pageHeight: pageH,
    margins: { left: marginL, right: marginR, top: marginT, bottom: marginB, header: marginHeader },
    overflowBaseHeight: fallback.overflowBaseHeight,
  };
}

/**
 * Table width specification extracted from footer/header blocks.
 * Used to compute the minimum constraint width per section.
 */
type TableWidthSpec = {
  /** 'pct' for percentage-based, 'grid' for auto-width using grid columns, 'px' for fixed pixel */
  type: 'pct' | 'grid' | 'px';
  /** For 'pct': OOXML percentage value (e.g. 5161 = 103.22%). For 'grid'/'px': width in pixels. */
  value: number;
};

/**
 * Extract table width specifications from a set of blocks.
 * Returns the spec for the widest table, distinguishing percentage-based from auto/fixed.
 *
 * For percentage tables (tblW type="pct"), the width must be resolved per-section since it
 * depends on the section's content width. The measuring-dom clamps pct tables to the constraint
 * width, so we must pre-expand the constraint to contentWidth * pct/5000.
 *
 * For auto-width tables (no tblW or tblW type="auto"), the grid columns are the layout basis.
 */
function getTableWidthSpec(blocks: FlowBlock[]): TableWidthSpec | undefined {
  let result: TableWidthSpec | undefined;
  let maxResolvedWidth = 0;

  for (const block of blocks) {
    if (block.kind !== 'table') continue;

    const tableWidth = (block as { attrs?: { tableWidth?: { width?: number; value?: number; type?: string } } }).attrs
      ?.tableWidth;
    const widthValue = tableWidth?.width ?? tableWidth?.value;

    if (tableWidth?.type === 'pct' && typeof widthValue === 'number' && widthValue > 0) {
      // Percentage-based table: store the raw pct value for per-section resolution.
      // Use a nominal large value for comparison so pct tables take priority.
      if (!result || result.type !== 'pct' || widthValue > result.value) {
        result = { type: 'pct', value: widthValue };
        maxResolvedWidth = Infinity; // pct always takes priority
      }
    } else if ((tableWidth?.type === 'px' || tableWidth?.type === 'pixel') && typeof widthValue === 'number') {
      // Fixed pixel width
      if (widthValue > maxResolvedWidth) {
        maxResolvedWidth = widthValue;
        result = { type: 'px', value: widthValue };
      }
    } else if (block.columnWidths && block.columnWidths.length > 0) {
      // Auto-width: use grid columns as minimum width
      const gridTotal = block.columnWidths.reduce((sum, w) => sum + w, 0);
      if (gridTotal > maxResolvedWidth) {
        maxResolvedWidth = gridTotal;
        result = { type: 'grid', value: gridTotal };
      }
    }
  }

  return result;
}

/**
 * Resolve the minimum constraint width for a section based on its table width spec.
 * For percentage-based tables, computes the percentage of the section's content width.
 * For auto/grid tables, returns the grid total directly.
 *
 * The measuring-dom clamps pct tables to Math.min(resolvedWidth, maxWidth), so for
 * pct > 100% the table would be limited to the constraint. We pre-compute the resolved
 * pct width and use it as the minimum constraint so the table can overflow properly.
 */
function resolveTableMinWidth(spec: TableWidthSpec | undefined, contentWidth: number): number {
  if (!spec) return 0;
  if (spec.type === 'pct') {
    return contentWidth * (spec.value / OOXML_PCT_DIVISOR);
  }
  return spec.value; // grid or px: already in pixels
}

function getRefsForKind(section: SectionMetadata, kind: 'header' | 'footer'): HeaderFooterRefs | undefined {
  return kind === 'header' ? section.headerRefs : section.footerRefs;
}

/**
 * Resolve the effective header/footer references for each section.
 *
 * Word inherits missing header/footer references from the previous section. This
 * helper applies that inheritance for every supported variant so downstream
 * layout only measures content that can actually be selected at render time.
 */
function buildEffectiveRefsBySection(
  sectionMetadata: SectionMetadata[],
  kind: 'header' | 'footer',
): Map<number, HeaderFooterRefs> {
  const result = new Map<number, HeaderFooterRefs>();
  let inheritedRefs: HeaderFooterRefs = {};

  for (const section of sectionMetadata) {
    const explicitRefs = getRefsForKind(section, kind);
    const effectiveRefs: HeaderFooterRefs = { ...inheritedRefs };

    for (const variant of HEADER_FOOTER_VARIANTS) {
      const rId = explicitRefs?.[variant];
      if (rId) {
        effectiveRefs[variant] = rId;
      }
    }

    if (Object.keys(effectiveRefs).length > 0) {
      result.set(section.sectionIndex, effectiveRefs);
    }

    inheritedRefs = effectiveRefs;
  }

  return result;
}

function collectReferencedRIdsBySection(effectiveRefsBySection: Map<number, HeaderFooterRefs>): Set<string> {
  const result = new Set<string>();

  for (const refs of effectiveRefsBySection.values()) {
    for (const variant of HEADER_FOOTER_VARIANTS) {
      const rId = refs[variant];
      if (rId) {
        result.add(rId);
      }
    }
  }

  return result;
}

/**
 * Resolve the default header/footer rId for each section.
 *
 * Multi-section layout has historically measured only the default variant with
 * section-specific constraints. Preserve that behavior to avoid changing
 * established rendering for documents that use first/even/odd variants.
 */
function resolveDefaultRIdPerSection(
  sectionMetadata: SectionMetadata[],
  kind: 'header' | 'footer',
): Map<number, string> {
  const result = new Map<number, string>();
  let inheritedDefaultRId: string | undefined;

  for (const section of sectionMetadata) {
    const refs = getRefsForKind(section, kind);
    const explicitDefaultRId = refs?.default;

    if (explicitDefaultRId) {
      inheritedDefaultRId = explicitDefaultRId;
    }

    if (inheritedDefaultRId) {
      result.set(section.sectionIndex, inheritedDefaultRId);
    }
  }

  return result;
}

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
): Promise<void> {
  deps.headerLayoutsByRId.clear();
  deps.footerLayoutsByRId.clear();

  if (!headerFooterInput) return;

  const { headerBlocksByRId, footerBlocksByRId, constraints } = headerFooterInput;

  const displayPages = computeDisplayPageNumber(layout.pages, sectionMetadata);
  const totalPages = layout.pages.length;

  const pageResolver = (pageNumber: number): { displayText: string; totalPages: number } => {
    const pageIndex = pageNumber - 1;
    const displayInfo = displayPages[pageIndex];
    return {
      displayText: displayInfo?.displayText ?? String(pageNumber),
      totalPages,
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
    );
    await layoutWithPerSectionConstraints(
      'footer',
      footerBlocksByRId,
      sectionMetadata,
      constraints,
      pageResolver,
      deps.footerLayoutsByRId,
    );
  } else {
    // Single-section or uniform margins: use original single-constraint path
    const effectiveHeaderRefsBySection = buildEffectiveRefsBySection(sectionMetadata, 'header');
    const effectiveFooterRefsBySection = buildEffectiveRefsBySection(sectionMetadata, 'footer');
    await layoutBlocksByRId(
      'header',
      headerBlocksByRId,
      collectReferencedRIdsBySection(effectiveHeaderRefsBySection),
      constraints,
      pageResolver,
      deps.headerLayoutsByRId,
    );
    await layoutBlocksByRId(
      'footer',
      footerBlocksByRId,
      collectReferencedRIdsBySection(effectiveFooterRefsBySection),
      constraints,
      pageResolver,
      deps.footerLayoutsByRId,
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
  pageResolver: (pageNumber: number) => { displayText: string; totalPages: number },
  layoutsByRId: Map<string, HeaderFooterLayoutResult>,
): Promise<void> {
  if (!blocksByRId || referencedRIds.size === 0) return;

  for (const [rId, blocks] of blocksByRId) {
    if (!referencedRIds.has(rId)) continue;
    if (!blocks || blocks.length === 0) continue;

    try {
      const batchResult = await layoutHeaderFooterWithCache(
        { default: blocks },
        constraints,
        (block: FlowBlock, c: { maxWidth: number; maxHeight: number }) => measureBlock(block, c),
        undefined,
        undefined,
        pageResolver,
        kind,
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
  pageResolver: (pageNumber: number) => { displayText: string; totalPages: number },
  layoutsByRId: Map<string, HeaderFooterLayoutResult>,
): Promise<void> {
  if (!blocksByRId) return;

  const defaultRIdPerSection = resolveDefaultRIdPerSection(sectionMetadata, kind);

  // Extract table width specs per rId (SD-1837).
  // Word allows tables in headers/footers to extend beyond content margins.
  // For pct tables, the width is relative to the section's content width.
  // For auto-width tables, the grid columns define the minimum width.
  const tableWidthSpecByRId = new Map<string, TableWidthSpec>();
  for (const [rId, blocks] of blocksByRId) {
    const spec = getTableWidthSpec(blocks);
    if (spec) {
      tableWidthSpecByRId.set(rId, spec);
    }
  }

  // Group sections by (rId, effectiveWidth) to measure each unique pair only once
  // Key: `${rId}::w${effectiveWidth}`, Value: { constraints, sections[] }
  const groups = new Map<
    string,
    { sectionConstraints: Constraints; sectionIndices: number[]; rId: string; effectiveWidth: number }
  >();

  for (const section of sectionMetadata) {
    const rId = defaultRIdPerSection.get(section.sectionIndex);
    if (!rId || !blocksByRId.has(rId)) continue;

    // Resolve the minimum width needed for tables in this section.
    // For pct tables, this depends on the section's content width.
    const contentWidth = buildSectionContentWidth(section, fallbackConstraints);
    const tableWidthSpec = tableWidthSpecByRId.get(rId);
    const tableMinWidth = resolveTableMinWidth(tableWidthSpec, contentWidth);
    const sectionConstraints = buildConstraintsForSection(section, fallbackConstraints, tableMinWidth || undefined);
    const effectiveWidth = sectionConstraints.width;
    // Include vertical geometry in the key so sections with different page heights,
    // vertical margins, or header distance get separate layouts (page-relative anchors
    // and header band origin resolve differently).
    const groupKey = `${rId}::w${effectiveWidth}::ph${sectionConstraints.pageHeight ?? ''}::mt${sectionConstraints.margins?.top ?? ''}::mb${sectionConstraints.margins?.bottom ?? ''}::mh${sectionConstraints.margins?.header ?? ''}`;

    let group = groups.get(groupKey);
    if (!group) {
      group = {
        sectionConstraints,
        sectionIndices: [],
        rId,
        effectiveWidth,
      };
      groups.set(groupKey, group);
    }
    group.sectionIndices.push(section.sectionIndex);
  }

  // Measure and layout each unique (rId, effectiveWidth) group
  for (const [, group] of groups) {
    const blocks = blocksByRId.get(group.rId);
    if (!blocks || blocks.length === 0) continue;

    try {
      const batchResult = await layoutHeaderFooterWithCache(
        { default: blocks },
        group.sectionConstraints,
        (block: FlowBlock, c: { maxWidth: number; maxHeight: number }) => measureBlock(block, c),
        undefined,
        undefined,
        pageResolver,
        kind,
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

          layoutsByRId.set(`${group.rId}::s${sectionIndex}`, result);
        }
      }
    } catch (error) {
      console.warn(`[PresentationEditor] Failed to layout ${kind} rId=${group.rId}:`, error);
    }
  }
}
