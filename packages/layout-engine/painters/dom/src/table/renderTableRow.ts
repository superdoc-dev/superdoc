import type {
  CellBorders,
  DrawingBlock,
  Line,
  ParagraphBlock,
  PartialRowInfo,
  SdtMetadata,
  TableBlock,
  TableBorders,
  TableMeasure,
} from '@superdoc/contracts';
import { getBorderBandProfile, isNativeCssDoubleStyle } from '@superdoc/contracts';
import type { ResolvePhysicalFamily } from '@superdoc/font-system';
import { renderTableCell } from './renderTableCell.js';
import {
  resolveTableCellBorders,
  borderValueToSpec,
  resolveTableBorderValue,
  resolveBorderConflict,
  hasExplicitCellBorders,
  isPresentBorder,
  isExplicitNoneBorder,
  swapCellBordersLR,
  bevelToneSpec,
} from './border-utils.js';
import { getTableCellGridBounds, type TableCellGridPosition } from './grid-geometry.js';
import { resolveTrackedChangesConfig, applyRowTrackedChangeToCell } from '../runs/tracked-changes.js';
import type { TrackedChangesRenderConfig } from '../runs/types.js';
import type { FragmentRenderContext } from '../renderer.js';
import type { SdtAncestorOptions } from '../sdt/container.js';

type TableRowMeasure = TableMeasure['rows'][number];
type TableRow = TableBlock['rows'][number];

type CellBorderResolutionArgs = {
  cellBorders?: CellBorders;
  hasBordersAttribute: boolean;
  tableBorders?: TableBorders;
  cellPosition: TableCellGridPosition;
  cellSpacingPx: number;
  continuesFromPrev: boolean;
  continuesOnNext: boolean;
  /** Borders of the cell directly above (previous row, same grid column) for §17.4.66 conflict resolution. */
  aboveCellBorders?: CellBorders;
  /** Borders of the cell directly to the left (same row, previous grid column). */
  leftCellBorders?: CellBorders;
  /** Borders of the cell directly to the right (same row, next grid column), for asymmetric-edge ownership. */
  rightCellBorders?: CellBorders;
  /**
   * True when the table authored `w:tblCellSpacing` (even 0), which switches Word to the
   * separate-borders model: every cell paints all four edges from its own/table borders and
   * adjacent edges STACK (300dpi probes render single sz=6 boundaries 2x wide, SD-3028).
   * Single-owner suppression does not apply.
   */
  separateBorders?: boolean;
  /**
   * True when the row BELOW has a tblPrEx border override that suppresses its shared horizontal
   * edge (insideH none/nil). The lower cell owns that edge but won't draw it, so a present
   * table/style border on THIS row must be drawn here to close the grid (§17.4.61/§17.4.66).
   * (SD-3028)
   */
  nextRowSuppressesSharedTop?: boolean;
};

const hasAnyResolvedBorder = (borders: CellBorders): boolean =>
  Boolean(borders.top || borders.right || borders.bottom || borders.left);

/**
 * Resolves the borders that a rendered cell fragment should paint.
 *
 * The DOM table painter uses a single-owner border model, so merged cells must
 * determine edge ownership from their full occupied grid bounds, not just their
 * starting column or row.
 */
