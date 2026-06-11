import type { DrawingFragment, TextboxDrawing } from '@superdoc/contracts';
import { computePaintedCaretPageLocalFromRoots } from '../../../dom-observer/index.js';

export type TextboxCaretLayoutRect = { pageIndex: number; x: number; y: number; height: number };

export type ComputeTextboxCaretLayoutRectDeps = {
  viewportHost: HTMLElement;
  visibleHost: HTMLElement;
  zoom: number;
};

function findTextboxFragmentElement(viewportHost: HTMLElement, blockId: string, pageIndex: number): HTMLElement | null {
  // Scope the search to the correct page so the same blockId on repeated H/F
  // pages (same header/footer painted on every page) resolves to the right DOM instance.
  const pageEl = viewportHost.querySelector<HTMLElement>(`[data-page-index="${pageIndex}"]`) ?? viewportHost;
  const candidates = Array.from(pageEl.querySelectorAll<HTMLElement>('[data-block-id]'));
  return candidates.find((el) => el.dataset.blockId === blockId) ?? null;
}

export function computeTextboxCaretLayoutRectFromDom(
  { viewportHost, zoom }: ComputeTextboxCaretLayoutRectDeps,
  pos: number,
  fragment: DrawingFragment,
  _block: TextboxDrawing,
  pageIndex: number,
): TextboxCaretLayoutRect | null {
  const pageEl = viewportHost.querySelector<HTMLElement>(`[data-page-index="${pageIndex}"]`) ?? viewportHost;
  const fragmentEl = findTextboxFragmentElement(viewportHost, fragment.blockId, pageIndex);
  if (!fragmentEl) return null;

  const painted = computePaintedCaretPageLocalFromRoots(pageEl, [fragmentEl], pos, zoom);
  if (!painted) return null;

  return {
    pageIndex,
    x: painted.x,
    y: painted.y,
    height: painted.height,
  };
}
