import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';
import { getFragmentAtPosition } from '@superdoc/layout-bridge';

export type SelectionLike = {
  from: number;
  to: number;
  anchor?: number;
  head?: number;
};

export function computeSelectionVirtualizationPins(options: {
  layout: Layout;
  blocks: FlowBlock[];
  measures: Measure[];
  selection: SelectionLike | null;
  docSize: number | null;
  includeDragBuffer: boolean;
  isDragging: boolean;
  dragAnchorPageIndex: number | null;
  dragLastHitPageIndex: number | null;
  extraPages?: number[];
}): number[] {
  const pageCount = options.layout.pages.length;
  if (pageCount <= 0) {
    return [];
  }

  const pinned = new Set<number>();

  const add = (pageIndex: number) => {
    if (!Number.isFinite(pageIndex)) return;
    const idx = Math.floor(pageIndex);
    if (idx < 0 || idx >= pageCount) return;
    pinned.add(idx);
    if (!options.includeDragBuffer) return;
    if (idx - 1 >= 0) pinned.add(idx - 1);
    if (idx + 1 < pageCount) pinned.add(idx + 1);
  };

  // Prefer drag-tracked endpoints while actively dragging to avoid O(pages) scans per pointermove.
  if (options.isDragging && options.dragAnchorPageIndex != null && options.dragLastHitPageIndex != null) {
    add(options.dragAnchorPageIndex);
    add(options.dragLastHitPageIndex);
  } else if (options.selection) {
    const anchorPos = (options.selection as unknown as { anchor?: number }).anchor ?? options.selection.from;
    const headPos = (options.selection as unknown as { head?: number }).head ?? options.selection.to;

    const anchorFrag = getFragmentAtPosition(options.layout, options.blocks, options.measures, anchorPos);
    const headFrag = getFragmentAtPosition(options.layout, options.blocks, options.measures, headPos);
    if (anchorFrag) add(anchorFrag.pageIndex);
    if (headFrag) add(headFrag.pageIndex);

    // Fallback for boundary positions that may not map to a fragment (empty docs, end-of-doc).
    if (options.docSize != null) {
      if (!anchorFrag && anchorPos <= 1) add(0);
      if (!headFrag && headPos >= options.docSize) add(pageCount - 1);
    }
  }

  for (const extra of options.extraPages ?? []) {
    add(extra);
  }

  return Array.from(pinned).sort((a, b) => a - b);
}
