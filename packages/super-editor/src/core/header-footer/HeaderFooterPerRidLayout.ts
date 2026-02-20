import type { FlowBlock, Layout, SectionMetadata } from '@superdoc/contracts';
import { computeDisplayPageNumber, layoutHeaderFooterWithCache } from '@superdoc/layout-bridge';
import type { HeaderFooterLayoutResult } from '@superdoc/layout-bridge';
import { measureBlock } from '@superdoc/measuring-dom';

export type HeaderFooterPerRidLayoutInput = {
  headerBlocks?: unknown;
  footerBlocks?: unknown;
  headerBlocksByRId: Map<string, FlowBlock[]> | undefined;
  footerBlocksByRId: Map<string, FlowBlock[]> | undefined;
  constraints: { width: number; height: number; pageWidth: number; margins: { left: number; right: number } };
};

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

  if (headerBlocksByRId) {
    for (const [rId, blocks] of headerBlocksByRId) {
      if (!blocks || blocks.length === 0) continue;

      try {
        const batchResult = await layoutHeaderFooterWithCache(
          { default: blocks },
          constraints,
          (block: FlowBlock, c: { maxWidth: number; maxHeight: number }) => measureBlock(block, c),
          undefined,
          undefined,
          pageResolver,
        );

        if (batchResult.default) {
          deps.headerLayoutsByRId.set(rId, {
            kind: 'header',
            type: 'default',
            layout: batchResult.default.layout,
            blocks: batchResult.default.blocks,
            measures: batchResult.default.measures,
          });
        }
      } catch (error) {
        console.warn(`[PresentationEditor] Failed to layout header rId=${rId}:`, error);
      }
    }
  }

  if (footerBlocksByRId) {
    for (const [rId, blocks] of footerBlocksByRId) {
      if (!blocks || blocks.length === 0) continue;

      try {
        const batchResult = await layoutHeaderFooterWithCache(
          { default: blocks },
          constraints,
          (block: FlowBlock, c: { maxWidth: number; maxHeight: number }) => measureBlock(block, c),
          undefined,
          undefined,
          pageResolver,
        );

        if (batchResult.default) {
          deps.footerLayoutsByRId.set(rId, {
            kind: 'footer',
            type: 'default',
            layout: batchResult.default.layout,
            blocks: batchResult.default.blocks,
            measures: batchResult.default.measures,
          });
        }
      } catch (error) {
        console.warn(`[PresentationEditor] Failed to layout footer rId=${rId}:`, error);
      }
    }
  }
}
