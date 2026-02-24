import type {
  CellBorders,
  DrawingBlock,
  DrawingMeasure,
  Fragment,
  ImageBlock,
  ImageMeasure,
  Line,
  ParagraphBlock,
  ParagraphIndent,
  ParagraphMeasure,
  PartialRowInfo,
  RenderedLineInfo,
  SdtMetadata,
  TableBlock,
  TableFragment,
  TableMeasure,
  WrapExclusion,
  WrapTextMode,
} from '@superdoc/contracts';
import { toCssFontFamily } from '@superdoc/font-utils';
import { rescaleColumnWidths } from '@superdoc/layout-engine';
import { normalizeZIndex } from '@superdoc/pm-adapter/utilities.js';
import type { BlockLookup, FragmentRenderContext } from '../renderer.js';
import { applyParagraphBorderStyles, applyParagraphShadingStyles } from '../renderer.js';
import { applySquareWrapExclusionsToLines } from '../utils/anchor-helpers';
import { applyImageClipPath } from '../utils/image-clip-path.js';
import {
  applySdtContainerStyling,
  getSdtContainerConfig,
  getSdtContainerKey,
  type SdtBoundaryOptions,
} from '../utils/sdt-helpers.js';
import { applyCellBorders } from './border-utils.js';
import { renderTableFragment as renderTableFragmentElement } from './renderTableFragment.js';

/**
 * Default gap between list marker and text content in pixels.
 * This is applied when a gutter width is not explicitly provided in the marker layout.
 * The 8px default matches Microsoft Word's standard list marker spacing.
 */
const LIST_MARKER_GAP = 8;

/**
 * Word layout information for paragraph list markers.
 * Contains positioning, styling, and rendering details for list markers (bullets/numbers).
 */
type WordLayoutMarker = {
  /** Text content of the marker (e.g., "1.", "a)", "•") */
  markerText?: string;
  /** Width of the marker box in pixels */
  markerBoxWidthPx?: number;
  /** Width of the gutter (space between marker and text) in pixels */
  gutterWidthPx?: number;
  /** Horizontal justification of marker within its box */
  justification?: 'left' | 'center' | 'right';
  /** Absolute x position of the marker start */
  markerX?: number;
  /** Run properties for marker styling */
  run: {
    /** Font family for the marker */
    fontFamily?: string;
    /** Font size in pixels */
    fontSize?: number;
    /** Whether marker is bold */
    bold?: boolean;
    /** Whether marker is italic */
    italic?: boolean;
    /** Text color as hex string */
    color?: string;
    /** Letter spacing in pixels */
    letterSpacing?: number;
    /** Hidden text flag */
    vanish?: boolean;
  };
};

/**
 * Word layout information for a paragraph.
 * Computed by the word-layout engine to provide accurate list marker positioning
 * and indent calculations matching Microsoft Word's behavior.
 */
type WordLayoutInfo = {
  /** Marker layout information if this is a list paragraph */
  marker?: WordLayoutMarker;
  /** Left indent in pixels */
  indentLeftPx?: number;
  /** Whether first-line indent mode is enabled */
  firstLineIndentMode?: boolean;
};

type TableRowMeasure = TableMeasure['rows'][number];
type TableCellMeasure = TableRowMeasure['cells'][number];

/**
 * Compute the total segment count for a cell's blocks, matching the layout engine's
 * recursive getCellLines() expansion. Paragraph blocks contribute their line count,
 * embedded tables contribute the sum of their rows' recursive segment counts,
 * and other blocks (images, drawings) contribute 1 segment.
 */
export function getCellSegmentCount(cell: TableCellMeasure): number {
  if (cell.blocks && cell.blocks.length > 0) {
    let total = 0;
    for (const block of cell.blocks) {
      if (block.kind === 'paragraph') {
        total += (block as ParagraphMeasure).lines?.length || 0;
      } else if (block.kind === 'table') {
        const tableMeasure = block as TableMeasure;
        for (const row of tableMeasure.rows) {
          total += getEmbeddedRowSegmentCount(row);
        }
      } else {
        const blockHeight = 'height' in block ? (block as { height: number }).height : 0;
        if (blockHeight > 0) total += 1;
      }
    }
    return total;
  }
  if (cell.paragraph) {
    return (cell.paragraph as ParagraphMeasure).lines?.length || 0;
  }
  return 0;
}

/**
 * Compute the segment count for a single embedded table row.
 * If any cell in the row contains nested tables, recursively expand using the
 * tallest cell's segment count. Otherwise, the row is 1 segment.
 * This mirrors the layout engine's getEmbeddedRowLines() logic.
 */
function getEmbeddedRowSegmentCount(row: TableRowMeasure): number {
  const hasNestedTable = row.cells.some((cell: TableCellMeasure) => cell.blocks?.some((b) => b.kind === 'table'));
  if (!hasNestedTable) return 1;

  let maxSegments = 0;
  for (const cell of row.cells) {
    maxSegments = Math.max(maxSegments, getCellSegmentCount(cell));
  }
  return maxSegments > 0 ? maxSegments : 1;
}

/**
 * Compute the total recursive segment count for an embedded table.
 */
function getEmbeddedTableSegmentCount(tableMeasure: TableMeasure): number {
  let total = 0;
  for (const row of tableMeasure.rows) {
    total += getEmbeddedRowSegmentCount(row);
  }
  return total;
}

/**
 * Compute the visible height for a range of table rows, using partial height
 * where a row is only partially rendered (mid-row split).
 */
function computeVisibleHeight(
  rows: TableMeasure['rows'],
  fromRow: number,
  toRow: number,
  partialRow?: PartialRowInfo,
): number {
  let height = 0;
  for (let r = fromRow; r < toRow; r++) {
    if (partialRow && partialRow.rowIndex === r) {
      height += partialRow.partialHeight;
    } else {
      height += rows[r]?.height || 0;
    }
  }
  return height;
}

/**
 * Compute the visible height of a single cell's content for a given segment range.
 * Handles paragraphs, embedded tables, and non-paragraph blocks (images, drawings).
 * Falls back to cell.paragraph for legacy single-paragraph cells.
 */
function computeCellVisibleHeight(cell: TableCellMeasure, cellFrom: number, cellTo: number): number {
  let cellVisHeight = 0;
  if (cell.blocks && cell.blocks.length > 0) {
    let segIdx = 0;
    for (const blk of cell.blocks) {
      if (blk.kind === 'paragraph') {
        const lines = (blk as ParagraphMeasure).lines || [];
        for (const line of lines) {
          if (segIdx >= cellFrom && segIdx < cellTo) {
            cellVisHeight += line.lineHeight || 0;
          }
          segIdx++;
        }
      } else if (blk.kind === 'table') {
        const nestedTable = blk as TableMeasure;
        for (const nestedRow of nestedTable.rows) {
          const nestedRowSegs = getEmbeddedRowSegmentCount(nestedRow);
          // TODO: use actual segment heights from getEmbeddedRowLines() instead of
          // even split for more precise height when rows have non-uniform line heights.
          for (let s = 0; s < nestedRowSegs; s++) {
            if (segIdx >= cellFrom && segIdx < cellTo) {
              cellVisHeight += (nestedRow.height || 0) / nestedRowSegs;
            }
            segIdx++;
          }
        }
      } else {
        const blkHeight = 'height' in blk ? (blk as { height: number }).height : 0;
        if (blkHeight > 0) {
          if (segIdx >= cellFrom && segIdx < cellTo) {
            cellVisHeight += blkHeight;
          }
          segIdx++;
        }
      }
    }
  } else if (cell.paragraph) {
    // Legacy single-paragraph fallback (matches getCellSegmentCount)
    const lines = (cell.paragraph as ParagraphMeasure).lines || [];
    for (let i = 0; i < lines.length; i++) {
      if (i >= cellFrom && i < cellTo) {
        cellVisHeight += lines[i].lineHeight || 0;
      }
    }
  }
  return cellVisHeight;
}

