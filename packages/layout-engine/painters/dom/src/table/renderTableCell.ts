import type {
  CellBorders,
  DrawingBlock,
  DrawingMeasure,
  Fragment,
  ImageBlock,
  ImageHyperlink,
  ImageMeasure,
  Line,
  Measure,
  ParagraphBlock,
  ParagraphMeasure,
  PartialRowInfo,
  SdtMetadata,
  TableBlock,
  TableMeasure,
  WrapExclusion,
  WrapTextMode,
} from '@superdoc/contracts';
import { getCellLines, normalizeZIndex } from '@superdoc/contracts';
import type { MinimalWordLayout } from '@superdoc/common/list-marker-utils';
import type { FragmentRenderContext, RenderedLineInfo } from '../renderer.js';
import { applySquareWrapExclusionsToLines } from '../utils/anchor-helpers';
import { renderTableImageFrame } from '../images/table-image-frame.js';
import { buildImageHyperlinkAnchor } from '../images/hyperlink.js';
import {
  getSdtContainerKeyForBlock,
  getSdtSiblingBoundaries,
  type SdtAncestorOptions,
  type SdtBoundaryOptions,
} from '../sdt/container.js';
import { applyCellBorders } from './border-utils.js';
import { renderTableFragment as renderTableFragmentElement } from './renderTableFragment.js';
import { renderParagraphContent } from '../paragraph/renderParagraphContent.js';
import { computeBetweenBorderContext, type BetweenBorderInfo } from '../paragraph/borders/index.js';
import { renderTableDrawingFrame } from '../drawings/tableDrawingFrame.js';
import { renderDrawingContent as renderSharedDrawingContent } from '../drawings/renderDrawingContent.js';
import {
  computeRenderedTableFragmentHeight,
  createEmbeddedTableFragment,
  getEmbeddedTableSegmentCount,
  mapEmbeddedTableRowSlice,
} from './embeddedTableFragment.js';

type TableRowMeasure = TableMeasure['rows'][number];
type TableCellMeasure = TableRowMeasure['cells'][number];

export function getCellSegmentCount(cell: TableCellMeasure): number {
  return getCellLines(cell).length;
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
    resolvedListTextStartPx?: number,
  ) => HTMLElement;
  /** Optional callback invoked after a table line's final styles/markers are applied. */
  captureLineSnapshot?: (
    lineEl: HTMLElement,
    context: FragmentRenderContext,
    options?: { inTableParagraph?: boolean; wrapperEl?: HTMLElement },
  ) => void;
  /** Optional callback to render non-image drawing content (shapes, charts, etc.) */
  renderDrawingContent?: (block: DrawingBlock, options?: { clipContainer?: HTMLElement }) => HTMLElement;
  /** Function to apply SDT metadata as data attributes */
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  /** Starting row index for partial rendering (inclusive, default 0) */
  fromRow?: number;
  /** Ending row index for partial rendering (exclusive, default all rows) */
  toRow?: number;
  /** Partial row info for mid-row splits within the embedded table */
  partialRow?: PartialRowInfo;
  /** Optional SDT boundary overrides for container styling */
  sdtBoundary?: SdtBoundaryOptions;
  /** Ancestor SDT key used to suppress duplicate container chrome in nested tables */
  ancestorContainerKey?: string | null;
  /** Ancestor SDT metadata used to suppress duplicate id-less container chrome in nested tables */
  ancestorContainerSdt?: SdtMetadata | null;
  /** Ancestor SDT keys used to suppress duplicate container chrome in nested tables */
  ancestorContainerKeys?: SdtAncestorOptions['ancestorContainerKeys'];
  /** Ancestor SDT metadata chain used to suppress duplicate id-less container chrome in nested tables */
  ancestorContainerSdts?: SdtAncestorOptions['ancestorContainerSdts'];
  /** Receives notification when this embedded table or its descendants render SDT chrome */
  onSdtContainerChrome?: () => void;
};

