import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';

import { deduplicateOverlappingRects, type LayoutRect } from '../../../dom-observer/DomSelectionGeometry.js';

type VisibleTextSegment = {
  node: Text;
  startOffset: number;
  endOffset: number;
  pageElement: HTMLElement;
  lineElement: HTMLElement | null;
};

type VisibleTextModel = {
  segments: VisibleTextSegment[];
  totalLength: number;
};

type ResolvedTextPoint = {
  node: Text;
  offset: number;
  pageElement: HTMLElement;
  lineElement: HTMLElement | null;
};

export type VisibleTextOffsetGeometryOptions = {
  containers: HTMLElement[];
  zoom: number;
  pageHeight: number;
  pageGap: number;
};

/**
 * Measures a visible-text offset within a DOM root from a concrete DOM boundary.
 *
 * This is used for note overlays because `EditorView.domAtPos()` can resolve the
 * active note selection to the correct hidden-editor DOM boundary even when the
 * ProseMirror position lands inside tracked-change wrapper structure. Measuring the
 * boundary as visible text gives us a stable bridge from the hidden editor DOM to
 * the painted note DOM.
 */
export function measureVisibleTextOffset(root: HTMLElement, boundaryNode: Node, boundaryOffset: number): number | null {
  if (!root || !boundaryNode) {
    return null;
  }
  if (boundaryNode !== root && !root.contains(boundaryNode)) {
    return null;
  }

  const doc = root.ownerDocument ?? document;
  const boundary = doc.createRange();

  try {
    boundary.setStart(boundaryNode, boundaryOffset);
    boundary.setEnd(boundaryNode, boundaryOffset);
  } catch {
    return null;
  }

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textNode = currentNode as Text;
    const textLength = textNode.textContent?.length ?? 0;
    if (textLength === 0) {
      currentNode = walker.nextNode();
      continue;
    }

    const textRange = doc.createRange();
    textRange.selectNodeContents(textNode);

    if (textRange.compareBoundaryPoints(Range.END_TO_END, boundary) <= 0) {
      total += textLength;
      currentNode = walker.nextNode();
      continue;
    }

    if (textNode === boundaryNode) {
      return total + Math.max(0, Math.min(boundaryOffset, textLength));
    }

    if (textRange.compareBoundaryPoints(Range.START_TO_START, boundary) >= 0) {
      return total;
    }

    return total;
  }

  return total;
}

export function measureVisibleTextOffsetInContainers(
  containers: readonly HTMLElement[],
  boundaryNode: Node,
  boundaryOffset: number,
): number | null {
  const root = containers[0];
  if (!root || !boundaryNode) {
    return null;
  }

  const boundaryInsideContainers = containers.some(
    (container) => boundaryNode === container || container.contains(boundaryNode),
  );
  if (!boundaryInsideContainers) {
    return null;
  }

  const doc = root.ownerDocument ?? document;
  const boundary = doc.createRange();

  try {
    boundary.setStart(boundaryNode, boundaryOffset);
    boundary.setEnd(boundaryNode, boundaryOffset);
  } catch {
    return null;
  }

  const model = collectVisibleTextModel(containers);
  for (const segment of model.segments) {
    const textNode = segment.node;
    const textLength = textNode.textContent?.length ?? 0;
    if (textLength === 0) {
      continue;
    }

    const textRange = doc.createRange();
    textRange.selectNodeContents(textNode);

    if (textRange.compareBoundaryPoints(Range.END_TO_END, boundary) <= 0) {
      continue;
    }

    if (textNode === boundaryNode) {
      return segment.startOffset + Math.max(0, Math.min(boundaryOffset, textLength));
    }

    if (textRange.compareBoundaryPoints(Range.START_TO_START, boundary) >= 0) {
      return segment.startOffset;
    }

    return segment.startOffset;
  }

  return model.totalLength;
}

export function resolveVisibleTextBoundary(
  containers: readonly HTMLElement[],
  textOffset: number,
  affinity: 'forward' | 'backward' = 'forward',
): { node: Text; offset: number } | null {
  const model = collectVisibleTextModel(containers);
  const point = resolveTextPoint(model, textOffset, affinity);
  if (!point) {
    return null;
  }

  return {
    node: point.node,
    offset: point.offset,
  };
}