/**
 * Parameters for rendering a list marker element.
 */
type MarkerRenderParams = {
  /** Document object for creating DOM elements */
  doc: Document;
  /** Line element to which the marker will be attached */
  lineEl: HTMLElement;
  /** Marker layout information from word-layout engine */
  markerLayout: WordLayoutMarker;
  /** Marker measurement data from measurement stage */
  markerMeasure: ParagraphMeasure['marker'];
  /** Left indent in pixels */
  indentLeftPx: number;
};

/**
 * Parameters for applying paragraph indentation within a table cell line.
 */
type TableCellIndentParams = {
  /** Line element to apply indentation styles to */
  lineEl: HTMLElement;
  /** Line measurement data */
  line: Line;
  /** Paragraph indentation values */
  indent?: ParagraphIndent;
  /** List text indent in pixels (when list marker layout is present) */
  indentLeftPx: number;
  /** Whether this paragraph has list marker layout */
  hasListMarkerLayout: boolean;
  /** Zero-based index of the line within the paragraph */
  lineIndex: number;
  /** Local start line for partial rendering */
  localStartLine: number;
  /** Whether first-line indent should be suppressed */
  suppressFirstLineIndent: boolean;
};

/**
 * Renders a list marker (bullet or number) for a paragraph line.
 *
 * This function creates a positioned marker element and wraps the line in a container
 * to support absolute positioning of the marker relative to the text.
 *
 * **Marker Positioning Logic:**
 * - `markerStartPos`: The x-coordinate where text content begins (after the marker + gutter)
 * - `markerLeftPos`: The x-coordinate where the marker box starts (markerStartPos - markerBoxWidth)
 * - The marker is absolutely positioned within the line container
 * - Text gets left padding equal to markerStartPos to align with the marker end
 *
 * **Justification Handling:**
 * - `left`: Marker box starts at indentLeftPx, text follows after box + gutter
 * - `right`: Uses markerX from layout engine, marker right-aligns within its box
 * - `center`: Uses markerX from layout engine, marker center-aligns within its box
 *
 * @param params - Marker rendering parameters
 * @returns Container element with marker and line as children
 */
function renderListMarker(params: MarkerRenderParams): HTMLElement {
  const { doc, lineEl, markerLayout, markerMeasure, indentLeftPx } = params;

  const markerJustification = markerLayout?.justification ?? 'left';

  // Extract marker box width with fallback chain: layout -> measure -> 0
  const markerBoxWidth =
    (typeof markerLayout?.markerBoxWidthPx === 'number' ? markerLayout.markerBoxWidthPx : undefined) ??
    markerMeasure?.markerWidth ??
    0;

  // Extract gutter width with fallback chain: layout -> measure -> default gap
  const gutter =
    (typeof markerLayout?.gutterWidthPx === 'number' ? markerLayout.gutterWidthPx : undefined) ??
    markerMeasure?.gutterWidth ??
    LIST_MARKER_GAP;

  // Calculate marker start position based on justification
  const markerStartPos =
    markerJustification === 'left'
      ? indentLeftPx
      : ((typeof markerLayout?.markerX === 'number' ? markerLayout.markerX : undefined) ?? indentLeftPx);

  // Marker left position is marker start minus the width of the marker box
  const markerLeftPos = markerStartPos - markerBoxWidth;

  // Create container to hold both marker and line
  const lineContainer = doc.createElement('div');
  lineContainer.style.position = 'relative';
  lineContainer.style.width = '100%';

  // Create marker element with styling from layout engine
  const markerEl = doc.createElement('span');
  markerEl.classList.add('superdoc-paragraph-marker');
  markerEl.textContent = markerLayout?.markerText ?? '';
  markerEl.style.display = 'inline-block';
  markerEl.style.fontFamily = toCssFontFamily(markerLayout?.run?.fontFamily) ?? markerLayout?.run?.fontFamily ?? '';
  if (markerLayout?.run?.fontSize != null) {
    markerEl.style.fontSize = `${markerLayout.run.fontSize}px`;
  }
  markerEl.style.fontWeight = markerLayout?.run?.bold ? 'bold' : '';
  markerEl.style.fontStyle = markerLayout?.run?.italic ? 'italic' : '';
  if (markerLayout?.run?.color) {
    markerEl.style.color = markerLayout.run.color;
  }
  if (markerLayout?.run?.letterSpacing != null) {
    markerEl.style.letterSpacing = `${markerLayout.run.letterSpacing}px`;
  }

  // Position marker absolutely within the container
  markerEl.style.position = 'absolute';
  markerEl.style.left = `${markerLeftPos}px`;
  markerEl.style.width = `${markerBoxWidth}px`;
  markerEl.style.textAlign = markerJustification;
  markerEl.style.paddingRight = `${gutter}px`;

  // Align text start to the marker start position (gutter spacing comes from marker padding)
  lineEl.style.paddingLeft = `${markerStartPos}px`;

  lineContainer.appendChild(markerEl);
  lineContainer.appendChild(lineEl);

  return lineContainer;
}

/**
 * Applies paragraph indentation to a rendered line inside a table cell.
 *
 * **SD-1472 Fix:** When segments have explicit x positions (from tab stops), the content
 * is already absolutely positioned. Applying padding/textIndent would double-shift the text,
 * causing the first character to be lost. This function detects explicit positioning via
 * `segment.x !== undefined` and adjusts the indent strategy accordingly.
 *
 * **Mathematical Model (SD-1295):**
 * The hanging indent effect is achieved through a combination of paddingLeft and textIndent:
 * - `firstLineOffset = firstLine - hanging`
 * - This offset can be positive (indent first line further right) or negative (outdent to left)
 *
 * **CSS Application Pattern:**
 * - **First line (no explicit positioning):**
 *   - `paddingLeft = left` (base left indent)
 *   - `textIndent = firstLineOffset` (additional first-line adjustment)
 *   - Combined effect: text starts at `left + firstLineOffset` pixels from cell edge
 *
 * - **First line (with explicit positioning):**
 *   - `paddingLeft = max(0, left) + firstLineOffset` (only if positive)
 *   - `textIndent = 0` (reset to prevent double-shift)
 *
 * - **Body lines (continuation lines):**
 *   - `paddingLeft = hanging` (when hanging > 0 and no explicit positioning)
 *   - Creates the "hanging" visual effect where body lines are indented further right
 *
 * **Edge Cases:**
 * - Negative hanging: Ignored for body lines (no effect, body uses left indent only)
 * - Negative left indent: Clamped to 0 (browsers don't support negative padding)
 * - suppressFirstLineIndent: When true, firstLineOffset is forced to 0
 * - Explicit segment positioning: Skips padding to avoid double-application
 *
 * @param params - Configuration for indent application within a table cell line.
 */