const resolveRenderedCellBorders = ({
  cellBorders,
  hasBordersAttribute,
  tableBorders,
  cellPosition,
  cellSpacingPx,
  continuesFromPrev,
  continuesOnNext,
  aboveCellBorders,
  leftCellBorders,
  rightCellBorders,
  separateBorders,
  nextRowSuppressesSharedTop,
}: CellBorderResolutionArgs): CellBorders | undefined => {
  const hasExplicitBorders = hasExplicitCellBorders(cellBorders);

  const cellBounds = getTableCellGridBounds(cellPosition);
  const touchesTopBoundary = cellBounds.touchesTopEdge || continuesFromPrev;
  // Interior bottoms are always owned by the row below: each cell there paints its own top,
  // and boundary segments the row below leaves uncovered (gridBefore/gridAfter slivers) are
  // closed by fragment-level gap strips (see row-boundary-gaps.ts), never by this cell
  // painting its full-width bottom — this painter has no border-collapse, so two cells
  // drawing one edge stack into a doubled line. (SD-3345, SD-3028)
  const touchesBottomBoundary = cellBounds.touchesBottomEdge || continuesOnNext;

  // A shared interior edge in the collapsed model is owned by the lower/right cell, so a
  // border defined ONLY by the neighbor above/left must still be painted here — even when
  // this cell has no border of its own — or the line is dropped entirely (the neighbor
  // suppressed its own edge under single-owner). (SD-2969: a bordered clause-header row
  // above a fully borderless spacer row.)
  const hasInteriorNeighborBorder =
    (!touchesTopBoundary && isPresentBorder(aboveCellBorders?.bottom)) ||
    (!cellBounds.touchesLeftEdge && isPresentBorder(leftCellBorders?.right));

  // Collapsed model (zero cell spacing): single-owner positioning, where the value at a
  // shared interior edge is the ECMA-376 §17.4.66 winner of the two adjacent cell borders.
  // This draws a shared edge exactly ONCE (no doubling) while keeping the present border on
  // an asymmetric edge (no dropped line). Runs whenever this cell OR a neighbor above/left
  // defines a border, so `cb` defaults to {} for the borderless case (resolveBorderConflict
  // (undefined, x) === x). Interior right/bottom are owned by the neighbor to the right/below;
  // outer edges use the cell border (which beats the table border), falling back to the table
  // border. Works whether or not table-level borders exist. (SD-3345, SD-2969)
  // Authored `w:tblCellSpacing` (even 0) = Word's separate-borders model: each cell paints
  // all four edges (own border, else the table outer/inside border for its position) and
  // adjacent cell edges stack into a double-width line exactly like Word renders them.
  // Spacing > 0 keeps the legacy branches below (visible gaps, probe-verified earlier).
  if (separateBorders && cellSpacingPx === 0) {
    const cb = (cellBorders ?? {}) as CellBorders;
    return {
      top: resolveTableBorderValue(cb.top, touchesTopBoundary ? tableBorders?.top : tableBorders?.insideH),
      right: resolveTableBorderValue(
        cb.right,
        cellBounds.touchesRightEdge ? tableBorders?.right : tableBorders?.insideV,
      ),
      bottom: resolveTableBorderValue(cb.bottom, touchesBottomBoundary ? tableBorders?.bottom : tableBorders?.insideH),
      left: resolveTableBorderValue(cb.left, cellBounds.touchesLeftEdge ? tableBorders?.left : tableBorders?.insideV),
    };
  }

  if (cellSpacingPx === 0 && (hasExplicitBorders || hasInteriorNeighborBorder)) {
    const cb = (cellBorders ?? {}) as CellBorders;
    return {
      top: touchesTopBoundary
        ? resolveTableBorderValue(cb.top, tableBorders?.top)
        : (resolveBorderConflict(cb.top, aboveCellBorders?.bottom) ??
          // Both sides not present: an explicit nil on BOTH adjacent cells suppresses the
          // shared horizontal edge (§17.4.66); only inherit the table insideH when at least
          // one side is merely unset. (SD-3028)
          (isExplicitNoneBorder(cb.top) && isExplicitNoneBorder(aboveCellBorders?.bottom)
            ? undefined
            : borderValueToSpec(tableBorders?.insideH))),
      // Vertical interior edges: when BOTH adjacent cells declare a border, the right cell
      // owns it (draws its left as the §17.4.66 winner) so the edge is painted once (no
      // doubling). When only ONE side declares a border (asymmetric, no doubling risk) that
      // cell draws it on ITS OWN side — so an RTL cell's end (logical-right) border stays on
      // the cell after the left/right swap instead of moving onto a borderless neighbor. (SD-3345)
      left: cellBounds.touchesLeftEdge
        ? resolveTableBorderValue(cb.left, tableBorders?.left)
        : isPresentBorder(cb.left)
          ? (resolveBorderConflict(cb.left, leftCellBorders?.right) ?? borderValueToSpec(tableBorders?.insideV))
          : isPresentBorder(leftCellBorders?.right)
            ? undefined
            : // Both sides not present: an explicit nil on BOTH adjacent cells suppresses the
              // divider (§17.4.66); only fall back to the table insideV when at least one side
              // is merely unset (and would inherit it). (SD-3028)
              isExplicitNoneBorder(cb.left) && isExplicitNoneBorder(leftCellBorders?.right)
              ? undefined
              : borderValueToSpec(tableBorders?.insideV),
      right: cellBounds.touchesRightEdge
        ? resolveTableBorderValue(cb.right, tableBorders?.right)
        : isPresentBorder(cb.right) && !isPresentBorder(rightCellBorders?.left)
          ? cb.right
          : undefined,
      bottom: touchesBottomBoundary ? resolveTableBorderValue(cb.bottom, tableBorders?.bottom) : undefined,
    };
  }

  if (hasBordersAttribute && !hasExplicitBorders) {
    return undefined;
  }

  if (!tableBorders) {
    // Separate mode (non-zero cell spacing) with explicit borders, or no table borders
    // at all: there is no shared-edge conflict, so draw every specified border.
    return hasExplicitBorders
      ? {
          top: cellBorders.top,
          right: cellBorders.right,
          bottom: cellBorders.bottom,
          left: cellBorders.left,
        }
      : undefined;
  }

  if (hasExplicitBorders) {
    // Separate mode (cellSpacingPx > 0) with table-level borders present.
    return {
      top: resolveTableBorderValue(cellBorders.top, touchesTopBoundary ? tableBorders.top : tableBorders.insideH),
      right: resolveTableBorderValue(cellBorders.right, cellBounds.touchesRightEdge ? tableBorders.right : undefined),
      bottom: resolveTableBorderValue(cellBorders.bottom, touchesBottomBoundary ? tableBorders.bottom : undefined),
      left: resolveTableBorderValue(
        cellBorders.left,
        cellBounds.touchesLeftEdge ? tableBorders.left : tableBorders.insideV,
      ),
    };
  }

  if (cellSpacingPx > 0) {
    const interiorBorders: CellBorders = {
      top: touchesTopBoundary ? undefined : borderValueToSpec(tableBorders.insideH),
      right: cellBounds.touchesRightEdge ? undefined : borderValueToSpec(tableBorders.insideV),
      bottom: touchesBottomBoundary ? undefined : borderValueToSpec(tableBorders.insideH),
      left: cellBounds.touchesLeftEdge ? undefined : borderValueToSpec(tableBorders.insideV),
    };

    return hasAnyResolvedBorder(interiorBorders) ? interiorBorders : undefined;
  }

  const baseBorders = resolveTableCellBorders(tableBorders, cellPosition);

  // The row below owns this interior bottom edge, but if its tblPrEx override suppresses it
  // (insideH none), draw this row's own present interior horizontal border so the grid still
  // closes. (SD-3028)
  const insideHSpec = borderValueToSpec(tableBorders.insideH);
  const interiorBottom = nextRowSuppressesSharedTop && isPresentBorder(insideHSpec) ? insideHSpec : baseBorders.bottom;

  return {
    top: touchesTopBoundary ? borderValueToSpec(tableBorders.top) : baseBorders.top,
    right: baseBorders.right,
    bottom: touchesBottomBoundary ? borderValueToSpec(tableBorders.bottom) : interiorBottom,
    left: baseBorders.left,
  };
};

