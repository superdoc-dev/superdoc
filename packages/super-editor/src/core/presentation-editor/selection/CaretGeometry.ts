import {
  calculateTextStartIndent,
  computeLinePmRange,
  getFragmentAtPosition,
  getWordLayoutConfig,
  isListItem,
  measureCharacterX,
  pmPosToCharOffset,
  extractParagraphIndent,
} from '@superdoc/layout-bridge';
import type {
  FlowBlock,
  Layout,
  Line,
  Measure,
  ParaFragment,
  TableBlock,
  TableFragment,
  TableMeasure,
} from '@superdoc/contracts';
import { computeTableCaretLayoutRectFromDom } from '../tables/TableCaretDomGeometry.js';

/**
 * Represents the geometric layout information for a caret position.
 * @property pageIndex - The zero-based page index where the caret is located
 * @property x - The horizontal position in page-local coordinates (pixels)
 * @property y - The vertical position in page-local coordinates (pixels)
 * @property height - The height of the caret in pixels
 */
export type CaretLayoutRect = { pageIndex: number; x: number; y: number; height: number };

type FindLineResult = { line: Line; index: number };

/**
 * Finds the line containing a given ProseMirror position within a block's measured lines.
 *
 * @param block - The flow block to search within
 * @param measure - The measure containing line layout information
 * @param fromLine - The starting line index to search from (inclusive)
 * @param toLine - The ending line index to search to (exclusive)
 * @param pos - The ProseMirror position to locate
 * @returns The line and its index if found, or null if the position is not within the specified range
 */
function findLineContainingPos(
  block: FlowBlock,
  measure: Measure,
  fromLine: number,
  toLine: number,
  pos: number,
): FindLineResult | null {
  if (measure.kind !== 'paragraph' || block.kind !== 'paragraph') return null;
  for (let lineIndex = fromLine; lineIndex < toLine; lineIndex += 1) {
    const line = measure.lines[lineIndex];
    if (!line) continue;
    const range = computeLinePmRange(block, line);
    if (range.pmStart == null || range.pmEnd == null) continue;
    if (pos >= range.pmStart && pos <= range.pmEnd) {
      return { line, index: lineIndex };
    }
  }
  return null;
}

/**
 * Calculates the cumulative height of lines before a target line index.
 *
 * @param lines - Array of line measurements
 * @param fromLine - The starting line index
 * @param targetIndex - The target line index (exclusive)
 * @returns The total height in pixels of all lines from fromLine to targetIndex
 */
function lineHeightBeforeIndex(lines: Line[], fromLine: number, targetIndex: number): number {
  let offset = 0;
  for (let i = fromLine; i < targetIndex; i += 1) {
    offset += lines[i]?.lineHeight ?? 0;
  }
  return offset;
}

/**
 * Dependencies required for computing caret geometry.
 */
export type ComputeCaretLayoutRectGeometryDeps = {
  layout: Layout | null;
  blocks: FlowBlock[];
  measures: Measure[];
  painterHost: HTMLElement | null;
  viewportHost: HTMLElement;
  visibleHost: HTMLElement;
  zoom: number;
};

/**
 * Computes the visual geometry for a caret at a given ProseMirror position.
 *
 * This function calculates the precise pixel coordinates and dimensions for rendering
 * a caret cursor, accounting for:
 * - Multi-page layouts with stacked pages
 * - List items with markers and first-line indent modes
 * - Table cells (delegates to DOM-based fallback)
 * - Virtualized content where DOM elements may not be mounted
 * - Zoom levels and coordinate transformations
 *
 * @param deps - Dependencies including layout, blocks, measures, and DOM elements
 * @param pos - The ProseMirror position where the caret should be placed
 * @param includeDomFallback - Whether to use DOM measurements as a fallback when available (default: true)
 * @returns Caret layout information or null if the position cannot be resolved
 *
 * @remarks
 * The function uses layout-engine measurements for geometry calculation, but can
 * fall back to DOM-based measurements when `includeDomFallback` is true and the
 * relevant DOM elements are available. This helps correct sub-pixel rendering
 * discrepancies that may occur between layout calculations and actual browser rendering.
 *
 * For table cells, the function always delegates to `computeTableCaretLayoutRectFromDom`
 * as table caret positioning requires complex cell boundary detection.
 */
