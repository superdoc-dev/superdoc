import { selectionToRects, type PageGeometryHelper } from '@superdoc/layout-bridge';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';
import type { Editor } from '../../Editor.js';
import { getPageElementByIndex } from '../dom/PageDom.js';

/**
 * Build an anchor map (bookmark name -> page index) using fragment PM ranges.
 * Mirrors layout-engine's buildAnchorMap to avoid an extra dependency here.
 */
export function computeAnchorMap(
  bookmarks: Map<string, number>,
  layout: Layout,
  blocks: FlowBlock[],
): Map<string, number> {
  const anchorMap = new Map<string, number>();

  // Precompute block PM ranges for fallbacks
  const blockPmRanges = new Map<
    string,
    { pmStart: number | null; pmEnd: number | null; hasFragmentPositions: boolean }
  >();

  const computeBlockRange = (blockId: string): { pmStart: number | null; pmEnd: number | null } => {
    if (blockPmRanges.has(blockId)) {
      const cached = blockPmRanges.get(blockId)!;
      return { pmStart: cached.pmStart, pmEnd: cached.pmEnd };
    }
    const block = blocks.find((b) => b.id === blockId);
    if (!block || block.kind !== 'paragraph') {
      blockPmRanges.set(blockId, { pmStart: null, pmEnd: null, hasFragmentPositions: false });
      return { pmStart: null, pmEnd: null };
    }
    let pmStart: number | null = null;
    let pmEnd: number | null = null;
    for (const run of block.runs) {
      if (run.pmStart != null) {
        pmStart = pmStart == null ? run.pmStart : Math.min(pmStart, run.pmStart);
      }
      if (run.pmEnd != null) {
        pmEnd = pmEnd == null ? run.pmEnd : Math.max(pmEnd, run.pmEnd);
      }
    }
    blockPmRanges.set(blockId, { pmStart, pmEnd, hasFragmentPositions: false });
    return { pmStart, pmEnd };
  };

  bookmarks.forEach((pmPosition, bookmarkName) => {
    for (const page of layout.pages) {
      for (const fragment of page.fragments) {
        if (fragment.kind !== 'para') continue;
        let fragStart = fragment.pmStart;
        let fragEnd = fragment.pmEnd;
        if (fragStart == null || fragEnd == null) {
          const range = computeBlockRange(fragment.blockId);
          if (range.pmStart != null && range.pmEnd != null) {
            fragStart = range.pmStart;
            fragEnd = range.pmEnd;
          }
        } else {
          // Remember that this block had fragment positions
          const cached = blockPmRanges.get(fragment.blockId);
          blockPmRanges.set(fragment.blockId, {
            pmStart: cached?.pmStart ?? fragStart,
            pmEnd: cached?.pmEnd ?? fragEnd,
            hasFragmentPositions: true,
          });
        }
        if (fragStart == null || fragEnd == null) continue;
        if (pmPosition >= fragStart && pmPosition < fragEnd) {
          anchorMap.set(bookmarkName, page.number);
          return;
        }
      }
    }
  });

  return anchorMap;
}

export type GoToAnchorDeps = {
  anchor: string;
  layout: Layout | null;
  blocks: FlowBlock[];
  measures: Measure[];
  bookmarks: Map<string, number>;
  pageGeometryHelper?: PageGeometryHelper;
  painterHost: HTMLElement;
  scrollContainer: Element | Window;
  zoom: number;
  scrollPageIntoView: (pageIndex: number) => void;
  waitForPageMount: (pageIndex: number, timeoutMs: number) => Promise<boolean>;
  getActiveEditor: () => Editor;
  timeoutMs: number;
};

