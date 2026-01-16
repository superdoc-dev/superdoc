import { selectionToRects, type PageGeometryHelper } from '@superdoc/layout-bridge';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';
import type { Editor } from '../../Editor.js';

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

  // Find the page containing this position by scanning fragments
  // Bookmarks often fall in gaps between fragments (e.g., at page/section breaks),
  // so we also track the first fragment starting after the position as a fallback
  let pageIndex: number | null = rect?.pageIndex ?? null;

  if (pageIndex == null) {
    let nextFragmentPage: number | null = null;
    let nextFragmentStart: number | null = null;

    for (const page of layout.pages) {
      for (const fragment of page.fragments) {
        if (fragment.kind !== 'para') continue;
        const fragStart = fragment.pmStart;
        const fragEnd = fragment.pmEnd;
        if (fragStart == null || fragEnd == null) continue;

        // Exact match: position is within this fragment
        if (pmPos >= fragStart && pmPos < fragEnd) {
          pageIndex = page.number - 1;
          break;
        }

        // Track the first fragment that starts after our position
        if (fragStart > pmPos && (nextFragmentStart === null || fragStart < nextFragmentStart)) {
          nextFragmentPage = page.number - 1;
          nextFragmentStart = fragStart;
        }
      }
      if (pageIndex != null) break;
    }

    // Use the page of the next fragment if bookmark is in a gap
    if (pageIndex == null && nextFragmentPage != null) {
      pageIndex = nextFragmentPage;
    }
  }

  if (pageIndex == null) return false;

  // Scroll to the target page and wait for it to mount (virtualization)
  scrollPageIntoView(pageIndex);
  await waitForPageMount(pageIndex, timeoutMs);

  // Scroll the page element into view
  const pageEl = painterHost.querySelector(`[data-page-index="${pageIndex}"]`) as HTMLElement | null;
  if (pageEl) {
    pageEl.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  // Move caret to the bookmark position
  const activeEditor = getActiveEditor();
  if (activeEditor?.commands?.setTextSelection) {
    activeEditor.commands.setTextSelection({ from: pmPos, to: pmPos });
  } else {
    // Navigation succeeded visually (page scrolled), but caret positioning is unavailable
    // This is not an error - log a warning for debugging
    console.warn(
      '[PresentationEditor] goToAnchor: Navigation succeeded but could not move caret (editor commands unavailable)',
    );
  }

  return true;
}