/**
 * Version identifier for embedded table block lookups.
 * Used to distinguish nested tables from top-level tables in the block lookup map.
 */

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
const renderEmbeddedTable = (
  params: EmbeddedTableRenderParams,
): { element: HTMLElement; hasSdtContainerChrome: boolean } => {
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
    sdtBoundary,
    ancestorContainerKey,
    ancestorContainerSdt,
    ancestorContainerKeys,
    ancestorContainerSdts,
    onSdtContainerChrome,
  } = params;

  const { fragment, effectiveColumnWidths, cellSpacingPx } = createEmbeddedTableFragment({
    block: table,
    measure,
    availableWidth,
    fromRow: paramFromRow,
    toRow: paramToRow,
    partialRow: paramPartialRow,
  });

  const applyFragmentFrame = (el: HTMLElement, frag: Fragment): void => {
    el.style.left = `${frag.x}px`;
    el.style.top = `${frag.y}px`;
    el.style.width = `${frag.width}px`;
    el.dataset.blockId = frag.blockId;
  };

  let hasSdtContainerChrome = false;
  const tableEl = renderTableFragmentElement({
    doc,
    fragment,
    context,
    block: table,
    measure,
    cellSpacingPx,
    effectiveColumnWidths,
    renderLine,
    captureLineSnapshot,
    renderDrawingContent,
    applyFragmentFrame,
    applySdtDataset,
    applyStyles: applyInlineStyles,
    sdtBoundary,
    ancestorContainerKey,
    ancestorContainerSdt,
    ancestorContainerKeys,
    ancestorContainerSdts,
    onSdtContainerChrome: () => {
      hasSdtContainerChrome = true;
      onSdtContainerChrome?.();
    },
  });

  return { element: tableEl, hasSdtContainerChrome };
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
  sdtBoundary?: SdtBoundaryOptions;
  ancestorContainerKey?: string | null;
  ancestorContainerSdt?: SdtMetadata | null;
  ancestorContainerKeys?: SdtAncestorOptions['ancestorContainerKeys'];
  ancestorContainerSdts?: SdtAncestorOptions['ancestorContainerSdts'];
  onSdtContainerChrome?: () => void;
}): { element: HTMLElement | null; height: number; nextCumulativeLineCount: number; hasSdtContainerChrome: boolean } {
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
    sdtBoundary,
    ancestorContainerKey,
    ancestorContainerSdt,
    ancestorContainerKeys,
    ancestorContainerSdts,
    onSdtContainerChrome,
  } = params;

  const totalTableSegments = getEmbeddedTableSegmentCount(tableMeasure);
  const tableStartSegment = cumulativeLineCount;
  const nextCumulativeLineCount = cumulativeLineCount + totalTableSegments;
  const tableEndSegment = nextCumulativeLineCount;

  // Skip entirely if no segments are in the visible range
  if (tableEndSegment <= globalFromLine || tableStartSegment >= globalToLine) {
    return { element: null, height: 0, nextCumulativeLineCount, hasSdtContainerChrome: false };
  }

  // Map global line range to local segment range within this embedded table
  const localFrom = Math.max(0, globalFromLine - tableStartSegment);
  const localTo = Math.min(totalTableSegments, globalToLine - tableStartSegment);

  const rowSlice = mapEmbeddedTableRowSlice({ block, measure: tableMeasure, localFrom, localTo });
  if (!rowSlice) {
    return { element: null, height: 0, nextCumulativeLineCount, hasSdtContainerChrome: false };
  }
  const { fromRow: embeddedFromRow, toRow: embeddedToRow, partialRow: partialRowInfo } = rowSlice;

  const visibleHeight = computeRenderedTableFragmentHeight({
    block,
    measure: tableMeasure,
    fromRow: embeddedFromRow,
    toRow: embeddedToRow,
    partialRow: partialRowInfo,
  });
  const effectiveSdtBoundary = sdtBoundary
    ? {
        ...sdtBoundary,
        isStart: (sdtBoundary.isStart ?? true) && localFrom === 0,
        isEnd: (sdtBoundary.isEnd ?? true) && localTo >= totalTableSegments,
        showLabel: sdtBoundary.showLabel === undefined ? undefined : sdtBoundary.showLabel && localFrom === 0,
      }
    : undefined;

  const tableWrapper = doc.createElement('div');
  tableWrapper.style.position = 'relative';
  tableWrapper.style.width = '100%';
  tableWrapper.style.height = `${visibleHeight}px`;
  tableWrapper.style.flexShrink = '0';
  tableWrapper.style.boxSizing = 'border-box';

  const tableResult = renderEmbeddedTable({
    doc,
    table: block,
    measure: tableMeasure,
    availableWidth: contentWidthPx,
    context,
    renderLine,
    captureLineSnapshot,
    renderDrawingContent,
    applySdtDataset,
    fromRow: embeddedFromRow,
    toRow: embeddedToRow,
    partialRow: partialRowInfo,
    sdtBoundary: effectiveSdtBoundary,
    ancestorContainerKey,
    ancestorContainerSdt,
    ancestorContainerKeys,
    ancestorContainerSdts,
    onSdtContainerChrome,
  });
  tableWrapper.appendChild(tableResult.element);

  return {
    element: tableWrapper,
    height: visibleHeight,
    nextCumulativeLineCount,
    hasSdtContainerChrome: tableResult.hasSdtContainerChrome,
  };
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
    resolvedListTextStartPx?: number,
  ) => HTMLElement;
  /** Optional callback invoked after a table line's final styles/markers are applied. */
  captureLineSnapshot?: (
    lineEl: HTMLElement,
    context: FragmentRenderContext,
    options?: { inTableParagraph?: boolean; wrapperEl?: HTMLElement },
  ) => void;
  /**
   * Optional callback function to render non-image drawing content (vectorShapes, shapeGroups, charts).
   * If provided, this callback is used for DrawingBlocks whose drawingKind is not 'image'.
   * The callback receives a DrawingBlock and must return an HTMLElement.
   * The returned element will have width: 100% and height: 100% styles applied automatically.
   * If undefined, the shared drawing renderer is used.
   * Image drawings always use the shared image renderer so table image styling and hyperlinks are preserved.
   */
  renderDrawingContent?: (block: DrawingBlock, options?: { clipContainer?: HTMLElement }) => HTMLElement;
  /** Rendering context */
  context: FragmentRenderContext;
  /** Function to apply SDT metadata as data attributes */
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  /** Ancestor SDT container key for suppressing duplicate container styling in cells */
  ancestorContainerKey?: string | null;
  /** Ancestor SDT metadata for suppressing duplicate id-less container styling in cells */
  ancestorContainerSdt?: SdtMetadata | null;
  /** Ancestor SDT keys for suppressing duplicate container styling in cells */
  ancestorContainerKeys?: SdtAncestorOptions['ancestorContainerKeys'];
  /** Ancestor SDT metadata chain for suppressing duplicate id-less container styling in cells */
  ancestorContainerSdts?: SdtAncestorOptions['ancestorContainerSdts'];
  /** Receives notification when this cell or descendants render SDT container chrome */
  onSdtContainerChrome?: () => void;
  /** Table indent in pixels (applied to table fragment positioning) */
  tableIndent?: number;
  /** Whether the table is visually right-to-left (w:bidiVisual, ECMA-376 §17.4.1) */
  isRtl?: boolean;
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