export async function goToAnchor({
  anchor,
  layout,
  blocks,
  measures,
  bookmarks,
  pageGeometryHelper,
  painterHost,
  scrollContainer,
  zoom,
  scrollPageIntoView,
  waitForPageMount,
  getActiveEditor,
  timeoutMs,
}: GoToAnchorDeps): Promise<boolean> {
  if (!anchor) return false;
  if (!layout) return false;

  const normalized = anchor.startsWith('#') ? anchor.slice(1) : anchor;
  if (!normalized) return false;

  const pmPos = bookmarks.get(normalized);
  if (pmPos == null) return false;

  // Try to get exact position rect for precise scrolling
  const rects = selectionToRects(layout, blocks, measures, pmPos, pmPos + 1, pageGeometryHelper) ?? [];
  const rect = rects[0];

  // Find the page and fragment Y offset for the bookmark position.
  // selectionToRects often returns empty for bookmarks (zero-width inline nodes),
  // so we scan layout fragments to find the precise Y coordinate within the page.
  // Note: rect?.y is document-absolute (not page-relative), so we only use pageIndex
  // from the rect and always derive fragmentY from layout fragments.
  let pageIndex: number | null = rect?.pageIndex ?? null;
  let fragmentY: number | null = null;

  if (pageIndex == null) {
    let nextFragmentPage: number | null = null;
    let nextFragmentStart: number | null = null;
    let nextFragmentY: number | null = null;

    for (const page of layout.pages) {
      for (const fragment of page.fragments) {
        if (fragment.kind !== 'para') continue;
        const fragStart = fragment.pmStart;
        const fragEnd = fragment.pmEnd;
        if (fragStart == null || fragEnd == null) continue;

        // Exact match: position is within this fragment
        if (pmPos >= fragStart && pmPos < fragEnd) {
          pageIndex = page.number - 1;
          fragmentY = fragment.y;
          break;
        }

        // Track the first fragment that starts after our position
        if (fragStart > pmPos && (nextFragmentStart === null || fragStart < nextFragmentStart)) {
          nextFragmentPage = page.number - 1;
          nextFragmentStart = fragStart;
          nextFragmentY = fragment.y;
        }
      }
      if (pageIndex != null) break;
    }

    // Use the page of the next fragment if bookmark is in a gap
    if (pageIndex == null && nextFragmentPage != null) {
      pageIndex = nextFragmentPage;
      fragmentY = nextFragmentY;
    }
  }

  if (pageIndex == null) return false;

  // Scroll to the target page and wait for it to mount (virtualization)
  scrollPageIntoView(pageIndex);
  await waitForPageMount(pageIndex, timeoutMs);

  // Scroll to the precise position within the page using the fragment Y offset.
  // We use the passed-in scrollContainer rather than discovering it via DOM traversal,
  // because intermediate elements (like painterHost) may have overflow CSS but are
  // not the actual scroll viewport.
  const pageEl = getPageElementByIndex(painterHost, pageIndex);

  if (pageEl && fragmentY != null) {
    // fragmentY is in layout-space (unscaled) pixels — scale to screen-space to match
    // getBoundingClientRect() values which already account for CSS transform: scale(zoom).
    const scaledY = fragmentY * zoom;

    if (scrollContainer instanceof Element) {
      const pageRect = pageEl.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const targetY = pageRect.top - containerRect.top + scrollContainer.scrollTop + scaledY;
      scrollContainer.scrollTo({ top: targetY, behavior: 'instant' });
    } else {
      // Window scroll
      const pageRect = pageEl.getBoundingClientRect();
      const targetY = pageRect.top + scrollContainer.scrollY + scaledY;
      scrollContainer.scrollTo({ top: targetY, behavior: 'instant' });
    }
  } else if (pageEl) {
    pageEl.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  // Move caret to the bookmark position
  const activeEditor = getActiveEditor();
  if (activeEditor?.commands?.setTextSelection) {
    activeEditor.commands.setTextSelection({ from: pmPos, to: pmPos });
  } else {
    console.warn(
      '[PresentationEditor] goToAnchor: Navigation succeeded but could not move caret (editor commands unavailable)',
    );
  }

  return true;
}
