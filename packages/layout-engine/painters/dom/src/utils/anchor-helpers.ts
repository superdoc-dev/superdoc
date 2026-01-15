import type { WrapExclusion, RenderedLineInfo } from '@superdoc/contracts';

const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const mergeSortedSegments = (
  segments: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> => {
  if (segments.length <= 1) return segments;

  const merged: Array<{ start: number; end: number }> = [];
  let current = segments[0]!;
  for (let i = 1; i < segments.length; i += 1) {
    const next = segments[i]!;
    if (next.start <= current.end) {
      current = { start: current.start, end: Math.max(current.end, next.end) };
      continue;
    }
    merged.push(current);
    current = next;
  }
  merged.push(current);
  return merged;
};

export const applySquareWrapExclusionsToLines = (
  renderedLines: RenderedLineInfo[],
  exclusions: WrapExclusion[],
  contentWidthPx: number,
  alignmentOffsetY: number,
): void => {
  if (renderedLines.length === 0 || exclusions.length === 0 || contentWidthPx <= 0) return;

  renderedLines.forEach((line) => {
    const paddingLeft = line.el.style.paddingLeft;
    const paddingRight = line.el.style.paddingRight;
    if ((paddingLeft && paddingLeft !== '0px') || (paddingRight && paddingRight !== '0px')) {
      return;
    }

    const lineTop = line.top + alignmentOffsetY;
    const lineBottom = lineTop + line.height;

    const excludedSegments: Array<{ start: number; end: number }> = [];
    for (const ex of exclusions) {
      if (lineBottom <= ex.top || lineTop >= ex.bottom) continue;
      if (ex.wrapText !== 'bothSides') continue;

      const start = clampNumber(ex.left, 0, contentWidthPx);
      const end = clampNumber(ex.right, 0, contentWidthPx);
      if (end <= start) continue;
      excludedSegments.push({ start, end });
    }

    if (excludedSegments.length === 0) return;

    excludedSegments.sort((a, b) => a.start - b.start);
    const merged = mergeSortedSegments(excludedSegments);

    // Find the widest available interval after subtracting excluded segments.
    let bestStart = 0;
    let bestWidth = 0;
    let cursor = 0;
    for (const seg of merged) {
      const gapWidth = seg.start - cursor;
      if (gapWidth > bestWidth) {
        bestStart = cursor;
        bestWidth = gapWidth;
      }
      cursor = Math.max(cursor, seg.end);
    }
    const tailWidth = contentWidthPx - cursor;
    if (tailWidth > bestWidth) {
      bestStart = cursor;
      bestWidth = tailWidth;
    }

    if (bestWidth <= 0 || (bestStart === 0 && bestWidth >= contentWidthPx)) return;

    const marginLeft = bestStart;
    const marginRight = Math.max(0, contentWidthPx - (bestStart + bestWidth));

    line.el.style.boxSizing = 'border-box';
    line.el.style.marginLeft = `${marginLeft}px`;
    line.el.style.marginRight = `${marginRight}px`;
  });
};
