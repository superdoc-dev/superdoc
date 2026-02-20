import type {
  DrawingBlock,
  Fragment,
  Line,
  ParagraphBlock,
  SdtMetadata,
  TableBlock,
  TableFragment,
  TableMeasure,
} from '@superdoc/contracts';
import { CLASS_NAMES, fragmentStyles } from '../styles.js';
import { DOM_CLASS_NAMES } from '../constants.js';
import type { FragmentRenderContext, BlockLookup } from '../renderer.js';
import { renderTableRow } from './renderTableRow.js';
import { applySdtContainerStyling, type SdtBoundaryOptions } from '../utils/sdt-helpers.js';
import { applyBorder, borderValueToSpec } from './border-utils.js';

type ApplyStylesFn = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>) => void;

/**
 * Dependencies required for rendering a table fragment.
 *
 * Encapsulates all external dependencies needed to render a table, including
 * document access, rendering context, block lookup, and helper functions.
 */
export type TableRenderDependencies = {
  /** Document object for creating DOM elements */
  doc: Document;
  /** Table fragment to render (contains dimensions and row range) */
  fragment: TableFragment;
  /** Rendering context (section info, etc.) */
  context: FragmentRenderContext;
  /** Lookup map for retrieving block data and measurements */
  blockLookup: BlockLookup;
  /** Optional SDT boundary overrides for container styling */
  sdtBoundary?: SdtBoundaryOptions;
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
  /** Function to apply fragment positioning and dimensions */
  applyFragmentFrame: (el: HTMLElement, fragment: Fragment) => void;
  /** Function to apply SDT metadata as data attributes */
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  /** Function to apply container SDT metadata as data attributes */
  applyContainerSdtDataset?: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  /** Function to apply CSS styles to an element */
  applyStyles: ApplyStylesFn;
};

/**
 * Renders a table fragment as a DOM element.
 *
 * Creates a container div with absolutely-positioned rows and cells. Handles:
 * - Table border overlays for outer borders
 * - Border collapse settings
 * - Cell spacing
 * - Row-by-row rendering with proper positioning
 * - Metadata embedding for interactive table resizing
 *
 * **Error Handling:**
 * If the table block cannot be found or is invalid, returns an error placeholder
 * element instead of throwing. This maintains rendering stability when:
 * - Block is missing from blockLookup
 * - Block is wrong kind (not 'table')
 * - Measure is wrong kind (not 'table')
 * - Document object is not available
 *
 * **SDT Container Styling:**
 * If the table block has SDT metadata (`block.attrs?.sdt`), applies appropriate
 * container styling via `applySdtContainerStyling()`:
 * - Document sections: Gray border with hover tooltip
 * - Structured content blocks: Blue border with label
 * Uses type-safe helper functions to avoid unsafe type assertions.
 *
 * **Metadata Embedding:**
 * Embeds column boundary metadata in the `data-table-boundaries` attribute
 * using a compact JSON format:
 * ```json
 * {
 *   "columns": [
 *     {"i": 0, "x": 0, "w": 100, "min": 25, "r": 1},
 *     {"i": 1, "x": 100, "w": 150, "min": 30, "r": 1}
 *   ]
 * }
 * ```
 * Where: i=index, x=position, w=width, min=minWidth, r=resizable(0/1)
 *
 * **Edge Cases:**
 * - Missing metadata: Element created without data-table-boundaries attribute
 * - Empty columnBoundaries: Creates empty columns array in JSON
 * - Missing block ID: Element created without data-sd-block-id attribute
 *
 * @param deps - All dependencies required for rendering
 * @returns HTMLElement containing the rendered table fragment, or error placeholder
 *
 * @example
 * ```typescript
 * const tableElement = renderTableFragment({
 *   doc: document,
 *   fragment: tableFragment,
 *   context: renderContext,
 *   blockLookup: blocks,
 *   renderLine,
 *   applyFragmentFrame,
 *   applySdtDataset,
 *   applyStyles
 * });
 * container.appendChild(tableElement);
 * ```
 */
