import type { DrawingFragment, TextboxDrawing } from '@superdoc/contracts';

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
  { viewportHost, visibleHost, zoom }: ComputeTextboxCaretLayoutRectDeps,
  pos: number,
  fragment: DrawingFragment,
  _block: TextboxDrawing,
  pageIndex: number,
): TextboxCaretLayoutRect | null {
  const fragmentEl = findTextboxFragmentElement(viewportHost, fragment.blockId, pageIndex);
  if (!fragmentEl) return null;

  const lineEls = Array.from(fragmentEl.querySelectorAll<HTMLElement>('.superdoc-line[data-pm-start][data-pm-end]'));
  if (lineEls.length === 0) return null;

  for (let lineIdx = 0; lineIdx < lineEls.length; lineIdx++) {
    const lineEl = lineEls[lineIdx];
    const pmStart = Number(lineEl.dataset.pmStart ?? 'NaN');
    const pmEnd = Number(lineEl.dataset.pmEnd ?? 'NaN');
    if (!Number.isFinite(pmStart) || !Number.isFinite(pmEnd)) continue;
    // Use exclusive pmEnd for all but the last line so that a position exactly at
    // a soft-wrap boundary (where lineN.pmEnd === lineN+1.pmStart) resolves to the
    // start of the next visual line rather than the end of the previous one.
    const isLastLine = lineIdx === lineEls.length - 1;
    if (pos < pmStart || (isLastLine ? pos > pmEnd : pos >= pmEnd)) continue;

    const spanEls = Array.from(lineEl.querySelectorAll<HTMLElement>('span[data-pm-start][data-pm-end]'));
    for (let spanIdx = 0; spanIdx < spanEls.length; spanIdx++) {
      const spanEl = spanEls[spanIdx];
      const spanStart = Number(spanEl.dataset.pmStart ?? 'NaN');
      const spanEnd = Number(spanEl.dataset.pmEnd ?? 'NaN');
      if (!Number.isFinite(spanStart) || !Number.isFinite(spanEnd)) continue;
      const isLastSpan = spanIdx === spanEls.length - 1;
      if (pos < spanStart || (isLastSpan ? pos > spanEnd : pos >= spanEnd)) continue;

      const textNode = spanEl.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        const spanRect = spanEl.getBoundingClientRect();
        const viewportRect = viewportHost.getBoundingClientRect();
        return {
          pageIndex,
          x: (spanRect.left - viewportRect.left + visibleHost.scrollLeft) / zoom,
          y: (spanRect.top - viewportRect.top + visibleHost.scrollTop) / zoom,
          height: spanRect.height / zoom,
        };
      }

      const text = textNode.textContent ?? '';
      const charOffset = Math.max(0, Math.min(text.length, pos - spanStart));
      const range = document.createRange();
      range.setStart(textNode, charOffset);
      range.setEnd(textNode, charOffset);

      const rangeRect = range.getBoundingClientRect();
      const viewportRect = viewportHost.getBoundingClientRect();
      const lineRect = lineEl.getBoundingClientRect();

      return {
        pageIndex,
        x: (rangeRect.left - viewportRect.left + visibleHost.scrollLeft) / zoom,
        y: (lineRect.top - viewportRect.top + visibleHost.scrollTop) / zoom,
        height: lineRect.height / zoom,
      };
    }

    const lineRect = lineEl.getBoundingClientRect();
    const viewportRect = viewportHost.getBoundingClientRect();
    return {
      pageIndex,
      x: (lineRect.left - viewportRect.left + visibleHost.scrollLeft) / zoom,
      y: (lineRect.top - viewportRect.top + visibleHost.scrollTop) / zoom,
      height: lineRect.height / zoom,
    };
  }

  return null;
}