export function computeCaretRectFromVisibleTextOffset(
  options: VisibleTextOffsetGeometryOptions,
  textOffset: number,
): LayoutRect | null {
  const model = collectVisibleTextModel(options.containers);
  if (!model.segments.length) {
    return null;
  }

  const point = resolveTextPoint(model, textOffset, 'forward');
  if (!point) {
    return null;
  }

  const doc = point.node.ownerDocument ?? document;
  const range = doc.createRange();
  range.setStart(point.node, point.offset);
  range.setEnd(point.node, point.offset);

  const rangeRect = range.getBoundingClientRect();
  const lineRect = point.lineElement?.getBoundingClientRect() ?? rangeRect;
  const pageRect = point.pageElement.getBoundingClientRect();
  const pageIndex = Number(point.pageElement.dataset.pageIndex ?? 'NaN');

  if (!Number.isFinite(pageIndex)) {
    return null;
  }

  const localX = (rangeRect.left - pageRect.left) / options.zoom;
  const localY = (lineRect.top - pageRect.top) / options.zoom;
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
    return null;
  }

  return {
    pageIndex,
    x: localX,
    y: pageIndex * (options.pageHeight + options.pageGap) + localY,
    width: 1,
    height: Math.max(1, lineRect.height / options.zoom),
  };
}

export function computeSelectionRectsFromVisibleTextOffsets(
  options: VisibleTextOffsetGeometryOptions,
  fromOffset: number,
  toOffset: number,
): LayoutRect[] | null {
  if (!Number.isFinite(fromOffset) || !Number.isFinite(toOffset)) {
    return null;
  }

  const startOffset = Math.min(fromOffset, toOffset);
  const endOffset = Math.max(fromOffset, toOffset);
  if (startOffset === endOffset) {
    return [];
  }

  const model = collectVisibleTextModel(options.containers);
  if (!model.segments.length) {
    return null;
  }

  const startPoint = resolveTextPoint(model, startOffset, 'forward');
  const endPoint = resolveTextPoint(model, endOffset, 'backward');
  if (!startPoint || !endPoint) {
    return null;
  }

  const doc = startPoint.node.ownerDocument ?? document;
  const range = doc.createRange();

  try {
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
  } catch {
    return null;
  }

  const rawRects = Array.from(range.getClientRects()) as unknown as DOMRect[];
  const pageElements = collectUniquePageElements(model.segments);
  const rects = deduplicateOverlappingRects(rawRects);
  const layoutRects: LayoutRect[] = [];

  for (const rect of rects) {
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
      continue;
    }

    const pageElement = findPageElementForRect(rect, pageElements);
    if (!pageElement) {
      continue;
    }

    const pageRect = pageElement.getBoundingClientRect();
    const pageIndex = Number(pageElement.dataset.pageIndex ?? 'NaN');
    if (!Number.isFinite(pageIndex)) {
      continue;
    }

    const localX = (rect.left - pageRect.left) / options.zoom;
    const localY = (rect.top - pageRect.top) / options.zoom;
    if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
      continue;
    }

    layoutRects.push({
      pageIndex,
      x: localX,
      y: pageIndex * (options.pageHeight + options.pageGap) + localY,
      width: Math.max(1, rect.width / options.zoom),
      height: Math.max(1, rect.height / options.zoom),
    });
  }

  return layoutRects;
}

function collectVisibleTextModel(containers: readonly HTMLElement[]): VisibleTextModel {
  const lines = collectRenderedLineElements(containers);
  if (!lines.length) {
    return {
      segments: [],
      totalLength: 0,
    };
  }

  const segments: VisibleTextSegment[] = [];
  let totalLength = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineElement = lines[lineIndex]!;
    const leafElements = collectLeafPmElements(lineElement);
    let lineVisibleLength = 0;

    for (const leafElement of leafElements) {
      const pageElement = leafElement.closest<HTMLElement>(`.${DOM_CLASS_NAMES.PAGE}[data-page-index]`);
      if (!pageElement) {
        continue;
      }

      const doc = leafElement.ownerDocument ?? document;
      const walker = doc.createTreeWalker(leafElement, NodeFilter.SHOW_TEXT);
      let currentNode = walker.nextNode();

      while (currentNode) {
        const textNode = currentNode as Text;
        const textLength = textNode.textContent?.length ?? 0;
        if (textLength > 0) {
          segments.push({
            node: textNode,
            startOffset: totalLength + lineVisibleLength,
            endOffset: totalLength + lineVisibleLength + textLength,
            pageElement,
            lineElement,
          });
          lineVisibleLength += textLength;
        }

        currentNode = walker.nextNode();
      }
    }

    const lineTrailingGap = computeLineTrailingGap(lineElement, leafElements);
    const nextLineGap = computeGapToNextLine(lineElement, lines[lineIndex + 1] ?? null);
    totalLength += lineVisibleLength + lineTrailingGap + nextLineGap;
  }

  return {
    segments,
    totalLength,
  };
}

function collectRenderedLineElements(containers: readonly HTMLElement[]): HTMLElement[] {
  const lines: HTMLElement[] = [];

  for (const container of containers) {
    lines.push(...Array.from(container.querySelectorAll<HTMLElement>('.superdoc-line[data-pm-start][data-pm-end]')));
  }

  return lines;
}

