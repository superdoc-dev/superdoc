import type { TableBlock, TableFragment, TableMeasure } from '@superdoc/contracts';

export type TableCaretLayoutRect = { pageIndex: number; x: number; y: number; height: number };

export type ComputeTableCaretLayoutRectDeps = {
  viewportHost: HTMLElement;
  visibleHost: HTMLElement;
  zoom: number;
};

export function computeTableCaretLayoutRectFromDom(
  { viewportHost, visibleHost, zoom }: ComputeTableCaretLayoutRectDeps,
  pos: number,
  _fragment: TableFragment,
  _tableBlock: TableBlock,
  _tableMeasure: TableMeasure,
  pageIndex: number,
): TableCaretLayoutRect | null {
  // Use DOM-based positioning for accuracy (matching how click mapping works)
  // Find the line element with data-pm-start/end that contains this position
  const lineEls = Array.from(viewportHost.querySelectorAll('.superdoc-line'));

  // Early return if DOM not yet rendered
  if (lineEls.length === 0) return null;

  for (const lineEl of lineEls) {
    const pmStart = Number((lineEl as HTMLElement).dataset.pmStart ?? 'NaN');
    const pmEnd = Number((lineEl as HTMLElement).dataset.pmEnd ?? 'NaN');

    if (!Number.isFinite(pmStart) || !Number.isFinite(pmEnd)) continue;
    if (pos < pmStart || pos > pmEnd) continue;

    // Found the line containing this position
    // Now find the span containing the position
    const spanEls = Array.from(lineEl.querySelectorAll('span[data-pm-start]'));

    for (const spanEl of spanEls) {
      const spanStart = Number((spanEl as HTMLElement).dataset.pmStart ?? 'NaN');
      const spanEnd = Number((spanEl as HTMLElement).dataset.pmEnd ?? 'NaN');

      if (!Number.isFinite(spanStart) || !Number.isFinite(spanEnd)) continue;
      if (pos < spanStart || pos > spanEnd) continue;

      // Found the span - use Range API to get exact character position
      const textNode = spanEl.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        // No text node - return span start position
        const spanRect = spanEl.getBoundingClientRect();
        const viewportRect = viewportHost.getBoundingClientRect();

        return {
          pageIndex,
          x: (spanRect.left - viewportRect.left + visibleHost.scrollLeft) / zoom,
          y: (spanRect.top - viewportRect.top + visibleHost.scrollTop) / zoom,
          height: spanRect.height / zoom,
        };
      }

      // Use Range to find exact character position
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

    // Position is in line but no matching span - return line start
    const lineRect = (lineEl as HTMLElement).getBoundingClientRect();
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