type TableCellParagraphRenderParams = {
  doc: Document;
  content: HTMLElement;
  cellEl: HTMLElement;
  block: ParagraphBlock;
  paragraphMeasure: ParagraphMeasure;
  blockIndex: number;
  blockCount: number;
  cumulativeLineCount: number;
  globalFromLine: number;
  globalToLine: number;
  contentWidthPx: number;
  paddingTop: number;
  flowCursorY: number;
  sdtBoundary?: SdtBoundaryOptions;
  betweenInfo?: BetweenBorderInfo;
  context: FragmentRenderContext;
  renderLine: TableCellRenderDependencies['renderLine'];
  applySdtDataset: TableCellRenderDependencies['applySdtDataset'];
  ancestorContainerKey?: string | null;
  ancestorContainerSdt?: SdtMetadata | null;
  ancestorContainerKeys?: SdtAncestorOptions['ancestorContainerKeys'];
  ancestorContainerSdts?: SdtAncestorOptions['ancestorContainerSdts'];
  onSdtContainerChrome?: () => void;
};

type TableCellParagraphRenderResult = {
  nextCumulativeLineCount: number;
  renderedHeight: number;
  renderedLines: RenderedLineInfo[];
};

const getMeasuredBlockHeight = (measure: Measure | undefined): number => {
  if (!measure) return 0;
  if (measure.kind === 'paragraph') {
    return (
      (measure as ParagraphMeasure).totalHeight ??
      ((measure as ParagraphMeasure).lines ?? []).reduce((sum, line) => sum + line.lineHeight, 0)
    );
  }
  return 'height' in measure && typeof measure.height === 'number' ? measure.height : 0;
};