function computeLineTrailingGap(lineElement: HTMLElement, leafElements: readonly HTMLElement[]): number {
  const linePmEnd = getPmEnd(lineElement);
  const lastLeafElement = leafElements[leafElements.length - 1];
  const lastLeafPmEnd = lastLeafElement ? getPmEnd(lastLeafElement) : null;

  if (linePmEnd == null || lastLeafPmEnd == null) {
    return 0;
  }

  return Math.max(0, linePmEnd - lastLeafPmEnd);
}

function computeGapToNextLine(currentLine: HTMLElement, nextLine: HTMLElement | null): number {
  if (!nextLine) {
    return 0;
  }

  const currentLinePmEnd = getPmEnd(currentLine);
  const nextLinePmStart = getPmStart(nextLine);
  if (currentLinePmEnd == null || nextLinePmStart == null) {
    return 0;
  }

  return Math.max(0, nextLinePmStart - currentLinePmEnd);
}

function collectLeafPmElements(container: HTMLElement): HTMLElement[] {
  const pmElements: HTMLElement[] = [];
  if (container.matches('[data-pm-start][data-pm-end]')) {
    pmElements.push(container);
  }
  pmElements.push(...Array.from(container.querySelectorAll<HTMLElement>('[data-pm-start][data-pm-end]')));

  const pmElementSet = new WeakSet(pmElements);
  const nonLeaf = new WeakSet<HTMLElement>();

  for (const element of pmElements) {
    if (element.classList.contains(DOM_CLASS_NAMES.INLINE_SDT_WRAPPER)) {
      continue;
    }

    let parent = element.parentElement;
    while (parent) {
      if (pmElementSet.has(parent)) {
        nonLeaf.add(parent);
      }
      if (parent === container) {
        break;
      }
      parent = parent.parentElement;
    }
  }

  return pmElements.filter(
    (element) => !element.classList.contains(DOM_CLASS_NAMES.INLINE_SDT_WRAPPER) && !nonLeaf.has(element),
  );
}

function resolveTextPoint(
  model: VisibleTextModel,
  targetOffset: number,
  affinity: 'forward' | 'backward',
): ResolvedTextPoint | null {
  const { segments, totalLength } = model;
  if (!segments.length || !Number.isFinite(targetOffset)) {
    return null;
  }

  if (targetOffset < 0 || targetOffset > totalLength) {
    return null;
  }

  let previousSegment: VisibleTextSegment | null = null;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (targetOffset < segment.startOffset) {
      if (affinity === 'forward') {
        return {
          node: segment.node,
          offset: 0,
          pageElement: segment.pageElement,
          lineElement: segment.lineElement,
        };
      }

      if (previousSegment) {
        return {
          node: previousSegment.node,
          offset: previousSegment.node.textContent?.length ?? 0,
          pageElement: previousSegment.pageElement,
          lineElement: previousSegment.lineElement,
        };
      }

      return {
        node: segment.node,
        offset: 0,
        pageElement: segment.pageElement,
        lineElement: segment.lineElement,
      };
    }

    if (targetOffset >= segment.startOffset && targetOffset < segment.endOffset) {
      return {
        node: segment.node,
        offset: targetOffset - segment.startOffset,
        pageElement: segment.pageElement,
        lineElement: segment.lineElement,
      };
    }

    if (targetOffset !== segment.endOffset) {
      previousSegment = segment;
      continue;
    }

    if (affinity === 'forward' && index + 1 < segments.length) {
      previousSegment = segment;
      continue;
    }

    return {
      node: segment.node,
      offset: segment.node.textContent?.length ?? 0,
      pageElement: segment.pageElement,
      lineElement: segment.lineElement,
    };
  }

  const lastSegment = segments[segments.length - 1];
  if (!lastSegment) {
    return null;
  }

  return {
    node: lastSegment.node,
    offset: lastSegment.node.textContent?.length ?? 0,
    pageElement: lastSegment.pageElement,
    lineElement: lastSegment.lineElement,
  };
}

function getPmStart(element: HTMLElement): number | null {
  return parsePmValue(element.dataset.pmStart);
}

function getPmEnd(element: HTMLElement): number | null {
  return parsePmValue(element.dataset.pmEnd);
}

function parsePmValue(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function collectUniquePageElements(segments: readonly VisibleTextSegment[]): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const pages: HTMLElement[] = [];

  for (const segment of segments) {
    if (seen.has(segment.pageElement)) {
      continue;
    }
    seen.add(segment.pageElement);
    pages.push(segment.pageElement);
  }

  return pages;
}

function findPageElementForRect(rect: DOMRect, pageElements: readonly HTMLElement[]): HTMLElement | null {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  for (const pageElement of pageElements) {
    const pageRect = pageElement.getBoundingClientRect();
    if (
      centerX >= pageRect.left &&
      centerX <= pageRect.right &&
      centerY >= pageRect.top &&
      centerY <= pageRect.bottom
    ) {
      return pageElement;
    }
  }

  return null;
}
