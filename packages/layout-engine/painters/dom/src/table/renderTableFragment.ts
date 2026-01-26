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
import type { FragmentRenderContext, BlockLookup } from '../renderer.js';
import { renderTableRow } from './renderTableRow.js';
import { applySdtContainerStyling, type SdtBoundaryOptions } from '../utils/sdt-helpers.js';

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
  /** Function to render drawing content (images, shapes, shape groups) */
  renderDrawingContent?: (block: DrawingBlock) => HTMLElement;
  /** Function to apply fragment positioning and dimensions */
  applyFragmentFrame: (el: HTMLElement, fragment: Fragment) => void;
  /** Function to apply SDT metadata as data attributes */
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
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
    renderDrawingContent,
    applyFragmentFrame,
    applySdtDataset,
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

  // Apply SDT container styling (document sections, structured content blocks)
  applySdtContainerStyling(doc, container, block.attrs?.sdt, block.attrs?.containerSdt, sdtBoundary);

  // Add table-specific class for resize overlay targeting
  container.classList.add('superdoc-table-fragment');

  // Add metadata for interactive table resizing
  if (fragment.metadata?.columnBoundaries) {
    // Build row-aware boundary segments
    // For each grid column boundary, track which row ranges have actual cell edges there
    const columnCount = measure.columnWidths.length;
    const rowCount = block.rows.length;

    // boundarySegments[colIndex] = array of {fromRow, toRow, y, height} segments where this boundary exists
    const boundarySegments: Array<Array<{ fromRow: number; toRow: number; y: number; height: number }>> = [];
    for (let i = 0; i < columnCount; i++) {
      boundarySegments.push([]);
    }

    // For each row, determine which grid columns have cell boundaries
    // A boundary exists at column X if there's a cell that ENDS at column X (gridColumnStart + colSpan = X)
    let rowY = 0;
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
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

        // If the last segment ends at this row, extend it
        if (lastSegment && lastSegment.toRow === rowIndex) {
          lastSegment.toRow = rowIndex + 1;
          lastSegment.height += rowMeasure.height;
        } else {
          // Start a new segment
          segments.push({
            fromRow: rowIndex,
            toRow: rowIndex + 1,
            y: rowY,
            height: rowMeasure.height,
          });
        }
      }

      rowY += rowMeasure.height;
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

  // If this is a continuation fragment with repeated headers, render headers first
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
        columnWidths: measure.columnWidths,
        allRowHeights,
        tableIndent,
        context,
        renderLine,
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
      columnWidths: measure.columnWidths,
      allRowHeights,
      tableIndent,
      context,
      renderLine,
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