const getTableCellVisibleBlockIndexes = (
  measures: Measure[],
  blocks: Array<ParagraphBlock | TableBlock | ImageBlock | DrawingBlock>,
  blockCount: number,
): number[] => {
  const indexes: number[] = [];
  for (let i = 0; i < blockCount; i += 1) {
    const measure = measures[i];
    const block = blocks[i];
    if (!measure) continue;
    if (measure.kind === 'paragraph' || measure.kind === 'table') {
      indexes.push(i);
      continue;
    }
    if (isAnchoredMediaBlock(block, measure)) {
      continue;
    }
    if ('height' in measure && typeof measure.height === 'number' && measure.height > 0) {
      indexes.push(i);
    }
  }
  return indexes;
};

const isAnchoredMediaBlock = (
  block: ParagraphBlock | TableBlock | ImageBlock | DrawingBlock | undefined,
  measure: Measure | undefined,
): boolean =>
  (block?.kind === 'image' || block?.kind === 'drawing') &&
  (measure?.kind === 'image' || measure?.kind === 'drawing') &&
  block.anchor?.isAnchored === true;

const sliceSdtBoundaryForParagraph = (
  baseBoundary: SdtBoundaryOptions | undefined,
  localStartLine: number,
  localEndLine: number,
  blockLineCount: number,
): SdtBoundaryOptions | undefined =>
  baseBoundary
    ? {
        ...baseBoundary,
        isStart: (baseBoundary.isStart ?? true) && localStartLine === 0,
        isEnd: (baseBoundary.isEnd ?? true) && localEndLine >= blockLineCount,
        showLabel: baseBoundary.showLabel === undefined ? undefined : baseBoundary.showLabel && localStartLine === 0,
      }
    : undefined;