function applyTableCellLineIndentation(params: TableCellIndentParams): void {
  const {
    lineEl,
    line,
    indent,
    indentLeftPx,
    hasListMarkerLayout,
    lineIndex,
    localStartLine,
    suppressFirstLineIndent,
  } = params;
  const paraIndentLeft = indent?.left ?? 0;
  const paraIndentRight = indent?.right ?? 0;
  const firstLineOffset = suppressFirstLineIndent ? 0 : (indent?.firstLine ?? 0) - (indent?.hanging ?? 0);
  const isFirstLine = lineIndex === 0 && localStartLine === 0;
  const hasExplicitSegmentPositioning = line.segments?.some((seg) => seg.x !== undefined) ?? false;

  if (hasListMarkerLayout && indentLeftPx) {
    // List continuation lines should use the list text indent unless tabs handle explicit positioning.
    if (!hasExplicitSegmentPositioning) {
      lineEl.style.paddingLeft = `${indentLeftPx}px`;
    }
  } else {
    // Preserve non-list paragraph indentation that was cleared above.
    if (hasExplicitSegmentPositioning) {
      if (isFirstLine && firstLineOffset !== 0) {
        const effectiveLeftIndent = paraIndentLeft < 0 ? 0 : paraIndentLeft;
        const adjustedPadding = effectiveLeftIndent + firstLineOffset;
        if (adjustedPadding > 0) {
          lineEl.style.paddingLeft = `${adjustedPadding}px`;
        }
      }
    } else if (paraIndentLeft && paraIndentLeft > 0) {
      lineEl.style.paddingLeft = `${paraIndentLeft}px`;
    } else if (
      !isFirstLine &&
      indent?.hanging &&
      indent.hanging > 0 &&
      (paraIndentLeft == null || paraIndentLeft >= 0)
    ) {
      lineEl.style.paddingLeft = `${indent.hanging}px`;
    }
  }

  if (paraIndentRight && paraIndentRight > 0) {
    lineEl.style.paddingRight = `${paraIndentRight}px`;
  }
  if (isFirstLine && firstLineOffset && !hasExplicitSegmentPositioning) {
    lineEl.style.textIndent = `${firstLineOffset}px`;
  } else if (firstLineOffset && hasExplicitSegmentPositioning) {
    // Reset textIndent when segments have explicit positioning to prevent double-shift
    lineEl.style.textIndent = '0px';
  }
}

/**
 * Applies inline CSS styles to an element, filtering out null/undefined/empty values.
 *
 * Only applies styles where the key exists in the element's style object and
 * the value is non-null and non-empty. This prevents accidentally clearing
 * existing styles with undefined values.
 *
 * @param el - The HTML element to apply styles to
 * @param styles - Partial CSSStyleDeclaration with styles to apply
 */
const applyInlineStyles = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void => {
  Object.entries(styles).forEach(([key, value]) => {
    if (value != null && value !== '' && key in el.style) {
      (el.style as unknown as Record<string, string>)[key] = String(value);
    }
  });
};

/**
 * Parameters for rendering a nested table inside a table cell.
 *
 * When a table cell contains another table (nested/embedded table), we render it
 * using the same table rendering infrastructure but with a synthetic TableFragment
 * positioned at (0,0) within the cell content area.
 */
type EmbeddedTableRenderParams = {
  /** Document object for creating DOM elements */
  doc: Document;
  /** The nested table block to render */
  table: TableBlock;
  /** Measurement data for the nested table */
  measure: TableMeasure;
  /** Available width for the embedded table (render-scale cell content area) */
  availableWidth: number;
  /** Rendering context (section, page, column info) */
  context: FragmentRenderContext;
  /** Function to render a line of paragraph content */
  renderLine: (
    block: ParagraphBlock,
    line: Line,
    context: FragmentRenderContext,
    lineIndex: number,
    isLastLine: boolean,
  ) => HTMLElement;
  /** Optional callback invoked after a table line's final styles/markers are applied. */
  captureLineSnapshot?: (
    lineEl: HTMLElement,
    context: FragmentRenderContext,
    options?: { inTableParagraph?: boolean; wrapperEl?: HTMLElement },
  ) => void;
  /** Optional callback to render drawing content (shapes, etc.) */
  renderDrawingContent?: (block: DrawingBlock) => HTMLElement;
  /** Function to apply SDT metadata as data attributes */
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  /** Starting row index for partial rendering (inclusive, default 0) */
  fromRow?: number;
  /** Ending row index for partial rendering (exclusive, default all rows) */
  toRow?: number;
  /** Partial row info for mid-row splits within the embedded table */
  partialRow?: PartialRowInfo;
};

/**
 * Version identifier for embedded table block lookups.
 * Used to distinguish nested tables from top-level tables in the block lookup map.
 */
const EMBEDDED_TABLE_VERSION = 'embedded-table';

/**
 * Renders a nested table that appears inside a table cell.
 *
 * This function creates a synthetic TableFragment positioned at (0,0) within the cell
 * and delegates to the standard table fragment renderer. The embedded table reuses the
 * same rendering infrastructure as top-level tables but with its own isolated block lookup.
 *
 * @param params - Parameters including the table block, measure, and rendering callbacks
 * @returns The rendered table element ready to be appended to the cell content
 *
 * @example
 * ```typescript
 * const tableEl = renderEmbeddedTable({
 *   doc,
 *   table: nestedTableBlock,
 *   measure: nestedTableMeasure,
 *   context,
 *   renderLine,
 *   applySdtDataset,
 * });
 * cellContent.appendChild(tableEl);
 * ```
 */
const renderEmbeddedTable = (params: EmbeddedTableRenderParams): HTMLElement => {
  const {
    doc,
    table,
    measure,
    availableWidth,
    context,
    renderLine,
    captureLineSnapshot,
    renderDrawingContent,
    applySdtDataset,
    fromRow: paramFromRow,
    toRow: paramToRow,
    partialRow: paramPartialRow,
  } = params;

  const effectiveFromRow = paramFromRow ?? 0;
  const effectiveToRow = paramToRow ?? table.rows.length;

  const visibleHeight = computeVisibleHeight(measure.rows, effectiveFromRow, effectiveToRow, paramPartialRow);

  // Rescale column widths when measurement-scale exceeds render-scale (SD-1962).
  // Top-level tables get rescaled by layout-engine's rescaleColumnWidths(), but
  // embedded tables bypass that path. We reuse the same function here.
  const columnWidths = rescaleColumnWidths(measure.columnWidths, measure.totalWidth, availableWidth);
  const fragmentWidth = columnWidths ? availableWidth : measure.totalWidth;

  const fragment: TableFragment = {
    kind: 'table',
    blockId: table.id,
    fromRow: effectiveFromRow,
    toRow: effectiveToRow,
    x: 0,
    y: 0,
    width: fragmentWidth,
    height: visibleHeight,
    columnWidths,
    partialRow: paramPartialRow,
  };
  const blockLookup: BlockLookup = new Map([
    [
      table.id,
      {
        block: table,
        measure,
        version: EMBEDDED_TABLE_VERSION,
      },
    ],
  ]);
  const applyFragmentFrame = (el: HTMLElement, frag: Fragment): void => {
    el.style.left = `${frag.x}px`;
    el.style.top = `${frag.y}px`;
    el.style.width = `${frag.width}px`;
    el.dataset.blockId = frag.blockId;
  };

  return renderTableFragmentElement({
    doc,
    fragment,
    context,
    blockLookup,
    renderLine,
    captureLineSnapshot,
    renderDrawingContent,
    applyFragmentFrame,
    applySdtDataset,
    applyStyles: applyInlineStyles,
  });
};

/**
 * Render an embedded table block within a cell, handling segment-based pagination.
 *
 * Maps the cell's global segment range into the embedded table's local row range,
 * computes partial row info when a page break falls mid-row, and delegates to
 * renderEmbeddedTable for actual DOM creation.
 */