export function computeCaretLayoutRectGeometry(
  { layout, blocks, measures, painterHost, viewportHost, visibleHost, zoom }: ComputeCaretLayoutRectGeometryDeps,
  pos: number,
  includeDomFallback = true,
): CaretLayoutRect | null {
  if (!layout) return null;

  // Geometry-based calculation from layout engine
  let effectivePos = pos;
  let hit = getFragmentAtPosition(layout, blocks, measures, pos);
  if (!hit) {
    // Selection can land on run boundaries not represented in fragments; probe nearby positions.
    // Offsets +/-1 and +/-2 cover cases where the caret is at element boundaries (e.g., between
    // two inline nodes or at paragraph edges) where the exact position lacks a fragment.
    // We check immediate neighbors first (+/-1), then extend to +/-2 for edge cases like
    // adjacent empty nodes or complex nesting. This small radius is sufficient for typical
    // ProseMirror document structures while keeping the search bounded.
    const fallbackCandidates = [pos - 1, pos + 1, pos - 2, pos + 2].filter((candidate) => candidate >= 0);
    for (const candidate of fallbackCandidates) {
      const fallbackHit = getFragmentAtPosition(layout, blocks, measures, candidate);
      if (fallbackHit) {
        hit = fallbackHit;
        effectivePos = candidate;
        break;
      }
    }
    if (!hit) return null;
  }
  const block = hit.block;
  const measure = hit.measure;

  // Handle table fragments
  if (hit.fragment.kind === 'table' && block?.kind === 'table' && measure?.kind === 'table') {
    return computeTableCaretLayoutRectFromDom(
      { viewportHost, visibleHost, zoom },
      effectivePos,
      hit.fragment as TableFragment,
      block as TableBlock,
      measure as TableMeasure,
      hit.pageIndex,
    );
  }

  if (!block || block.kind !== 'paragraph' || measure?.kind !== 'paragraph') return null;
  if (hit.fragment.kind !== 'para') return null;
  const fragment: ParaFragment = hit.fragment;

  const lineInfo = findLineContainingPos(block, measure, fragment.fromLine, fragment.toLine, effectivePos);
  if (!lineInfo) return null;
  const { line, index } = lineInfo;
  const range = computeLinePmRange(block, line);
  if (range.pmStart == null || range.pmEnd == null) return null;

  // Calculate character offset from PM position using layout-aware mapping (accounts for PM gaps)
  const pmOffset = pmPosToCharOffset(block, line, effectivePos);

  const markerWidth = fragment.markerWidth ?? measure.marker?.markerWidth ?? 0;
  const markerTextWidth = fragment.markerTextWidth ?? measure.marker?.markerTextWidth ?? undefined;
  // Determine list item status and text indent
  const isFirstLine = index === fragment.fromLine;
  const isListItemFlag = isListItem(markerWidth, block);

  // Get word layout configuration for firstLineIndentMode detection
  const wordLayout = getWordLayoutConfig(block);

  const indent = extractParagraphIndent(block.attrs?.indent);
  // For standard lists and non-list paragraphs, calculate text indent using shared utility
  const indentAdjust = calculateTextStartIndent({
    isFirstLine,
    isListItem: isListItemFlag,
    markerWidth,
    markerTextWidth,
    paraIndentLeft: indent.left,
    firstLineIndent: indent.firstLine,
    hangingIndent: indent.hanging,
    wordLayout,
  });

  const availableWidth = Math.max(0, fragment.width - (indentAdjust + indent.right));
  const charX = measureCharacterX(block, line, pmOffset, availableWidth);
  const localX = fragment.x + indentAdjust + charX;
  const lineOffset = lineHeightBeforeIndex(measure.lines, fragment.fromLine, index);
  const localY = fragment.y + lineOffset;

  const result = {
    pageIndex: hit.pageIndex,
    x: localX,
    y: localY,
    height: line.lineHeight,
  };

  // DOM fallback for accurate caret positioning
  const pageEl = painterHost?.querySelector(`.superdoc-page[data-page-index="${hit.pageIndex}"]`) as HTMLElement | null;
  const pageRect = pageEl?.getBoundingClientRect();

  // Find span containing this pos and measure actual DOM position
  let domCaretX: number | null = null;
  let domCaretY: number | null = null;
  const spanEls = pageEl?.querySelectorAll('span[data-pm-start][data-pm-end]');
  for (const spanEl of Array.from(spanEls ?? [])) {
    const pmStart = Number((spanEl as HTMLElement).dataset.pmStart);
    const pmEnd = Number((spanEl as HTMLElement).dataset.pmEnd);
    if (effectivePos >= pmStart && effectivePos <= pmEnd && spanEl.firstChild?.nodeType === Node.TEXT_NODE) {
      const textNode = spanEl.firstChild as Text;
      const charIndex = Math.min(effectivePos - pmStart, textNode.length);
      const rangeObj = document.createRange();
      rangeObj.setStart(textNode, charIndex);
      rangeObj.setEnd(textNode, charIndex);
      if (typeof rangeObj.getBoundingClientRect !== 'function') {
        break;
      }
      const rangeRect = rangeObj.getBoundingClientRect();
      if (pageRect) {
        domCaretX = (rangeRect.left - pageRect.left) / zoom;
        domCaretY = (rangeRect.top - pageRect.top) / zoom;
      }
      break;
    }
  }

  // If we found a DOM caret position, prefer it to avoid residual drift
  if (includeDomFallback && domCaretX != null && domCaretY != null) {
    return {
      pageIndex: hit.pageIndex,
      x: domCaretX,
      y: domCaretY,
      height: line.lineHeight,
    };
  }

  return result;
}
