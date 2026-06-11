import type { TableBlock, TableFragment, TableMeasure } from '@superdoc/contracts';
import { computePaintedCaretPageLocalFromRoots } from '../../../dom-observer/index.js';

export type TableCaretLayoutRect = { pageIndex: number; x: number; y: number; height: number };

export type ComputeTableCaretLayoutRectDeps = {
  viewportHost: HTMLElement;
  visibleHost: HTMLElement;
  zoom: number;
};

function findTableFragmentElement(viewportHost: HTMLElement, blockId: string, pageIndex: number): HTMLElement | null {
  const pageEl = viewportHost.querySelector<HTMLElement>(`[data-page-index="${pageIndex}"]`) ?? viewportHost;
  const candidates = Array.from(pageEl.querySelectorAll<HTMLElement>('[data-block-id]'));
  return candidates.find((el) => el.dataset.blockId === blockId) ?? null;
}

export function computeTableCaretLayoutRectFromDom(
  { viewportHost, zoom }: ComputeTableCaretLayoutRectDeps,
  pos: number,
  fragment: TableFragment,
  _tableBlock: TableBlock,
  _tableMeasure: TableMeasure,
  pageIndex: number,
): TableCaretLayoutRect | null {
  const pageEl = viewportHost.querySelector<HTMLElement>(`[data-page-index="${pageIndex}"]`) ?? viewportHost;
  const fragmentEl = findTableFragmentElement(viewportHost, fragment.blockId, pageIndex);
  const searchRoots = fragmentEl ? [fragmentEl] : [pageEl];

  const painted = computePaintedCaretPageLocalFromRoots(pageEl, searchRoots, pos, zoom);
  if (!painted) return null;

  return {
    pageIndex,
    x: painted.x,
    y: painted.y,
    height: painted.height,
  };
}