/**
 * Dependencies required for rendering a table row.
 *
 * Contains all information needed to render cells in a table row, including
 * positioning, measurements, border resolution, and rendering functions.
 */
type TableRowRenderDependencies = {
  /** Document object for creating DOM elements */
  doc: Document;
  /** Container element to append cell elements to */
  container: HTMLElement;
  /** Zero-based index of this row */
  rowIndex: number;
  /** Vertical position (top edge) in pixels */
  y: number;
  /** Measurement data for this row (height, cell measurements) */
  rowMeasure: TableRowMeasure;
  /** Row data (cells, attributes), or undefined for empty rows */
  row?: TableRow;
  /** Previous (above) row data + measure, for collapsed-border conflict resolution (§17.4.66). */
  prevRow?: TableRow;
  prevRowMeasure?: TableRowMeasure;
  /** Next (below) row data, to detect a row-level border override that suppresses the shared
   * horizontal edge so the current row closes the grid itself (§17.4.61/§17.4.66). */
  nextRow?: TableRow;
  /**
   * Rightmost occupied grid column (exclusive) for THIS row, counting cells that span into it
   * via w:vMerge (rowspan) from an earlier row. Falls back to this row's own cells when absent.
   * Prevents a leftmost cell on a rowspan-continuation row from being treated as the rightmost
   * column. (SD-1797)
   */
  rowOccupiedRightCol?: number;
  /** Authored `w:tblCellSpacing` present (even 0): Word separate-borders model (SD-3028). */
  separateBorders?: boolean;
  /** Total number of rows in the table (for border resolution) */
  totalRows: number;
  /** Table-level borders (for resolving cell borders) */
  tableBorders?: TableBorders;
  /** Column widths array for calculating x positions from gridColumnStart */
  columnWidths: number[];
  /** All row heights for calculating rowspan cell heights */
  allRowHeights: number[];
  /** Table indent in pixels (applied to table fragment positioning) */
  tableIndent?: number;
  /** Whether the table is visually right-to-left (w:bidiVisual, ECMA-376 §17.4.1) */
  isRtl?: boolean;
  /** Rendering context */
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
  /** Function to render drawing content (images, shapes, shape groups) */
  renderDrawingContent?: (block: DrawingBlock) => HTMLElement;
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
  /** Receives notification when cells render SDT container chrome */
  onSdtContainerChrome?: () => void;
  /**
   * If true, this row is the first body row of a continuation fragment.
   * MS Word draws borders at split points to visually close the table on each page,
   * so we do NOT suppress borders - both fragments draw their edge borders.
   */
  continuesFromPrev?: boolean;
  /**
   * If true, this row is the last body row before a page break continuation.
   * MS Word draws borders at split points to visually close the table on each page,
   * so we do NOT suppress borders - both fragments draw their edge borders.
   */
  continuesOnNext?: boolean;
  /**
   * Partial row information for mid-row splits.
   * Contains per-cell line ranges (fromLineByCell, toLineByCell) for rendering
   * only a portion of the row's content.
   */
  partialRow?: PartialRowInfo;

  /**
   * Cell spacing in pixels (border-spacing between cells).
   * Applied to cell x positions and row y advancement.
   */
  cellSpacingPx?: number;
  /** Built-in SDT chrome rendering mode. */
  chrome?: 'default' | 'none';
  /**
   * Per-document logical->physical font resolver for in-cell list markers and drop caps. Threaded
   * from the renderer's per-document resolver so they paint the same physical family they were
   * measured in. Undefined falls back to the global resolver.
   */
  resolvePhysical?: ResolvePhysicalFamily;
};

/**
 * Renders all cells in a table row.
 *
 * Iterates through cells in the row, resolving borders based on cell position,
 * and rendering each cell with its content. Cells are positioned horizontally
 * by accumulating their widths.
 *
 * Border resolution logic:
 * - Cells with explicit borders use those borders
 * - Otherwise, cells use position-based borders from table borders:
 *   - Edge cells use outer table borders
 *   - Interior cells use inside borders (insideH, insideV)
 * - If no table borders exist, default borders are applied
 *
 * @param deps - All dependencies required for rendering
 *
 * @example
 * ```typescript
 * renderTableRow({
 *   doc: document,
 *   container: tableContainer,
 *   rowIndex: 0,
 *   y: 0,
 *   rowMeasure,
 *   row,
 *   totalRows: 3,
 *   tableBorders,
 *   context,
 *   renderLine,
 *   applySdtDataset
 * });
 * // Appends all cell elements to container
 * ```
 */
/**
 * Paints a cell's compound borders (double, triple, thinThick*) the way Word does:
 * as a single-rule INNER RECTANGLE per cell, connected with square L-joins at the
 * corners (verified against 300dpi Word renders). A band's rules sit at fixed
 * positions measured from Word (see contracts getBorderBandProfile): the inner-face
 * rule belongs to this cell's rectangle, the outer-face rule belongs to the table
 * outline (outer edges) or to the neighboring cell's rectangle (interior edges),
 * and a 3-rule band's middle rule is a centered strip per owned edge (strips span
 * the full edge so they join squarely at corners, forming Word's middle rectangle).
 * CSS compound borders cannot do this: they miter diagonally and their band hugs
 * the owning cell, so junctions render as crossings instead of closed boxes.
 *
 * The cell keeps its CSS border with a TRANSPARENT color so border-box layout
 * (content inset, band reservation) is unchanged. For each compound side, the
 * rectangle's rule sits at the inner face of that side's band: inset (band - rule)
 * on sides whose band lives in this cell (top/left always, bottom/right at table
 * boundaries), and the OUTER-face rule extended past the box on interior
 * bottom/right sides whose band lives in the neighboring cell. The table outline
 * rules are painted by renderTableFragment. (SD-3308)
 */