function renderPartialEmbeddedTable(params: {
  doc: Document;
  block: TableBlock;
  blockMeasure: TableMeasure;
  cumulativeLineCount: number;
  globalFromLine: number;
  globalToLine: number;
  contentWidthPx: number;
  context: FragmentRenderContext;
  renderLine: EmbeddedTableRenderParams['renderLine'];
  captureLineSnapshot?: EmbeddedTableRenderParams['captureLineSnapshot'];
  renderDrawingContent?: EmbeddedTableRenderParams['renderDrawingContent'];
  applySdtDataset: EmbeddedTableRenderParams['applySdtDataset'];
}): { element: HTMLElement | null; height: number; nextCumulativeLineCount: number } {
  const {
    doc,
    block,
    blockMeasure: tableMeasure,
    cumulativeLineCount,
    globalFromLine,
    globalToLine,
    contentWidthPx,
    context,
    renderLine,
    captureLineSnapshot,
    renderDrawingContent,
    applySdtDataset,
  } = params;

  // Compute per-row segment counts (recursive, matching getCellLines/getEmbeddedRowLines).
  const rowSegmentCounts = tableMeasure.rows.map((row: TableRowMeasure) => getEmbeddedRowSegmentCount(row));
  const totalTableSegments = rowSegmentCounts.reduce((s: number, c: number) => s + c, 0);

  const tableStartSegment = cumulativeLineCount;
  const nextCumulativeLineCount = cumulativeLineCount + totalTableSegments;
  const tableEndSegment = nextCumulativeLineCount;

  // Skip entirely if no segments are in the visible range
  if (tableEndSegment <= globalFromLine || tableStartSegment >= globalToLine) {
    return { element: null, height: 0, nextCumulativeLineCount };
  }

  // Map global line range to local segment range within this embedded table
  const localFrom = Math.max(0, globalFromLine - tableStartSegment);
  const localTo = Math.min(totalTableSegments, globalToLine - tableStartSegment);

  // Determine which rows to render and whether any need partial rendering
  let segmentOffset = 0;
  let embeddedFromRow = -1;
  let embeddedToRow = -1;
  // TODO: partialRowInfo is overwritten each iteration — if the visible segment range
  // cuts through two different multi-segment rows, only the last one's info survives.
  // TableFragment only supports a single partialRow, so fixing this requires a design change.
  let partialRowInfo: PartialRowInfo | undefined;

  for (let r = 0; r < tableMeasure.rows.length; r++) {
    const rowSegs = rowSegmentCounts[r];
    const rowStart = segmentOffset;
    const rowEnd = segmentOffset + rowSegs;
    segmentOffset = rowEnd;

    // Skip rows completely outside the range
    if (rowEnd <= localFrom || rowStart >= localTo) continue;

    if (embeddedFromRow === -1) embeddedFromRow = r;
    embeddedToRow = r + 1;

    // Check if this row needs partial rendering (multi-segment row spanning the boundary)
    if (rowSegs > 1 && (rowStart < localFrom || rowEnd > localTo)) {
      const rowLocalFrom = Math.max(0, localFrom - rowStart);
      const rowLocalTo = Math.min(rowSegs, localTo - rowStart);
      const row = tableMeasure.rows[r];

      const fromLineByCell: number[] = [];
      const toLineByCell: number[] = [];
      let partialHeight = 0;

      for (const cell of row.cells) {
        const cellTotal = getCellSegmentCount(cell);
        const cellFrom = Math.min(rowLocalFrom, cellTotal);
        const cellTo = Math.min(rowLocalTo, cellTotal);
        fromLineByCell.push(cellFrom);
        toLineByCell.push(cellTo);
        partialHeight = Math.max(partialHeight, computeCellVisibleHeight(cell, cellFrom, cellTo));
      }

      partialRowInfo = {
        rowIndex: r,
        fromLineByCell,
        toLineByCell,
        isFirstPart: rowLocalFrom === 0,
        isLastPart: rowLocalTo >= rowSegs,
        partialHeight,
      };
    }
  }

  if (embeddedFromRow === -1) {
    return { element: null, height: 0, nextCumulativeLineCount };
  }

  const visibleHeight = computeVisibleHeight(tableMeasure.rows, embeddedFromRow, embeddedToRow, partialRowInfo);

  const tableWrapper = doc.createElement('div');
  tableWrapper.style.position = 'relative';
  tableWrapper.style.width = '100%';
  tableWrapper.style.height = `${visibleHeight}px`;
  tableWrapper.style.flexShrink = '0';
  tableWrapper.style.boxSizing = 'border-box';

  const tableEl = renderEmbeddedTable({
    doc,
    table: block,
    measure: tableMeasure,
    availableWidth: contentWidthPx,
    context: { ...context, section: 'body' },
    renderLine,
    captureLineSnapshot,
    renderDrawingContent,
    applySdtDataset,
    fromRow: embeddedFromRow,
    toRow: embeddedToRow,
    partialRow: partialRowInfo,
  });
  tableWrapper.appendChild(tableEl);

  return { element: tableWrapper, height: visibleHeight, nextCumulativeLineCount };
}

/**
 * Apply paragraph-level visual styling such as borders and shading.
 * Borders are set per side with sensible defaults and clamping.
 */
function applyParagraphBordersAndShading(paraWrapper: HTMLElement, block: ParagraphBlock): void {
  const borders = block.attrs?.borders;

  if (borders) {
    paraWrapper.style.boxSizing = 'border-box';

    const sideStyles: Record<'top' | 'bottom' | 'left' | 'right', { width: string; style: string; color: string }> = {
      top: { width: 'border-top-width', style: 'border-top-style', color: 'border-top-color' },
      bottom: { width: 'border-bottom-width', style: 'border-bottom-style', color: 'border-bottom-color' },
      left: { width: 'border-left-width', style: 'border-left-style', color: 'border-left-color' },
      right: { width: 'border-right-width', style: 'border-right-style', color: 'border-right-color' },
    };

    (['top', 'bottom', 'left', 'right'] as const).forEach((side) => {
      const border = borders[side];
      if (!border) return;

      const styleValue = border.style ?? 'solid';
      let widthValue = typeof border.width === 'number' ? Math.max(0, border.width) : 1; // default width when undefined

      // Border style none should render as zero width
      if (styleValue === 'none') {
        widthValue = 0;
      }

      const cssKeys = sideStyles[side];
      paraWrapper.style.setProperty(cssKeys.style, styleValue);
      paraWrapper.style.setProperty(cssKeys.width, `${widthValue}px`);
      if (border.color) {
        paraWrapper.style.setProperty(cssKeys.color, border.color);
      }
    });
  }

  const shadingFill = block.attrs?.shading?.fill;
  if (shadingFill) {
    paraWrapper.style.backgroundColor = shadingFill;
  }
}

/**
 * Dependencies required for rendering a table cell.
 *
 * Contains positioning, sizing, content, and rendering functions needed to
 * create a table cell DOM element with its content.
 */
type TableCellRenderDependencies = {
  /** Document object for creating DOM elements */
  doc: Document;
  /** Horizontal position (left edge) in pixels */
  x: number;
  /** Vertical position (top edge) in pixels */
  y: number;
  /** Height of the row containing this cell */
  rowHeight: number;
  /** Measurement data for this cell (width, paragraph layout) */
  cellMeasure: TableRowMeasure['cells'][number];
  /** Cell data (content, attributes), or undefined for empty cells */
  cell?: TableBlock['rows'][number]['cells'][number];
  /** Resolved borders for this cell */
  borders?: CellBorders;
  /** Whether to apply default border if no borders specified */
  useDefaultBorder?: boolean;
  /** Function to render a line of paragraph content */
  renderLine: (
    block: ParagraphBlock,
    line: Line,
    context: FragmentRenderContext,
    lineIndex: number,
    isLastLine: boolean,
  ) => HTMLElement;
  /** Optional callback invoked after a table line's final styles/markers are applied. */
  captureLineSnapshot?: (
    lineEl: HTMLElement,
    context: FragmentRenderContext,
    options?: { inTableParagraph?: boolean; wrapperEl?: HTMLElement },
  ) => void;
  /**
   * Optional callback function to render drawing content (vectorShapes, shapeGroups).
   * If provided, this callback is used to render DrawingBlocks with drawingKind of 'vectorShape' or 'shapeGroup'.
   * The callback receives a DrawingBlock and must return an HTMLElement.
   * The returned element will have width: 100% and height: 100% styles applied automatically.
   * If undefined, a placeholder element with diagonal stripes pattern is rendered instead.
   */
  renderDrawingContent?: (block: DrawingBlock) => HTMLElement;
  /** Rendering context */
  context: FragmentRenderContext;
  /** Function to apply SDT metadata as data attributes */
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  /** Table-level SDT metadata for suppressing duplicate container styling in cells */
  tableSdt?: SdtMetadata | null;
  /** Table indent in pixels (applied to table fragment positioning) */
  tableIndent?: number;
  /** Computed cell width from rescaled columnWidths (overrides cellMeasure.width when present) */
  cellWidth?: number;
  /** Starting line index for partial row rendering (inclusive) */
  fromLine?: number;
  /** Ending line index for partial row rendering (exclusive), -1 means render to end */
  toLine?: number;
};