export const renderTableFragment = (deps: TableRenderDependencies): HTMLElement => {
  const {
    doc,
    fragment,
    blockLookup,
    context,
    sdtBoundary,
    renderLine,
    captureLineSnapshot,
    renderDrawingContent,
    applyFragmentFrame,
    applySdtDataset,
    applyContainerSdtDataset,
    applyStyles,
  } = deps;

  // Check document first before using it in error handlers
  if (!doc) {
    console.error('DomPainter: document is not available');

    // Use global document as fallback for error placeholder when available
    if (typeof document !== 'undefined') {
      const placeholder = document.createElement('div');
      placeholder.classList.add(CLASS_NAMES.fragment, 'superdoc-error-placeholder');
      placeholder.textContent = '[Document not available]';
      placeholder.style.border = '1px dashed red';
      placeholder.style.padding = '8px';
      return placeholder;
    }

    throw new Error('Document is required for table rendering');
  }

  const lookup = blockLookup.get(fragment.blockId);
  if (!lookup || lookup.block.kind !== 'table' || lookup.measure.kind !== 'table') {
    console.error(`DomPainter: missing table block for fragment ${fragment.blockId}`, {
      blockId: fragment.blockId,
      lookup: lookup ? { kind: lookup.block.kind } : null,
    });

    // Return placeholder element instead of crashing (doc is guaranteed to exist here)
    const placeholder = doc.createElement('div');
    placeholder.classList.add(CLASS_NAMES.fragment, 'superdoc-error-placeholder');
    placeholder.textContent = '[Table rendering error]';
    placeholder.style.border = '1px dashed red';
    placeholder.style.padding = '8px';
    return placeholder;
  }

  const block = lookup.block as TableBlock;
  const measure = lookup.measure as TableMeasure;
  // Use per-fragment rescaled column widths when available (SD-1859: mixed-orientation docs
  // where measurement width differs from section width). Falls back to measured widths.
  const effectiveColumnWidths = fragment.columnWidths ?? measure.columnWidths;
  const tableBorders = block.attrs?.borders;
  const tableIndentValue = (block.attrs?.tableIndent as { width?: unknown } | null | undefined)?.width;
  const tableIndent = typeof tableIndentValue === 'number' && Number.isFinite(tableIndentValue) ? tableIndentValue : 0;
  // Note: We don't use createTableBorderOverlay because we implement single-owner
  // border model where cells handle all borders (including outer table borders)
  // to prevent double borders when rendering with absolutely-positioned divs.

  const container = doc.createElement('div');
  container.classList.add(CLASS_NAMES.fragment);
  applyStyles(container, fragmentStyles);
  applyFragmentFrame(container, fragment);
  container.style.height = `${fragment.height}px`;
  applySdtDataset(container, block.attrs?.sdt);
  applyContainerSdtDataset?.(container, block.attrs?.containerSdt);

  // Apply SDT container styling (document sections, structured content blocks)
  applySdtContainerStyling(doc, container, block.attrs?.sdt, block.attrs?.containerSdt, sdtBoundary);

  // Add table-specific class for resize overlay targeting and click mapping
  container.classList.add(DOM_CLASS_NAMES.TABLE_FRAGMENT);

  // Add metadata for interactive table resizing
  if (fragment.metadata?.columnBoundaries) {
    // Build row-aware boundary segments scoped to THIS fragment's rows.
    // When a table splits across pages, each fragment only renders a subset of rows
    // (repeated headers + body rows from fromRow to toRow). Segments must match
    // exactly the rendered rows so resize handles don't overflow the fragment.
    const columnCount = effectiveColumnWidths.length;

    // boundarySegments[colIndex] = array of {fromRow, toRow, y, height} segments where this boundary exists
    const boundarySegments: Array<Array<{ fromRow: number; toRow: number; y: number; height: number }>> = [];
    for (let i = 0; i < columnCount; i++) {
      boundarySegments.push([]);
    }

    // Build the list of rows actually rendered in this fragment, matching the
    // rendering order: repeated headers first, then body rows.
    // NOTE: This header-then-body iteration must stay in sync with the rendering
    // loop below (~line 315) which uses the same order to render row elements.
    const renderedRows: Array<{ rowIndex: number; height: number }> = [];

    // Repeated header rows (only on continuation fragments)
    if (fragment.repeatHeaderCount && fragment.repeatHeaderCount > 0) {
      for (let r = 0; r < fragment.repeatHeaderCount; r++) {
        const rowMeasure = measure.rows[r];
        if (!rowMeasure) break;
        renderedRows.push({ rowIndex: r, height: rowMeasure.height });
      }
    }

    // Body rows (fromRow to toRow), with partial row height for mid-row splits
    for (let r = fragment.fromRow; r < fragment.toRow; r++) {
      const rowMeasure = measure.rows[r];
      if (!rowMeasure) break;
      const isPartialRow = fragment.partialRow && fragment.partialRow.rowIndex === r;
      const actualHeight = isPartialRow ? fragment.partialRow!.partialHeight : rowMeasure.height;
      renderedRows.push({ rowIndex: r, height: actualHeight });
    }

    // For each rendered row, determine which grid columns have cell boundaries
    // A boundary exists at column X if there's a cell that ENDS at column X (gridColumnStart + colSpan = X)
    let rowY = 0;
    for (let i = 0; i < renderedRows.length; i++) {
      const { rowIndex, height } = renderedRows[i];
      const rowMeasure = measure.rows[rowIndex];
      if (!rowMeasure) continue;

      // Track which column boundaries exist in this row
      const boundariesInRow = new Set<number>();

      for (const cellMeasure of rowMeasure.cells) {
        const startCol = cellMeasure.gridColumnStart ?? 0;
        const colSpan = cellMeasure.colSpan ?? 1;
        const endCol = startCol + colSpan;

        // A cell creates boundaries at its start and end columns
        // Start boundary (left edge of cell)
        if (startCol > 0) {
          boundariesInRow.add(startCol);
        }
        // End boundary (right edge of cell)
        if (endCol < columnCount) {
          boundariesInRow.add(endCol);
        }
      }

      // For each boundary that exists in this row, extend or create a segment
      for (const boundaryCol of boundariesInRow) {
        const segments = boundarySegments[boundaryCol];
        const lastSegment = segments[segments.length - 1];

        // If the last segment ends at the previous rendered row, extend it
        if (lastSegment && i > 0 && lastSegment.toRow === i) {
          lastSegment.toRow = i + 1;
          lastSegment.height += height;
        } else {
          // Start a new segment
          segments.push({
            fromRow: i,
            toRow: i + 1,
            y: rowY,
            height,
          });
        }
      }

      rowY += height;
    }

    const metadata = {
      columns: fragment.metadata.columnBoundaries.map((boundary) => ({
        i: boundary.index,
        x: boundary.x,
        w: boundary.width,
        min: boundary.minWidth,
        r: boundary.resizable ? 1 : 0,
      })),
      // Add segments for each column boundary (segments where resize handle should appear)
      segments: boundarySegments.map((segs, colIndex) =>
        segs.map((seg) => ({
          c: colIndex, // column index
          y: seg.y, // y position
          h: seg.height, // height of segment
        })),
      ),
    };

    container.setAttribute('data-table-boundaries', JSON.stringify(metadata));
  }

  // Add block ID for PM transaction targeting
  if (block.id) {
    container.setAttribute('data-sd-block-id', block.id);
  }

  const borderCollapse = block.attrs?.borderCollapse || 'collapse';
  if (borderCollapse === 'separate' && block.attrs?.cellSpacing) {
    container.style.borderSpacing = `${block.attrs.cellSpacing}px`;
  }

  // Pre-calculate all row heights for rowspan calculations
  // IMPORTANT: If this fragment has a partial row, we need to use the partial height
  // for that row, not the full measured height. This ensures rowspan cells that
  // extend into the partial row are sized correctly for this fragment.
  const allRowHeights: number[] = measure.rows.map((r, idx: number) => {
    if (fragment.partialRow && fragment.partialRow.rowIndex === idx) {
      // Use partial height for the split row
      return fragment.partialRow.partialHeight;
    }
    return r?.height ?? 0;
  });

  let y = 0;

  // If this is a continuation fragment with repeated headers, render headers first.
  // NOTE: This header-then-body iteration must stay in sync with the metadata
  // segment builder above (~line 199) which uses the same order.
  if (fragment.repeatHeaderCount && fragment.repeatHeaderCount > 0) {
    for (let r = 0; r < fragment.repeatHeaderCount; r += 1) {
      const rowMeasure = measure.rows[r];
      if (!rowMeasure) break;
      renderTableRow({
        doc,
        container,
        rowIndex: r,
        y,
        rowMeasure,
        row: block.rows[r],
        totalRows: block.rows.length,
        tableBorders,
        columnWidths: effectiveColumnWidths,
        allRowHeights,
        tableIndent,
        context,
        renderLine,
        captureLineSnapshot,
        renderDrawingContent,
        applySdtDataset,
        tableSdt: block.attrs?.sdt ?? null,
        // Headers are always rendered as-is (no border suppression)
        continuesFromPrev: false,
        continuesOnNext: false,
      });
      y += rowMeasure.height;
    }
  }

  // Render rowspan continuation cells ("ghost cells")
  // When a table continues from a previous fragment, some grid columns in the
  // first body rows may be occupied by rowspan cells that started on a previous page.
  // Create empty cells to maintain table structure and borders (matching Word behavior).
  if (fragment.continuesFromPrev && fragment.fromRow > 0) {
    const repeatCount = fragment.repeatHeaderCount ?? 0;

    for (let r = repeatCount; r < fragment.fromRow; r++) {
      const srcRowMeasure = measure.rows[r];
      if (!srcRowMeasure) continue;

      for (let ci = 0; ci < srcRowMeasure.cells.length; ci++) {
        const srcCellMeasure = srcRowMeasure.cells[ci];
        const rowSpan = srcCellMeasure.rowSpan ?? 1;
        if (rowSpan <= 1) continue;

        const spanEndRow = r + rowSpan;
        if (spanEndRow <= fragment.fromRow) continue;

        // This cell's rowspan extends into this fragment's body rows
        const gridCol = srcCellMeasure.gridColumnStart ?? 0;
        const colSpan = srcCellMeasure.colSpan ?? 1;

        // Calculate x position (sum of columns before gridCol)
        let ghostX = 0;
        for (let i = 0; i < gridCol && i < effectiveColumnWidths.length; i++) {
          ghostX += effectiveColumnWidths[i];
        }

        // Calculate width (sum of spanned columns)
        let ghostWidth = 0;
        for (let i = gridCol; i < gridCol + colSpan && i < effectiveColumnWidths.length; i++) {
          ghostWidth += effectiveColumnWidths[i];
        }

        // Calculate height: from fromRow to min(spanEndRow, toRow)
        const effectiveEnd = Math.min(spanEndRow, fragment.toRow);
        let ghostHeight = 0;
        for (let ri = fragment.fromRow; ri < effectiveEnd; ri++) {
          ghostHeight += allRowHeights[ri] ?? 0;
        }

        if (ghostWidth <= 0 || ghostHeight <= 0) continue;

        // Create ghost cell
        const ghostDiv = doc.createElement('div');
        ghostDiv.style.position = 'absolute';
        ghostDiv.style.left = `${ghostX}px`;
        ghostDiv.style.top = `${y}px`;
        ghostDiv.style.width = `${ghostWidth}px`;
        ghostDiv.style.height = `${ghostHeight}px`;
        ghostDiv.style.boxSizing = 'border-box';
        ghostDiv.style.overflow = 'hidden';

        // Resolve borders for the ghost cell
        const srcCell = block.rows[r]?.cells?.[ci];
        const cellBordersAttr = srcCell?.attrs?.borders;
        const hasExplicitBorders =
          cellBordersAttr &&
          (cellBordersAttr.top !== undefined ||
            cellBordersAttr.right !== undefined ||
            cellBordersAttr.bottom !== undefined ||
            cellBordersAttr.left !== undefined);
        const isFirstCol = gridCol === 0;
        const isLastCol = gridCol + colSpan >= effectiveColumnWidths.length;

        if (hasExplicitBorders && tableBorders) {
          // Use cell's borders, with table top border for continuation
          applyBorder(ghostDiv, 'Top', cellBordersAttr.top ?? borderValueToSpec(tableBorders.top));
          applyBorder(
            ghostDiv,
            'Left',
            cellBordersAttr.left ?? borderValueToSpec(isFirstCol ? tableBorders.left : tableBorders.insideV),
          );
          applyBorder(
            ghostDiv,
            'Right',
            cellBordersAttr.right ?? borderValueToSpec(isLastCol ? tableBorders.right : tableBorders.insideV),
          );
          if (effectiveEnd <= fragment.toRow && spanEndRow <= fragment.toRow) {
            applyBorder(ghostDiv, 'Bottom', cellBordersAttr.bottom ?? borderValueToSpec(tableBorders.insideH));
          }
        } else if (tableBorders) {
          // Resolve from table borders
          applyBorder(ghostDiv, 'Top', borderValueToSpec(tableBorders.top));
          applyBorder(ghostDiv, 'Left', borderValueToSpec(isFirstCol ? tableBorders.left : tableBorders.insideV));
          applyBorder(ghostDiv, 'Right', borderValueToSpec(isLastCol ? tableBorders.right : tableBorders.insideV));
          if (effectiveEnd <= fragment.toRow && spanEndRow <= fragment.toRow) {
            applyBorder(ghostDiv, 'Bottom', borderValueToSpec(tableBorders.insideH));
          }
        }

        // Apply cell background if present
        if (srcCell?.attrs?.background) {
          ghostDiv.style.backgroundColor = srcCell.attrs.background;
        }

        container.appendChild(ghostDiv);
      }
    }
  }

  // Render body rows (fromRow to toRow)
  for (let r = fragment.fromRow; r < fragment.toRow; r += 1) {
    const rowMeasure = measure.rows[r];
    if (!rowMeasure) break;

    const isFirstRenderedBodyRow = r === fragment.fromRow;
    const isLastRenderedBodyRow = r === fragment.toRow - 1;

    // Check if this row has partial row data (mid-row split)
    const isPartialRow = fragment.partialRow && fragment.partialRow.rowIndex === r;
    const partialRowData = isPartialRow ? fragment.partialRow : undefined;
    const actualRowHeight = partialRowData ? partialRowData.partialHeight : rowMeasure.height;

    renderTableRow({
      doc,
      container,
      rowIndex: r,
      y,
      rowMeasure,
      row: block.rows[r],
      totalRows: block.rows.length,
      tableBorders,
      columnWidths: effectiveColumnWidths,
      allRowHeights,
      tableIndent,
      context,
      renderLine,
      captureLineSnapshot,
      renderDrawingContent,
      applySdtDataset,
      tableSdt: block.attrs?.sdt ?? null,
      // Draw top border if table continues from previous fragment (MS Word behavior)
      continuesFromPrev: isFirstRenderedBodyRow && fragment.continuesFromPrev === true,
      // Draw bottom border if table continues on next fragment (MS Word behavior)
      continuesOnNext: isLastRenderedBodyRow && fragment.continuesOnNext === true,
      // Pass partial row data for mid-row splits
      partialRow: partialRowData,
    });
    y += actualRowHeight;
  }

  return container;
};