const appendCompoundBorderRects = (
  doc: Document,
  container: HTMLElement,
  cellElement: HTMLElement,
  borders: CellBorders | undefined,
  rect: { x: number; y: number; width: number; height: number },
  edges: {
    ownsBottomBand: boolean;
    /** Visual right side is the table boundary (band fully inside this cell). */
    rightIsBoundary: boolean;
    /** Visual left side is the table boundary (band fully inside this cell). */
    leftIsBoundary: boolean;
    /** Sides whose 3-rule middle layer is painted by the fragment grid instead. */
    suppressMid?: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean };
  },
): void => {
  if (!borders) return;
  const { ownsBottomBand, rightIsBoundary, leftIsBoundary, suppressMid } = edges;
  const sideInfo = (['top', 'right', 'bottom', 'left'] as const).map((side) => {
    const spec = borders[side];
    const profile = spec ? getBorderBandProfile(spec) : null;
    if (!spec || !profile) return null;
    // A symmetric `double` renders via the native CSS `border-style: double` (two equal rules)
    // on any FULL-BAND side: the table boundary, and the horizontal interior edge owned by this
    // cell. Routing those through the overlay paints only a single inner rule (the double
    // collapses to one line). The straddled interior-VERTICAL divider stays in the overlay:
    // each half-cell draws one rule and together they form the double centered on the gridline.
    // (SD-3028)
    if (isNativeCssDoubleStyle(spec.style)) {
      const fullBand =
        side === 'top' ||
        (side === 'bottom' && ownsBottomBand) ||
        (side === 'left' && leftIsBoundary) ||
        (side === 'right' && rightIsBoundary);
      if (fullBand) return null;
    }
    const { segments } = profile;
    const band = Math.max(1, Math.round(profile.band));
    const outerRule = Math.max(1, Math.round(segments[0]));
    const innerRule = Math.max(1, Math.round(segments[segments.length - 1]));
    // 5 segments = 3 rules: the middle rule sits outer rule + gap inside the band.
    const midRule = segments.length === 5 ? Math.max(1, Math.round(segments[2])) : 0;
    const midOffset = segments.length === 5 ? Math.round(segments[0] + segments[1]) : 0;
    const color = spec.color && /^#[0-9A-Fa-f]{6}$/.test(spec.color) ? spec.color : '#000000';
    return { side, band, outerRule, innerRule, midRule, midOffset, color };
  });
  if (!sideInfo.some(Boolean)) return;

  const x0 = Math.round(rect.x);
  const y0 = Math.round(rect.y);
  const x1 = Math.round(rect.x + rect.width);
  const y1 = Math.round(rect.y + rect.height);

  // Hide the CSS paint for compound sides, keep the layout band.
  for (const info of sideInfo) {
    if (!info) continue;
    const cssSide = (info.side[0].toUpperCase() + info.side.slice(1)) as 'Top' | 'Right' | 'Bottom' | 'Left';
    cellElement.style[`border${cssSide}Color`] = 'transparent';
  }

  const [top, right, bottom, left] = sideInfo;
  const rectEl = doc.createElement('div');
  rectEl.className = 'superdoc-compound-border-rect';
  const st = rectEl.style;
  st.position = 'absolute';
  st.boxSizing = 'border-box';
  st.pointerEvents = 'none';
  // Inner-face placement per side. Boundary band (fully inside the cell): the inner
  // rule sits band - rule inside the box. Interior VERTICAL bands straddle the
  // gridline (half in each cell, Word model): this cell's divider-facing rule sits
  // at the straddled band's near face, band/2 - rule from the gridline (negative
  // when the rule is wider than the half-band, extending past the gridline).
  // Interior horizontal bands keep the owner-cell placement: the band lives in the
  // lower cell's top (the row reservation already centers it visually), and the
  // upper cell contributes the band's outer-face rule just past its box.
  const topInset = top ? top.band - top.innerRule : 0;
  const leftInset = left
    ? leftIsBoundary
      ? left.band - left.innerRule
      : Math.round(left.band / 2) - left.innerRule
    : 0;
  const bottomInset = bottom
    ? ownsBottomBand
      ? bottom.band - bottom.innerRule
      : Math.round(bottom.band / 2) - bottom.outerRule
    : 0;
  const rightInset = right
    ? rightIsBoundary
      ? right.band - right.innerRule
      : Math.round(right.band / 2) - right.outerRule
    : 0;
  st.left = `${x0 + leftInset}px`;
  st.top = `${y0 + topInset}px`;
  st.width = `${x1 - x0 - leftInset - rightInset}px`;
  st.height = `${y1 - y0 - topInset - bottomInset}px`;
  if (top) st.borderTop = `${top.innerRule}px solid ${top.color}`;
  if (bottom) st.borderBottom = `${ownsBottomBand ? bottom.innerRule : bottom.outerRule}px solid ${bottom.color}`;
  if (left) st.borderLeft = `${left.innerRule}px solid ${left.color}`;
  if (right) st.borderRight = `${rightIsBoundary ? right.innerRule : right.outerRule}px solid ${right.color}`;
  container.appendChild(rectEl);

  // Middle rule of 3-rule bands: ONE bordered rectangle inset to the middle rule's
  // position (outer rule + gap) on each OWNED 3-rule side. A box with borders joins
  // cleanly at corners, matching Word's middle rectangle; full-edge strips would
  // protrude across the outer and inner rings. Neighbor-owned interior sides are
  // painted by the owning cell's own middle rectangle.
  const midTop = top && top.midRule > 0 && !suppressMid?.top ? top : null;
  const midLeft = left && left.midRule > 0 && !suppressMid?.left ? left : null;
  const midBottom = bottom && bottom.midRule > 0 && ownsBottomBand && !suppressMid?.bottom ? bottom : null;
  const midRight = right && right.midRule > 0 && rightIsBoundary && !suppressMid?.right ? right : null;
  if (midTop || midLeft || midBottom || midRight) {
    const mid = doc.createElement('div');
    mid.className = 'superdoc-compound-border-mid';
    const ms = mid.style;
    ms.position = 'absolute';
    ms.boxSizing = 'border-box';
    ms.pointerEvents = 'none';
    const tIn = midTop ? midTop.midOffset : 0;
    const lIn = midLeft ? midLeft.midOffset : 0;
    const bIn = midBottom ? midBottom.midOffset : 0;
    const rIn = midRight ? midRight.midOffset : 0;
    ms.left = `${x0 + lIn}px`;
    ms.top = `${y0 + tIn}px`;
    ms.width = `${x1 - x0 - lIn - rIn}px`;
    ms.height = `${y1 - y0 - tIn - bIn}px`;
    if (midTop) ms.borderTop = `${midTop.midRule}px solid ${midTop.color}`;
    if (midBottom) ms.borderBottom = `${midBottom.midRule}px solid ${midBottom.color}`;
    if (midLeft) ms.borderLeft = `${midLeft.midRule}px solid ${midLeft.color}`;
    if (midRight) ms.borderRight = `${midRight.midRule}px solid ${midRight.color}`;
    container.appendChild(mid);
  }
};