/**
 * Result of rendering a table cell.
 */
export type TableCellRenderResult = {
  /** The cell container element (with borders, background, sizing, and content as child) */
  cellElement: HTMLElement;
};

/**
 * Renders a table cell as a DOM element.
 *
 * Creates a single cell element with content as a child:
 * - cellElement: Absolutely-positioned container with borders, background, sizing, padding,
 *   and content rendered inside. Cell uses overflow:hidden to clip any overflow.
 *
 * Handles:
 * - Cell borders (explicit or default)
 * - Background colors
 * - Vertical alignment (top, center, bottom)
 * - Cell padding (applied directly to cell element)
 * - Empty cells
 *
 * **Multi-Block Cell Rendering:**
 * - Iterates through all blocks in the cell (cell.blocks or cell.paragraph)
 * - Each block is rendered sequentially and stacked vertically
 * - Only paragraph blocks are currently rendered (other block types are ignored)
 *
 * **Backward Compatibility:**
 * - Supports legacy cell.paragraph field (single paragraph)
 * - Falls back to empty array if neither cell.blocks nor cell.paragraph is present
 * - Handles mismatches between blockMeasures and cellBlocks arrays using bounds checking
 *
 * **Empty Cell Handling:**
 * - Cells with no blocks render only the cell container (no content inside)
 * - Empty blocks arrays are safe (no content rendered)
 *
 * @param deps - All dependencies required for rendering
 * @returns Object containing cellElement (content is rendered inside as child)
 *
 * @example
 * ```typescript
 * const { cellElement } = renderTableCell({
 *   doc: document,
 *   x: 100,
 *   y: 50,
 *   rowHeight: 30,
 *   cellMeasure,
 *   cell,
 *   borders,
 *   useDefaultBorder: false,
 *   renderLine,
 *   renderDrawingContent: (block) => {
 *     // Custom drawing renderer for vectorShapes and shapeGroups
 *     const el = document.createElement('div');
 *     // Render drawing content...
 *     return el;
 *   },
 *   context,
 *   applySdtDataset
 * });
 * container.appendChild(cellElement);
 * ```
 */