const renderTableCellParagraphBlock = ({
  doc,
  content,
  cellEl,
  block,
  paragraphMeasure,
  blockIndex,
  blockCount,
  cumulativeLineCount,
  globalFromLine,
  globalToLine,
  contentWidthPx,
  paddingTop,
  flowCursorY,
  sdtBoundary,
  betweenInfo,
  context,
  renderLine,
  applySdtDataset,
  ancestorContainerKey,
  ancestorContainerSdt,
  ancestorContainerKeys,
  ancestorContainerSdts,
  onSdtContainerChrome,
}: TableCellParagraphRenderParams): TableCellParagraphRenderResult => {
  const lines = paragraphMeasure.lines;
  const blockLineCount = lines?.length || 0;
  const blockStartGlobal = cumulativeLineCount;
  const blockEndGlobal = cumulativeLineCount + blockLineCount;
  const nextCumulativeLineCount = blockEndGlobal;

  if (blockEndGlobal <= globalFromLine || blockStartGlobal >= globalToLine) {
    return { nextCumulativeLineCount, renderedHeight: 0, renderedLines: [] };
  }

  const localStartLine = Math.max(0, globalFromLine - blockStartGlobal);
  const localEndLine = Math.min(blockLineCount, globalToLine - blockStartGlobal);
  const paraWrapper = doc.createElement('div');
  paraWrapper.style.position = 'relative';
  paraWrapper.style.left = '0';
  paraWrapper.style.width = '100%';
  content.appendChild(paraWrapper);

  const wordLayout = (block.attrs?.wordLayout ?? null) as MinimalWordLayout | null;
  const isLastBlockInCell = blockIndex === blockCount - 1;
  const result = renderParagraphContent({
    doc,
    frameEl: paraWrapper,
    block,
    measure: paragraphMeasure,
    containerKind: 'table-cell',
    width: contentWidthPx,
    localStartLine,
    localEndLine,
    wordLayout: wordLayout ?? undefined,
    spacingPolicy: {
      isFirstBlock: blockIndex === 0,
      isLastBlock: isLastBlockInCell,
      paddingTop,
    },
    betweenInfo,
    sdtBoundary: sliceSdtBoundaryForParagraph(sdtBoundary, localStartLine, localEndLine, blockLineCount),
    continuesFromPrev: localStartLine > 0,
    continuesOnNext: localEndLine < blockLineCount,
    ancestorContainerKey,
    ancestorContainerSdt,
    ancestorContainerKeys,
    ancestorContainerSdts,
    onSdtContainerChrome: () => {
      cellEl.style.overflow = 'visible';
      onSdtContainerChrome?.();
    },
    applySdtDataset,
    renderLine: ({ block, line, lineIndex, isLastLine, resolvedListTextStartPx }) =>
      renderLine(block, line, context, lineIndex, isLastLine, resolvedListTextStartPx),
    convertFinalParagraphMark: isLastBlockInCell,
    lineTopOffset: flowCursorY,
  });

  return {
    nextCumulativeLineCount,
    renderedHeight: result.totalHeight,
    renderedLines: result.renderedLines,
  };
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
 *     // Custom renderer for non-image drawings
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
    ancestorContainerKey,
    ancestorContainerSdt,
    ancestorContainerKeys,
    ancestorContainerSdts,
    onSdtContainerChrome,
    tableIndent,
    isRtl,
    cellWidth,
    fromLine,
    toLine,
  } = deps;

  const attrs = cell?.attrs;
  const padding = attrs?.padding || { top: 0, left: 4, right: 4, bottom: 0 };
  const buildTableImageHyperlinkAnchor = (
    imageEl: HTMLElement,
    hyperlink: ImageHyperlink | undefined,
    display: 'block' | 'inline-block',
  ): HTMLElement => buildImageHyperlinkAnchor(doc, imageEl, hyperlink, display);
  const renderSharedTableCellDrawingContent = (
    block: DrawingBlock,
    options?: { clipContainer?: HTMLElement },
  ): HTMLElement =>
    renderSharedDrawingContent({
      doc,
      block,
      geometry: 'geometry' in block ? block.geometry : undefined,
      context,
      clipContainer: options?.clipContainer,
      buildImageHyperlinkAnchor: buildTableImageHyperlinkAnchor,
    });
  const renderTableCellDrawingContent = (
    block: DrawingBlock,
    options?: { clipContainer?: HTMLElement },
  ): HTMLElement => {
    if (block.drawingKind === 'image') {
      return renderSharedTableCellDrawingContent(block, options);
    }
    return renderDrawingContent?.(block, options) ?? renderSharedTableCellDrawingContent(block, options);
  };

  // RTL: swap left↔right cell margins (ECMA-376 Part 4 §14.3.3–14.3.4, §14.3.7–14.3.8)
  const paddingLeft = isRtl ? (padding.right ?? 4) : (padding.left ?? 4);
  const paddingTop = padding.top ?? 0;
  const paddingRight = isRtl ? (padding.left ?? 4) : (padding.right ?? 4);
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
  const sdtContainerKeys = cellBlocks.map((block) =>
    block.kind === 'paragraph' || block.kind === 'table' ? getSdtContainerKeyForBlock(block) : null,
  );
  const sdtBoundaries = getSdtSiblingBoundaries(sdtContainerKeys);

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
    const rawBlockCount = Math.min(blockMeasures.length, cellBlocks.length);
    const visibleBlockIndexes = getTableCellVisibleBlockIndexes(blockMeasures as Measure[], cellBlocks, rawBlockCount);
    const visibleBlockIndexByOriginalIndex = new Map<number, number>(
      visibleBlockIndexes.map((originalIndex, visibleIndex) => [originalIndex, visibleIndex]),
    );
    const blockLineCounts: number[] = [];
    for (let i = 0; i < rawBlockCount; i++) {
      const bm = blockMeasures[i];
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
    let paragraphContextY = 0;
    let borderContextSegmentStart = 0;
    const betweenEntryBlockIndexes: number[] = [];
    const betweenInfoByBlockIndex = computeBetweenBorderContext(
      cellBlocks.slice(0, rawBlockCount).flatMap((block, index) => {
        const measure = blockMeasures[index];
        const blockStartGlobal = borderContextSegmentStart;
        const blockLineCount = blockLineCounts[index] ?? 0;
        borderContextSegmentStart += blockLineCount;
        if (isAnchoredMediaBlock(block, measure)) {
          return [];
        }
        const y = paragraphContextY;
        const height = getMeasuredBlockHeight(measure);
        paragraphContextY += height;
        betweenEntryBlockIndexes.push(index);
        if (block?.kind !== 'paragraph' || measure?.kind !== 'paragraph' || !block.attrs?.borders) {
          return [
            {
              blockId: block?.id ?? `cell-block:${index}`,
              x: 0,
              y,
              height,
            },
          ];
        }
        return [
          {
            blockId: block?.id ?? `cell-block:${index}`,
            x: 0,
            y,
            height,
            borders: block.attrs.borders,
            continuesFromPrev: blockStartGlobal < globalFromLine,
            continuesOnNext: blockStartGlobal + blockLineCount > globalToLine,
          },
        ];
      }),
    );
    const betweenInfoByOriginalBlockIndex = new Map(
      Array.from(betweenInfoByBlockIndex, ([entryIndex, info]) => [betweenEntryBlockIndexes[entryIndex], info]),
    );
    let flowCursorY = 0;
    const anchoredBlocks: Array<{ block: ImageBlock | DrawingBlock; measure: ImageMeasure | DrawingMeasure }> = [];
    const renderedLines: RenderedLineInfo[] = [];

    let cumulativeLineCount = 0; // Track cumulative line count across blocks
    for (let i = 0; i < rawBlockCount; i++) {
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
          sdtBoundary: sdtBoundaries[i],
          ancestorContainerKey,
          ancestorContainerSdt,
          ancestorContainerKeys,
          ancestorContainerSdts,
          onSdtContainerChrome,
        });
        cumulativeLineCount = result.nextCumulativeLineCount;
        if (result.element) {
          content.appendChild(result.element);
          flowCursorY += result.height;
        }
        if (result.hasSdtContainerChrome) {
          cellEl.style.overflow = 'visible';
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

        if (blockMeasure.height <= 0) {
          continue;
        }

        // Non-paragraph blocks occupy 1 segment in the combined line/segment index.
        const imgSegmentIndex = cumulativeLineCount;
        cumulativeLineCount += 1;

        if (imgSegmentIndex < globalFromLine || imgSegmentIndex >= globalToLine) {
          continue;
        }

        const imageWrapper = renderTableImageFrame({
          doc,
          block,
          measure: blockMeasure as ImageMeasure,
          placement: { mode: 'flowing' },
          contentMaxWidth: contentWidthPx,
          contentMaxHeight: contentHeightPx,
          applySdtDataset,
          buildImageHyperlinkAnchor: buildTableImageHyperlinkAnchor,
        });
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

        if (blockMeasure.height <= 0) {
          continue;
        }

        // Non-paragraph blocks occupy 1 segment in the combined line/segment index.
        const drawSegmentIndex = cumulativeLineCount;
        cumulativeLineCount += 1;

        if (drawSegmentIndex < globalFromLine || drawSegmentIndex >= globalToLine) {
          continue;
        }

        const drawingWrapper = renderTableDrawingFrame({
          doc,
          block,
          width: blockMeasure.width,
          height: blockMeasure.height,
          position: 'relative',
          flexShrink: '0',
          renderDrawingContent: renderTableCellDrawingContent,
          applySdtDataset,
        });
        content.appendChild(drawingWrapper);
        flowCursorY += blockMeasure.height;
        continue;
      }

      if (blockMeasure.kind === 'paragraph' && block?.kind === 'paragraph') {
        const result = renderTableCellParagraphBlock({
          doc,
          content,
          cellEl,
          block: block as ParagraphBlock,
          paragraphMeasure: blockMeasure as ParagraphMeasure,
          blockIndex: visibleBlockIndexByOriginalIndex.get(i) ?? i,
          blockCount: visibleBlockIndexes.length,
          cumulativeLineCount,
          globalFromLine,
          globalToLine,
          contentWidthPx,
          paddingTop,
          flowCursorY,
          sdtBoundary: sdtBoundaries[i],
          betweenInfo: betweenInfoByOriginalBlockIndex.get(i),
          context,
          renderLine,
          applySdtDataset,
          ancestorContainerKey,
          ancestorContainerSdt,
          ancestorContainerKeys,
          ancestorContainerSdts,
          onSdtContainerChrome,
        });
        renderedLines.push(...result.renderedLines);
        flowCursorY += result.renderedHeight;
        cumulativeLineCount = result.nextCumulativeLineCount;
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
        const imageWrapper = renderTableImageFrame({
          doc,
          block: anchoredBlock,
          measure: anchoredMeasure as ImageMeasure,
          placement: { mode: 'anchored', left, top, zIndex },
          contentMaxWidth: contentWidthPx,
          contentMaxHeight: contentHeightPx,
          applySdtDataset,
          buildImageHyperlinkAnchor: buildTableImageHyperlinkAnchor,
        });
        content.appendChild(imageWrapper);
      } else {
        const drawingWrapper = renderTableDrawingFrame({
          doc,
          block: anchoredBlock,
          width: objectWidth,
          height: objectHeight,
          position: 'absolute',
          left,
          top,
          zIndex,
          renderDrawingContent: renderTableCellDrawingContent,
          applySdtDataset,
        });
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
        captureLineSnapshot(candidateLine, context, { inTableParagraph: false, wrapperEl });
      }
    }
  }

  return { cellElement: cellEl };
};