export const renderTableRow = (deps: TableRowRenderDependencies): void => {
  const {
    doc,
    container,
    rowIndex,
    y,
    rowMeasure,
    row,
    prevRow,
    prevRowMeasure,
    nextRow,
    rowOccupiedRightCol,
    separateBorders,
    totalRows,
    tableBorders,
    columnWidths,
    allRowHeights,
    tableIndent,
    isRtl,
    context,
    renderLine,
    captureLineSnapshot,
    renderDrawingContent,
    applySdtDataset,
    ancestorContainerKey,
    ancestorContainerSdt,
    ancestorContainerKeys,
    ancestorContainerSdts,
    onSdtContainerChrome,
    continuesFromPrev,
    continuesOnNext,
    partialRow,
    cellSpacingPx = 0,
    chrome,
    resolvePhysical,
  } = deps;

  const totalCols = columnWidths.length;

  // Structural row-level tracked change (inserted/deleted whole row). Reuses the
  // exact same metadata + painter helpers as inline tracked changes. The
  // tracked-changes MODE is threaded the same way inline runs get it: from a
  // ParagraphBlock's attrs (trackedChangesMode/trackedChangesEnabled) via
  // resolveTrackedChangesConfig. FragmentRenderContext carries no mode field, so
  // we resolve from a representative paragraph in this row's cells.
  const rowTrackedChange = row?.attrs?.trackedChange;
  let rowTrackedChangeConfig: TrackedChangesRenderConfig | undefined;
  if (rowTrackedChange) {
    let representativeParagraph: ParagraphBlock | undefined;
    for (const cell of row?.cells ?? []) {
      const candidate =
        cell.paragraph ?? (cell.blocks?.find((block) => block.kind === 'paragraph') as ParagraphBlock | undefined);
      if (candidate) {
        representativeParagraph = candidate;
        break;
      }
    }
    rowTrackedChangeConfig = representativeParagraph
      ? resolveTrackedChangesConfig(representativeParagraph)
      : { mode: 'review', enabled: true };
  }

  // Effective right grid edge for THIS row's border ownership. A row with a
  // trailing w:gridAfter reserves empty columns past its last cell (FWC forms do
  // this), so the rightmost real cell never reaches `totalCols` and the
  // single-owner model would drop the row's right border. Word draws the right
  // border at the rightmost cell, treating gridAfter columns as outside the box.
  // Use the last occupied column as the right edge; for rows without gridAfter
  // this equals totalCols (no change).
  // Prefer the rowspan-aware occupied width (counts cells spanning into this row via vMerge);
  // fall back to this row's own cells when the caller doesn't provide it. (SD-1797, SD-3345)
  const rowRightEdgeCol =
    rowOccupiedRightCol != null && rowOccupiedRightCol > 0
      ? Math.min(totalCols, rowOccupiedRightCol)
      : rowMeasure.cells.length
        ? Math.min(totalCols, Math.max(...rowMeasure.cells.map((c) => (c.gridColumnStart ?? 0) + (c.colSpan ?? 1))))
        : totalCols;

  // Row-level border override (OOXML w:tblPrEx/w:tblBorders, §17.4.61). When this
  // row carries its own borders, they override the table borders for this row only,
  // merged per edge so unspecified sides still inherit the table. Rows without an
  // override paint with the table borders unchanged (no behavior change).
  const rowBorderOverride = row?.attrs?.borders;
  const effectiveTableBorders: TableBorders | undefined = rowBorderOverride
    ? { ...(tableBorders ?? {}), ...rowBorderOverride }
    : tableBorders;

  // When the NEXT row carries a tblPrEx override that suppresses its shared horizontal edge
  // (insideH = none/nil), the lower cell — which owns that edge in the single-owner model —
  // won't draw it, and a table/style-derived border above (no cell tcBorder for the SD-2969
  // neighbor path to pick up) would be dropped. Per §17.4.66 a present border beats the
  // none, so THIS row must close the grid by drawing its own interior bottom. Gated on the
  // next row actually having an override, so unoverridden tables are unchanged (no doubling).
  // (SD-3028)
  const nextRowBorderOverride = nextRow?.attrs?.borders;
  const nextRowEffectiveInsideH = nextRowBorderOverride
    ? ({ ...(tableBorders ?? {}), ...nextRowBorderOverride } as TableBorders).insideH
    : undefined;
  const nextRowSuppressesSharedTop =
    nextRowBorderOverride !== undefined && !isPresentBorder(borderValueToSpec(nextRowEffectiveInsideH));

  /**
   * Calculates the horizontal position (x-coordinate) for a cell based on its grid column index.
   *
   * Sums the widths of all columns preceding the given column index plus spacing between
   * columns (border-spacing). When cellSpacingPx > 0, each column after the first is
   * offset by one spacing unit, so x = sum(columnWidths[0..gridColumnStart-1]) + gridColumnStart * cellSpacingPx.
   *
   * **Bounds Safety:**
   * Loop terminates at the minimum of `gridColumnStart` and `columnWidths.length`
   * to prevent out-of-bounds array access.
   *
   * @param gridColumnStart - Zero-based column index in the table grid
   * @returns Horizontal position in pixels from the left edge of the table
   *
   * @example
   * ```typescript
   * // columnWidths = [100, 150, 200], cellSpacingPx = 4
   * calculateXPosition(0) // Returns: cellSpacingPx (space before first column)
   * calculateXPosition(1) // Returns: cellSpacingPx + columnWidths[0] + cellSpacingPx
   * ```
   */
  const calculateXPosition = (gridColumnStart: number): number => {
    let x = cellSpacingPx; // space before first column
    for (let i = 0; i < gridColumnStart && i < columnWidths.length; i++) {
      x += columnWidths[i] + cellSpacingPx;
    }
    return x;
  };

  // Total table content width (for RTL mirroring)
  // RTL tables mirror cell X positions: rtlX = totalWidth - ltrX - cellWidth
  // (ECMA-376 §17.4.1: cells stored logically, displayed right-to-left)
  let tableContentWidth = 0;
  if (isRtl) {
    tableContentWidth = cellSpacingPx;
    for (let i = 0; i < columnWidths.length; i++) {
      tableContentWidth += columnWidths[i] + cellSpacingPx;
    }
  }

  /**
   * Calculates the total height for a cell that spans multiple rows (rowspan).
   *
   * Sums the heights of consecutive rows starting from `startRowIndex` up to
   * the number of rows specified by `rowSpan`. This determines the vertical
   * size needed to render a cell that merges multiple rows.
   *
   * **Bounds Safety:**
   * Loop checks both rowSpan count and array bounds to prevent accessing
   * non-existent rows.
   *
   * @param startRowIndex - Zero-based index of the first row in the span
   * @param rowSpan - Number of rows the cell spans (typically >= 1)
   * @returns Total height in pixels for the cell
   *
   * @example
   * ```typescript
   * // allRowHeights = [50, 60, 70, 80]
   * calculateRowspanHeight(0, 1) // Returns: 50 (single row)
   * calculateRowspanHeight(0, 2) // Returns: 110 (rows 0 and 1)
   * calculateRowspanHeight(1, 3) // Returns: 210 (rows 1, 2, and 3)
   * calculateRowspanHeight(3, 5) // Returns: 80 (safe - only row 3 exists)
   * ```
   */
  const calculateRowspanHeight = (startRowIndex: number, rowSpan: number): number => {
    let totalHeight = 0;
    for (let i = 0; i < rowSpan && startRowIndex + i < allRowHeights.length; i++) {
      totalHeight += allRowHeights[startRowIndex + i];
    }
    return totalHeight;
  };

  const calculateColspanWidth = (gridColumnStart: number, colSpan: number): number => {
    let width = 0;
    for (let i = gridColumnStart; i < gridColumnStart + colSpan && i < columnWidths.length; i++) {
      width += columnWidths[i];
    }
    return width;
  };

  // Find the borders of the cell in `cells` that occupies grid column `gridCol`, using
  // the row's measure to map cell index → grid span (handles colspan). Used to fetch the
  // above/left neighbor's borders for §17.4.66 collapsed-border conflict resolution.
  const findCellBordersAtColumn = (
    cells: TableRow['cells'] | undefined,
    measureCells: TableRowMeasure['cells'] | undefined,
    gridCol: number,
  ): CellBorders | undefined => {
    if (!cells || !measureCells) return undefined;
    for (let i = 0; i < measureCells.length; i++) {
      const start = measureCells[i].gridColumnStart ?? i;
      const span = measureCells[i].colSpan ?? 1;
      if (gridCol >= start && gridCol < start + span) return cells[i]?.attrs?.borders;
    }
    return undefined;
  };

  for (let cellIndex = 0; cellIndex < rowMeasure.cells.length; cellIndex += 1) {
    const cellMeasure = rowMeasure.cells[cellIndex];
    const cell = row?.cells?.[cellIndex];
    const gridColumnStart = cellMeasure.gridColumnStart ?? cellIndex;
    const rowSpan = cellMeasure.rowSpan ?? 1;
    const colSpan = cellMeasure.colSpan ?? 1;

    // Calculate x position from gridColumnStart if available, otherwise fallback
    let x = calculateXPosition(gridColumnStart);

    // Check if cell has any border attribute at all (even if empty - empty means "no borders")
    const cellBordersAttr = cell?.attrs?.borders;
    const hasBordersAttribute = cellBordersAttr !== undefined;

    // For RTL tables, swap left↔right edge detection so borders mirror correctly
    // (ECMA-376 Part 4 §14.3.1–14.3.8: left/right borders and margins swap for bidiVisual)
    const cellPosition: TableCellGridPosition = {
      rowIndex,
      rowSpan,
      gridColumnStart,
      colSpan,
      totalRows,
      // Use the row's effective right edge so the rightmost cell owns the right
      // border even when trailing w:gridAfter columns pad the grid (§17.4.55).
      totalCols: rowRightEdgeCol,
    };

    // Neighbor borders for §17.4.66 collapsed-border conflict resolution: the cell above
    // (previous row, same grid column) and the cell to the left (same row, previous column).
    const aboveCellBorders = findCellBordersAtColumn(prevRow?.cells, prevRowMeasure?.cells, gridColumnStart);
    const leftCellBorders =
      gridColumnStart > 0 ? findCellBordersAtColumn(row?.cells, rowMeasure.cells, gridColumnStart - 1) : undefined;
    // The cell to the right (same row, the column just past this cell's span) — used to keep
    // an asymmetric vertical edge on the owning cell instead of moving it to the neighbor.
    const rightCellBorders = findCellBordersAtColumn(row?.cells, rowMeasure.cells, gridColumnStart + colSpan);

    // Resolve borders using logical positions, then swap output for RTL.
    // The resolver uses touchesLeftEdge/touchesRightEdge which are LOGICAL edges.
    // For RTL, logical left = visual right, so we swap the resolved CSS properties
    // so borderLeft/borderRight match the correct visual edges.
    const resolvedBorders = resolveRenderedCellBorders({
      cellBorders: cellBordersAttr,
      hasBordersAttribute,
      tableBorders: effectiveTableBorders,
      cellPosition,
      cellSpacingPx,
      continuesFromPrev: continuesFromPrev === true,
      continuesOnNext: continuesOnNext === true,
      aboveCellBorders,
      leftCellBorders,
      rightCellBorders,
      separateBorders,
      nextRowSuppressesSharedTop,
    });
    // RTL: swap resolved left↔right so CSS properties match visual edges
    const finalBorders = isRtl && resolvedBorders ? swapCellBordersLR(resolvedBorders) : resolvedBorders;
    // Separate-borders mode: outset/inset cells render sunken (the legacy HTML table look) —
    // visual top/left dark, bottom/right light; inset mirrors. Toned after the RTL swap so the
    // lighting follows VISUAL sides. Other styles pass through unchanged. (SD-3028, 300dpi probes)
    const tonedBorders =
      separateBorders && finalBorders
        ? {
            top: bevelToneSpec(finalBorders.top, 'top', 'cell'),
            right: bevelToneSpec(finalBorders.right, 'right', 'cell'),
            bottom: bevelToneSpec(finalBorders.bottom, 'bottom', 'cell'),
            left: bevelToneSpec(finalBorders.left, 'left', 'cell'),
          }
        : finalBorders;

    // Calculate cell height - use rowspan height if cell spans multiple rows
    // For partial rows, use the partial height instead
    let cellHeight: number;
    if (partialRow) {
      // Use partial row height for mid-row splits
      cellHeight = partialRow.partialHeight;
    } else if (rowSpan > 1) {
      cellHeight = calculateRowspanHeight(rowIndex, rowSpan);
    } else {
      cellHeight = rowMeasure.height;
    }

    // Get per-cell line range for partial row rendering
    const fromLine = partialRow?.fromLineByCell?.[cellIndex];
    const toLine = partialRow?.toLineByCell?.[cellIndex];

    // Compute cell width from rescaled columnWidths (SD-1859: mixed-orientation docs
    // where cellMeasure.width may reflect landscape measurement but the fragment renders
    // in portrait). The columnWidths array is already rescaled by the layout engine.
    const computedCellWidth = calculateColspanWidth(gridColumnStart, colSpan);

    // RTL: mirror x position so first logical column appears on the right
    if (isRtl && computedCellWidth > 0) {
      x = tableContentWidth - x - computedCellWidth;
    }

    const cellGridBounds = getTableCellGridBounds(cellPosition);
    // A cell whose `borders` attribute is present but clears every side is intentionally
    // borderless: `resolveRenderedCellBorders` returns undefined for it (no CSS border).
    // The compound-rectangle path must honor that too, or `appendCompoundBorderRects` would
    // draw the table's double/triple rules onto a cell that explicitly cleared its borders.
    // Yield no effective sides so it paints nothing. (SD-3308 review)
    const cellIsIntentionallyBorderless = hasBordersAttribute && !hasExplicitCellBorders(cellBordersAttr);
    // Word's double model needs the EFFECTIVE border of every side of this cell,
    // not the single-owner-suppressed set: ownership picks which band face the rule
    // sits on, but every surrounding double edge contributes a side to this cell's
    // rectangle. (SD-3308)
    const cb = (cellBordersAttr ?? {}) as CellBorders;
    const effectiveSideSpecs: CellBorders = cellIsIntentionallyBorderless
      ? {}
      : {
          top:
            cellGridBounds.touchesTopEdge || continuesFromPrev === true
              ? resolveTableBorderValue(cb.top, effectiveTableBorders?.top)
              : (resolveBorderConflict(cb.top, aboveCellBorders?.bottom) ??
                borderValueToSpec(effectiveTableBorders?.insideH)),
          bottom:
            cellGridBounds.touchesBottomEdge || continuesOnNext === true
              ? resolveTableBorderValue(cb.bottom, effectiveTableBorders?.bottom)
              : (resolveBorderConflict(cb.bottom, undefined) ?? borderValueToSpec(effectiveTableBorders?.insideH)),
          left: cellGridBounds.touchesLeftEdge
            ? resolveTableBorderValue(cb.left, effectiveTableBorders?.left)
            : (resolveBorderConflict(cb.left, leftCellBorders?.right) ??
              borderValueToSpec(effectiveTableBorders?.insideV)),
          right: cellGridBounds.touchesRightEdge
            ? resolveTableBorderValue(cb.right, effectiveTableBorders?.right)
            : (resolveBorderConflict(cb.right, rightCellBorders?.left) ??
              borderValueToSpec(effectiveTableBorders?.insideV)),
        };
    const rectBorders = (isRtl ? swapCellBordersLR(effectiveSideSpecs) : effectiveSideSpecs) ?? effectiveSideSpecs;

    // Visual (post-RTL-swap) boundary flags matching rectBorders sides.
    const visualTouchesLeft = isRtl ? cellGridBounds.touchesRightEdge : cellGridBounds.touchesLeftEdge;
    const visualTouchesRight = isRtl ? cellGridBounds.touchesLeftEdge : cellGridBounds.touchesRightEdge;

    // Interior vertical compound bands straddle the gridline (Word model, measured
    // from the triple probes: the divider spans gridline -band/2 .. +band/2 and both
    // cells keep equal content widths). Each adjacent cell carries HALF the band as
    // its transparent CSS border, so the painted geometry and the column's half-band
    // allowance agree. Boundary bands stay fully inside the cell. (SD-3308)
    const leftStraddleProfile = !visualTouchesLeft && rectBorders.left ? getBorderBandProfile(rectBorders.left) : null;
    const rightStraddleProfile =
      !visualTouchesRight && rectBorders.right ? getBorderBandProfile(rectBorders.right) : null;
    let paintBorders = tonedBorders;
    let borderBandOverridesPx: { left?: number; right?: number } | undefined;
    if (leftStraddleProfile || rightStraddleProfile) {
      paintBorders = { ...(tonedBorders ?? {}) };
      borderBandOverridesPx = {};
      if (leftStraddleProfile) {
        paintBorders.left = rectBorders.left;
        borderBandOverridesPx.left = leftStraddleProfile.band / 2;
      }
      if (rightStraddleProfile) {
        paintBorders.right = rectBorders.right;
        borderBandOverridesPx.right = rightStraddleProfile.band / 2;
      }
    }

    // Never use default borders - cells are either explicitly styled or borderless
    // This prevents gray borders on cells with borders={} (intentionally borderless)
    const { cellElement } = renderTableCell({
      doc,
      x,
      y,
      rowHeight: cellHeight,
      cellMeasure,
      cell,
      borders: paintBorders,
      borderBandOverridesPx,
      useDefaultBorder: false,
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
      fromLine,
      toLine,
      tableIndent,
      isRtl,
      cellWidth: computedCellWidth > 0 ? computedCellWidth : undefined,
      chrome,
      resolvePhysical,
    });

    // Paint the structural row-level tracked change onto each cell element of
    // the row (no <tr> exists in the painted DOM), reusing the inline helpers.
    if (rowTrackedChange && rowTrackedChangeConfig) {
      applyRowTrackedChangeToCell(cellElement, rowTrackedChange, rowTrackedChangeConfig);
    }

    container.appendChild(cellElement);

    // Table-level 3-rule bands paint their middle layer as a continuous fragment
    // grid (see renderTableFragment); suppress the per-cell middle rectangle there.
    const tableProvidesMid = (value: unknown): boolean => {
      const profile = value != null && typeof value === 'object' ? getBorderBandProfile(value as never) : null;
      return profile != null && profile.segments.length === 5;
    };
    const suppressMid = {
      top: tableProvidesMid(
        cellGridBounds.touchesTopEdge || continuesFromPrev === true
          ? effectiveTableBorders?.top
          : effectiveTableBorders?.insideH,
      ),
      bottom: tableProvidesMid(
        cellGridBounds.touchesBottomEdge || continuesOnNext === true
          ? effectiveTableBorders?.bottom
          : effectiveTableBorders?.insideH,
      ),
      left: tableProvidesMid(
        visualTouchesLeft
          ? isRtl
            ? effectiveTableBorders?.right
            : effectiveTableBorders?.left
          : effectiveTableBorders?.insideV,
      ),
      right: tableProvidesMid(
        visualTouchesRight
          ? isRtl
            ? effectiveTableBorders?.left
            : effectiveTableBorders?.right
          : effectiveTableBorders?.insideV,
      ),
    };

    appendCompoundBorderRects(
      doc,
      container,
      cellElement,
      rectBorders,
      {
        x,
        y,
        width: computedCellWidth > 0 ? computedCellWidth : (cellMeasure.width ?? 0),
        height: cellHeight,
      },
      {
        ownsBottomBand: cellGridBounds.touchesBottomEdge || continuesOnNext === true,
        rightIsBoundary: visualTouchesRight,
        leftIsBoundary: visualTouchesLeft,
        suppressMid,
      },
    );
  }
};