export const renderTableCell = (deps: TableCellRenderDependencies): TableCellRenderResult => {
  const {
    doc,
    x,
    y,
    rowHeight,
    cellMeasure,
    cell,
    borders,
    useDefaultBorder,
    renderLine,
    captureLineSnapshot,
    renderDrawingContent,
    context,
    applySdtDataset,
    tableSdt,
    tableIndent,
    cellWidth,
    fromLine,
    toLine,
  } = deps;

  const attrs = cell?.attrs;
  const padding = attrs?.padding || { top: 0, left: 4, right: 4, bottom: 0 };
  const paddingLeft = padding.left ?? 4;
  const paddingTop = padding.top ?? 0;
  const paddingRight = padding.right ?? 4;
  const paddingBottom = padding.bottom ?? 0;

  const cellEl = doc.createElement('div');
  cellEl.style.position = 'absolute';
  cellEl.style.left = `${x}px`;
  cellEl.style.top = `${y}px`;
  cellEl.style.width = `${cellWidth ?? cellMeasure.width}px`;
  cellEl.style.height = `${rowHeight}px`;
  cellEl.style.boxSizing = 'border-box';
  // Cell clips all overflow - no scrollbars, content just gets clipped at boundaries
  cellEl.style.overflow = 'hidden';
  // Apply padding directly to cell so content is positioned correctly
  cellEl.style.paddingLeft = `${paddingLeft}px`;
  cellEl.style.paddingTop = `${paddingTop}px`;
  cellEl.style.paddingRight = `${paddingRight}px`;
  cellEl.style.paddingBottom = `${paddingBottom}px`;

  if (borders) {
    applyCellBorders(cellEl, borders);
  } else if (useDefaultBorder) {
    cellEl.style.border = '1px solid rgba(0,0,0,0.6)';
  }

  if (cell?.attrs?.background) {
    cellEl.style.backgroundColor = cell.attrs.background;
  }

  // Support multi-block cells with backward compatibility
  const cellBlocks = cell?.blocks ?? (cell?.paragraph ? [cell.paragraph] : []);
  const blockMeasures = cellMeasure?.blocks ?? (cellMeasure?.paragraph ? [cellMeasure.paragraph] : []);
  const sdtContainerKeys = cellBlocks.map((block) => {
    if (block.kind !== 'paragraph') {
      return null;
    }
    const attrs = (block as { attrs?: { sdt?: SdtMetadata; containerSdt?: SdtMetadata } }).attrs;
    return getSdtContainerKey(attrs?.sdt, attrs?.containerSdt);
  });

  const sdtBoundaries = sdtContainerKeys.map((key, index): SdtBoundaryOptions | undefined => {
    if (!key) return undefined;
    const prev = index > 0 ? sdtContainerKeys[index - 1] : null;
    const next = index < sdtContainerKeys.length - 1 ? sdtContainerKeys[index + 1] : null;
    return { isStart: key !== prev, isEnd: key !== next };
  });
  /**
   * Determines if SDT container styling should be applied to a block.
   *
   * We skip styling when the block's SDT matches the table's SDT to prevent
   * duplicate visual containers - the table already has the SDT container styling,
   * so individual paragraphs inside it shouldn't also show container borders.
   *
   * @param sdt - The block's direct SDT metadata
   * @param containerSdt - The block's inherited container SDT metadata
   * @returns True if container styling should be applied
   */
  const tableSdtKey = tableSdt ? getSdtContainerKey(tableSdt, null) : null;
  const shouldApplySdtContainerStyling = (
    sdt?: SdtMetadata | null,
    containerSdt?: SdtMetadata | null,
    blockKey?: string | null,
  ): boolean => {
    const resolvedKey = blockKey ?? getSdtContainerKey(sdt, containerSdt);
    // Skip if this SDT is the same as the table's SDT (already styled at table level)
    if (tableSdtKey && resolvedKey && tableSdtKey === resolvedKey) {
      return false;
    }
    if (tableSdt && (sdt === tableSdt || containerSdt === tableSdt)) {
      return false;
    }
    return Boolean(getSdtContainerConfig(sdt) || getSdtContainerConfig(containerSdt));
  };

  // Check if any block in the cell has SDT container styling
  const hasSdtContainer = cellBlocks.some((block, index) => {
    const attrs = (block as { attrs?: { sdt?: SdtMetadata; containerSdt?: SdtMetadata } }).attrs;
    const blockKey = sdtContainerKeys[index] ?? null;
    return shouldApplySdtContainerStyling(attrs?.sdt, attrs?.containerSdt, blockKey);
  });

  // SDT containers display labels that extend above the content boundary.
  // Change overflow to 'visible' so these labels aren't clipped by the cell.
  if (hasSdtContainer) {
    cellEl.style.overflow = 'visible';
  }
  if (cellBlocks.length > 0 && blockMeasures.length > 0) {
    // Content is a child of the cell, positioned relative to it
    // Cell's overflow:hidden handles clipping, no explicit width needed
    const content = doc.createElement('div');
    content.style.position = 'relative';
    content.style.width = '100%';
    content.style.height = '100%';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';

    if (cell?.attrs?.verticalAlign === 'center') {
      content.style.justifyContent = 'center';
    } else if (cell?.attrs?.verticalAlign === 'bottom') {
      content.style.justifyContent = 'flex-end';
    } else {
      content.style.justifyContent = 'flex-start';
    }

    // Append content to cell (content is now a child, not a sibling)
    cellEl.appendChild(content);

    // Establish a local stacking context so anchored objects can reliably layer above/below text.
    // (Needed for negative z-index behindDoc behavior.)
    content.style.zIndex = '0';

    // Calculate total segments across all blocks for proper global index mapping.
    // Embedded tables expand recursively (matching the layout engine's getCellLines()
    // which uses getEmbeddedRowLines() for recursive nested table expansion).
    // Non-paragraph blocks (images, drawings) occupy 1 segment each when height > 0,
    // including anchored blocks (matching getCellLines() in layout-table.ts).
    const blockLineCounts: number[] = [];
    for (let i = 0; i < Math.min(blockMeasures.length, cellBlocks.length); i++) {
      const bm = blockMeasures[i];
      const blk = cellBlocks[i];
      if (bm.kind === 'paragraph') {
        blockLineCounts.push((bm as ParagraphMeasure).lines?.length || 0);
      } else if (bm.kind === 'table') {
        // Embedded tables: recursively count segments (matches getCellLines expansion)
        blockLineCounts.push(getEmbeddedTableSegmentCount(bm as TableMeasure));
      } else {
        // Non-paragraph/non-table blocks (images, drawings) occupy 1 segment when
        // their height > 0, matching getCellLines() in layout-table.ts which only
        // counts non-paragraph blocks with positive height.
        const blockHeight = 'height' in bm ? (bm as { height: number }).height : 0;
        blockLineCounts.push(blockHeight > 0 ? 1 : 0);
      }
    }
    const totalLines = blockLineCounts.reduce((a, b) => a + b, 0);

    // Determine global line range to render
    const globalFromLine = fromLine ?? 0;
    const globalToLine = toLine === -1 || toLine === undefined ? totalLines : toLine;

    const effectiveCellWidth = cellWidth ?? cellMeasure.width;
    const contentWidthPx = Math.max(0, effectiveCellWidth - paddingLeft - paddingRight);
    const contentHeightPx = Math.max(0, rowHeight - paddingTop - paddingBottom);
    const paragraphTopById = new Map<string, number>();
    let flowCursorY = 0;
    const anchoredBlocks: Array<{ block: ImageBlock | DrawingBlock; measure: ImageMeasure | DrawingMeasure }> = [];
    const renderedLines: RenderedLineInfo[] = [];

    let cumulativeLineCount = 0; // Track cumulative line count across blocks
    for (let i = 0; i < Math.min(blockMeasures.length, cellBlocks.length); i++) {
      const blockMeasure = blockMeasures[i];
      const block = cellBlocks[i];

      if (blockMeasure.kind === 'table' && block?.kind === 'table') {
        const result = renderPartialEmbeddedTable({
          doc,
          block: block as TableBlock,
          blockMeasure: blockMeasure as TableMeasure,
          cumulativeLineCount,
          globalFromLine,
          globalToLine,
          contentWidthPx,
          context,
          renderLine,
          captureLineSnapshot,
          renderDrawingContent,
          applySdtDataset,
        });
        cumulativeLineCount = result.nextCumulativeLineCount;
        if (result.element) {
          content.appendChild(result.element);
          flowCursorY += result.height;
        }
        continue;
      }

      if (blockMeasure.kind === 'image' && block?.kind === 'image') {
        if (block.anchor?.isAnchored) {
          anchoredBlocks.push({ block, measure: blockMeasure as ImageMeasure });
          // Advance cumulative count only when height > 0 to stay aligned with
          // getCellLines() which only counts non-paragraph blocks with positive height.
          if (blockMeasure.height > 0) {
            cumulativeLineCount += 1;
          }
          continue;
        }

        // Non-paragraph blocks occupy 1 segment in the combined line/segment index.
        const imgSegmentIndex = cumulativeLineCount;
        cumulativeLineCount += 1;

        if (imgSegmentIndex < globalFromLine || imgSegmentIndex >= globalToLine) {
          continue;
        }

        const imageWrapper = doc.createElement('div');
        imageWrapper.style.position = 'relative';
        imageWrapper.style.width = `${blockMeasure.width}px`;
        imageWrapper.style.height = `${blockMeasure.height}px`;
        imageWrapper.style.flexShrink = '0';
        imageWrapper.style.maxWidth = '100%';
        imageWrapper.style.boxSizing = 'border-box';
        applySdtDataset(imageWrapper, (block as ImageBlock).attrs?.sdt);

        const imgEl = doc.createElement('img');
        imgEl.classList.add('superdoc-table-image');
        if (block.src) {
          imgEl.src = block.src;
        }
        imgEl.alt = block.alt ?? '';
        imgEl.style.width = '100%';
        imgEl.style.height = '100%';
        imgEl.style.objectFit = block.objectFit ?? 'contain';
        // MS Word anchors stretched images to top-left, clipping from right/bottom
        if (block.objectFit === 'cover') {
          imgEl.style.objectPosition = 'left top';
        }
        applyImageClipPath(imgEl, block.attrs?.clipPath, { clipContainer: imageWrapper });
        imgEl.style.display = 'block';

        imageWrapper.appendChild(imgEl);
        content.appendChild(imageWrapper);
        flowCursorY += blockMeasure.height;
        continue;
      }

      if (blockMeasure.kind === 'drawing' && block?.kind === 'drawing') {
        if (block.anchor?.isAnchored) {
          anchoredBlocks.push({ block, measure: blockMeasure as DrawingMeasure });
          // Advance cumulative count only when height > 0 to stay aligned with
          // getCellLines() which only counts non-paragraph blocks with positive height.
          if (blockMeasure.height > 0) {
            cumulativeLineCount += 1;
          }
          continue;
        }

        // Non-paragraph blocks occupy 1 segment in the combined line/segment index.
        const drawSegmentIndex = cumulativeLineCount;
        cumulativeLineCount += 1;

        if (drawSegmentIndex < globalFromLine || drawSegmentIndex >= globalToLine) {
          continue;
        }

        const drawingWrapper = doc.createElement('div');
        drawingWrapper.style.position = 'relative';
        drawingWrapper.style.width = `${blockMeasure.width}px`;
        drawingWrapper.style.height = `${blockMeasure.height}px`;
        drawingWrapper.style.flexShrink = '0';
        drawingWrapper.style.maxWidth = '100%';
        drawingWrapper.style.boxSizing = 'border-box';
        applySdtDataset(drawingWrapper, (block as DrawingBlock).attrs as SdtMetadata | undefined);

        const drawingInner = doc.createElement('div');
        drawingInner.classList.add('superdoc-table-drawing');
        drawingInner.style.width = '100%';
        drawingInner.style.height = '100%';
        drawingInner.style.display = 'flex';
        drawingInner.style.alignItems = 'center';
        drawingInner.style.justifyContent = 'center';
        drawingInner.style.overflow = 'hidden';

        if (block.drawingKind === 'image' && 'src' in block && block.src) {
          const img = doc.createElement('img');
          img.classList.add('superdoc-drawing-image');
          img.src = block.src;
          img.alt = block.alt ?? '';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = block.objectFit ?? 'contain';
          // MS Word anchors stretched images to top-left, clipping from right/bottom
          if (block.objectFit === 'cover') {
            img.style.objectPosition = 'left top';
          }
          applyImageClipPath(img, block.attrs?.clipPath, { clipContainer: drawingInner });
          drawingInner.appendChild(img);
        } else if (renderDrawingContent) {
          // Use the callback for other drawing types (vectorShape, shapeGroup, etc.)
          const drawingContent = renderDrawingContent(block as DrawingBlock);
          drawingContent.style.width = '100%';
          drawingContent.style.height = '100%';
          drawingInner.appendChild(drawingContent);
        } else {
          // Fallback placeholder when no rendering callback is provided
          const placeholder = doc.createElement('div');
          placeholder.classList.add('superdoc-drawing-placeholder');
          placeholder.style.width = '100%';
          placeholder.style.height = '100%';
          const stripePattern =
            'repeating-linear-gradient(45deg, rgba(15,23,42,0.1), rgba(15,23,42,0.1) 6px, rgba(15,23,42,0.2) 6px, rgba(15,23,42,0.2) 12px)';
          // Set both shorthand and longhand to handle partial CSS property support in test DOMs.
          placeholder.style.background = stripePattern;
          placeholder.style.backgroundImage = stripePattern;
          placeholder.style.border = '1px dashed rgba(15, 23, 42, 0.3)';
          drawingInner.appendChild(placeholder);
        }

        drawingWrapper.appendChild(drawingInner);
        content.appendChild(drawingWrapper);
        flowCursorY += blockMeasure.height;
        continue;
      }

      if (blockMeasure.kind === 'paragraph' && block?.kind === 'paragraph') {
        const paragraphMeasure = blockMeasure as ParagraphMeasure;
        const lines = paragraphMeasure.lines;
        const blockLineCount = lines?.length || 0;

        paragraphTopById.set(block.id, flowCursorY);
        /**
         * Extract Word layout information from paragraph attributes.
         * This contains computed marker positioning and indent details from the word-layout engine.
         * The wordLayout is pre-computed during paragraph attribute processing and provides
         * accurate positioning for list markers matching Microsoft Word's behavior.
         */
        const wordLayout = (block.attrs?.wordLayout ?? null) as WordLayoutInfo | null;

        /**
         * Marker layout contains the rendering details for list markers (bullets/numbers).
         * This includes the marker text, positioning, justification, and styling.
         */
        const markerLayout = wordLayout?.marker;

        /**
         * Marker measurement data from the measurement stage.
         * Contains computed dimensions (width, gutter) for the marker.
         */
        const markerMeasure = paragraphMeasure.marker;
        const indentLeftPx =
          markerMeasure?.indentLeft ??
          wordLayout?.indentLeftPx ??
          (block.attrs?.indent && typeof block.attrs.indent.left === 'number' ? block.attrs.indent.left : 0);
        const suppressFirstLineIndent = block.attrs?.suppressFirstLineIndent === true;

        // Calculate the global line indices for this block
        const blockStartGlobal = cumulativeLineCount;
        const blockEndGlobal = cumulativeLineCount + blockLineCount;

        // Skip blocks entirely before/after the global range
        if (blockEndGlobal <= globalFromLine) {
          cumulativeLineCount += blockLineCount;
          continue;
        }
        if (blockStartGlobal >= globalToLine) {
          cumulativeLineCount += blockLineCount;
          continue;
        }

        // Calculate local line indices within this block
        const localStartLine = Math.max(0, globalFromLine - blockStartGlobal);
        const localEndLine = Math.min(blockLineCount, globalToLine - blockStartGlobal);

        // Create wrapper for this paragraph's SDT metadata
        // Use absolute positioning within the content container to stack blocks vertically
        const paraWrapper = doc.createElement('div');
        paraWrapper.style.position = 'relative';
        paraWrapper.style.left = '0';
        paraWrapper.style.width = '100%';
        applySdtDataset(paraWrapper, block.attrs?.sdt);
        const sdtBoundary = sdtBoundaries[i];
        const blockKey = sdtContainerKeys[i] ?? null;
        if (shouldApplySdtContainerStyling(block.attrs?.sdt, block.attrs?.containerSdt, blockKey)) {
          applySdtContainerStyling(doc, paraWrapper, block.attrs?.sdt, block.attrs?.containerSdt, sdtBoundary);
        }
        applyParagraphBordersAndShading(paraWrapper, block as ParagraphBlock);

        // Apply paragraph-level border and shading styles (SD-1296)
        // These were previously missing, causing paragraph borders to not render in table cells
        applyParagraphBorderStyles(paraWrapper, block.attrs?.borders);
        applyParagraphShadingStyles(paraWrapper, block.attrs?.shading);

        // Calculate height of rendered content for proper block accumulation
        let renderedHeight = 0;

        /**
         * Render lines for this paragraph block.
         * Lines are rendered within the local range (localStartLine to localEndLine).
         * List markers are only rendered on the first line if we're rendering from the start.
         */
        for (let lineIdx = localStartLine; lineIdx < localEndLine && lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          const isLastLine = lineIdx === lines.length - 1;
          const lineTop = flowCursorY + renderedHeight;

          /**
           * Render line without extra paragraph padding to enable explicit marker/text offset control.
           * This mirrors the main renderer behavior where list markers clear padding/textIndent.
           */
          const lineEl = renderLine(
            block as ParagraphBlock,
            line,
            { ...context, section: 'body' },
            lineIdx,
            isLastLine,
          );
          lineEl.style.paddingLeft = '';
          lineEl.style.paddingRight = '';
          lineEl.style.textIndent = '';

          /**
           * Determine if we should render a list marker for this line.
           * Markers are only rendered on the first line of a paragraph, and only if:
           * - We have marker layout information from word-layout engine
           * - We have marker measurement data
           * - This is the first line (lineIdx === 0)
           * - We're rendering from the start of the paragraph (localStartLine === 0)
           * - The marker has a non-zero width
           */
          const shouldRenderMarker =
            markerLayout &&
            markerMeasure &&
            lineIdx === 0 &&
            localStartLine === 0 &&
            markerMeasure.markerWidth > 0 &&
            !markerLayout.run?.vanish;

          if (shouldRenderMarker) {
            /**
             * Render the list marker using the extracted helper function.
             * This creates a container with the marker positioned absolutely
             * and the line content positioned with appropriate padding.
             */
            const lineContainer = renderListMarker({
              doc,
              lineEl,
              markerLayout,
              markerMeasure,
              indentLeftPx,
            });
            renderedLines.push({ el: lineContainer, top: lineTop, height: line.lineHeight });
            paraWrapper.appendChild(lineContainer);
          } else {
            /**
             * For lines without markers, apply appropriate indentation:
             * - For list paragraphs: apply indent padding for continuation lines
             * - For non-list paragraphs: preserve the paragraph's own indent styling
             */
            applyTableCellLineIndentation({
              lineEl,
              line,
              indent: block.attrs?.indent,
              indentLeftPx,
              hasListMarkerLayout: Boolean(markerLayout),
              lineIndex: lineIdx,
              localStartLine,
              suppressFirstLineIndent,
            });
            renderedLines.push({ el: lineEl, top: lineTop, height: line.lineHeight });
            paraWrapper.appendChild(lineEl);
          }

          renderedHeight += line.lineHeight;
        }

        // If we rendered the entire paragraph, use measured totalHeight to keep layout aligned with measurement
        const renderedEntireBlock = localStartLine === 0 && localEndLine >= blockLineCount;
        if (renderedEntireBlock && blockMeasure.totalHeight && blockMeasure.totalHeight > renderedHeight) {
          renderedHeight = blockMeasure.totalHeight;
        }

        content.appendChild(paraWrapper);

        if (renderedHeight > 0) {
          paraWrapper.style.height = `${renderedHeight}px`;
        }

        flowCursorY += renderedHeight;

        // Apply paragraph spacing.after as margin-bottom for non-last paragraphs.
        // In Word, the last paragraph's spacing.after is absorbed by the cell's bottom padding.
        const isLastBlock = i === Math.min(blockMeasures.length, cellBlocks.length) - 1;
        if (renderedEntireBlock && !isLastBlock) {
          const spacingAfter = (block as ParagraphBlock).attrs?.spacing?.after;
          if (typeof spacingAfter === 'number' && spacingAfter > 0) {
            paraWrapper.style.marginBottom = `${spacingAfter}px`;
            flowCursorY += spacingAfter;
          }
        }

        cumulativeLineCount += blockLineCount;
      }
      // Unsupported block types are skipped (no line count contribution)
      // TODO: Handle other block types (list) if needed
    }

    // Handle anchor elements
    const verticalAlign = cell?.attrs?.verticalAlign;
    const remainingSpace = contentHeightPx - flowCursorY;
    const alignmentOffsetY =
      verticalAlign === 'center'
        ? Math.max(0, remainingSpace / 2)
        : verticalAlign === 'bottom'
          ? Math.max(0, remainingSpace)
          : 0;

    const wrapExclusions: WrapExclusion[] = [];
    for (const entry of anchoredBlocks) {
      const anchoredBlock = entry.block;
      const anchoredMeasure = entry.measure;
      const anchor = anchoredBlock.anchor;
      if (!anchor || !anchor.isAnchored) {
        continue;
      }

      const objectWidth = anchoredMeasure.width;
      const objectHeight = anchoredMeasure.height;

      const baseLeft = anchor.offsetH ?? 0;
      const indentOffset = typeof tableIndent === 'number' && Number.isFinite(tableIndent) ? tableIndent : 0;
      const left = anchor.hRelativeFrom === 'column' ? baseLeft - x - indentOffset : baseLeft;
      const top = anchor.offsetV ?? 0;

      const behindDoc =
        anchor.behindDoc === true || (anchoredBlock.wrap?.type === 'None' && anchoredBlock.wrap?.behindDoc);
      const zIndex =
        typeof anchoredBlock.zIndex === 'number'
          ? anchoredBlock.zIndex
          : (normalizeZIndex(anchoredBlock.attrs?.originalAttributes) ?? (behindDoc ? -1 : 1));

      const wrap = anchoredBlock.wrap;
      if (!behindDoc && wrap?.type === 'Square') {
        const wrapText = (wrap.wrapText ?? 'bothSides') as WrapTextMode;
        const distLeft = anchoredBlock.padding?.left ?? 0;
        const distRight = anchoredBlock.padding?.right ?? 0;
        const distTop = anchoredBlock.padding?.top ?? 0;
        const distBottom = anchoredBlock.padding?.bottom ?? 0;
        wrapExclusions.push({
          left: left - distLeft,
          right: left + objectWidth + distRight,
          top: top - distTop,
          bottom: top + objectHeight + distBottom,
          wrapText,
        });
      }

      if (anchoredBlock.kind === 'image') {
        const imageWrapper = doc.createElement('div');
        imageWrapper.style.position = 'absolute';
        imageWrapper.style.left = `${left}px`;
        imageWrapper.style.top = `${top}px`;
        imageWrapper.style.width = `${objectWidth}px`;
        imageWrapper.style.height = `${objectHeight}px`;
        imageWrapper.style.maxWidth = '100%';
        imageWrapper.style.boxSizing = 'border-box';
        imageWrapper.style.zIndex = String(zIndex);
        applySdtDataset(imageWrapper, anchoredBlock.attrs?.sdt);

        const imgEl = doc.createElement('img');
        imgEl.classList.add('superdoc-table-image');
        if (anchoredBlock.src) {
          imgEl.src = anchoredBlock.src;
        }
        imgEl.alt = anchoredBlock.alt ?? '';
        imgEl.style.width = '100%';
        imgEl.style.height = '100%';
        imgEl.style.objectFit = anchoredBlock.objectFit ?? 'contain';
        if (anchoredBlock.objectFit === 'cover') {
          imgEl.style.objectPosition = 'left top';
        }
        applyImageClipPath(imgEl, anchoredBlock.attrs?.clipPath, { clipContainer: imageWrapper });
        imgEl.style.display = 'block';
        imageWrapper.appendChild(imgEl);
        content.appendChild(imageWrapper);
      } else {
        const drawingWrapper = doc.createElement('div');
        drawingWrapper.style.position = 'absolute';
        drawingWrapper.style.left = `${left}px`;
        drawingWrapper.style.top = `${top}px`;
        drawingWrapper.style.width = `${objectWidth}px`;
        drawingWrapper.style.height = `${objectHeight}px`;
        drawingWrapper.style.maxWidth = '100%';
        drawingWrapper.style.boxSizing = 'border-box';
        drawingWrapper.style.zIndex = String(zIndex);
        applySdtDataset(drawingWrapper, anchoredBlock.attrs as SdtMetadata | undefined);

        const drawingInner = doc.createElement('div');
        drawingInner.classList.add('superdoc-table-drawing');
        drawingInner.style.width = '100%';
        drawingInner.style.height = '100%';
        drawingInner.style.display = 'flex';
        drawingInner.style.alignItems = 'center';
        drawingInner.style.justifyContent = 'center';
        drawingInner.style.overflow = 'hidden';

        if (anchoredBlock.drawingKind === 'image' && 'src' in anchoredBlock && anchoredBlock.src) {
          const img = doc.createElement('img');
          img.classList.add('superdoc-drawing-image');
          img.src = anchoredBlock.src;
          img.alt = anchoredBlock.alt ?? '';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = anchoredBlock.objectFit ?? 'contain';
          if (anchoredBlock.objectFit === 'cover') {
            img.style.objectPosition = 'left top';
          }
          applyImageClipPath(img, anchoredBlock.attrs?.clipPath, { clipContainer: drawingInner });
          drawingInner.appendChild(img);
        } else if (renderDrawingContent) {
          const drawingContent = renderDrawingContent(anchoredBlock as DrawingBlock);
          drawingContent.style.width = '100%';
          drawingContent.style.height = '100%';
          drawingInner.appendChild(drawingContent);
        } else {
          const placeholder = doc.createElement('div');
          placeholder.classList.add('superdoc-drawing-placeholder');
          placeholder.style.width = '100%';
          placeholder.style.height = '100%';
          const stripePattern =
            'repeating-linear-gradient(45deg, rgba(15,23,42,0.1), rgba(15,23,42,0.1) 6px, rgba(15,23,42,0.2) 6px, rgba(15,23,42,0.2) 12px)';
          // Set both shorthand and longhand to handle partial CSS property support in test DOMs.
          placeholder.style.background = stripePattern;
          placeholder.style.backgroundImage = stripePattern;
          placeholder.style.border = '1px dashed rgba(15, 23, 42, 0.3)';
          drawingInner.appendChild(placeholder);
        }

        drawingWrapper.appendChild(drawingInner);
        content.appendChild(drawingWrapper);
      }
    }

    // Apply wrapSquare exclusions after all blocks are rendered and anchored positions are known.
    // This keeps anchored objects out-of-flow while preventing text overlap in table cells.
    applySquareWrapExclusionsToLines(renderedLines, wrapExclusions, contentWidthPx, alignmentOffsetY);

    if (captureLineSnapshot) {
      for (const rendered of renderedLines) {
        const candidateLine = rendered.el.classList.contains('superdoc-line')
          ? rendered.el
          : rendered.el.querySelector('.superdoc-line');
        if (!(candidateLine instanceof HTMLElement)) {
          continue;
        }
        const wrapperEl = rendered.el.classList.contains('superdoc-line') ? undefined : rendered.el;
        captureLineSnapshot(candidateLine, { ...context, section: 'body' }, { inTableParagraph: false, wrapperEl });
      }
    }
  }

  return { cellElement: cellEl };
};
