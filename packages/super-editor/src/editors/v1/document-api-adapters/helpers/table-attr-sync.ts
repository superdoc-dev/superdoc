import { eighthPointsToPixels, twipsToPixels } from '../../core/super-converter/helpers.js';
import { cloneBorders, mapBorderSizes } from '../../extensions/table/tableHelpers/border-utils.js';

/**
 * Derives the promoted table node attrs that pm-adapter reads at runtime.
 *
 * The importer performs the same extraction when decoding OOXML table properties.
 * Any write path that mutates `tableProperties` on a table node must mirror that
 * extraction so rendering observes the new values immediately instead of waiting
 * for a re-import cycle.
 *
 * @param tp - Canonical nested table properties stored on the ProseMirror table node.
 * @returns Promoted attrs that should be spread onto the same table node.
 */
export function syncExtractedTableAttrs(tp: Record<string, unknown>): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};

  extracted.tableStyleId = tp.tableStyleId ?? null;
  extracted.justification = tp.justification ?? null;
  extracted.tableLayout = tp.tableLayout ?? null;
  // Keep the PM schema default shape ({}) when no borders are present. The table
  // extension's renderDOM calls Object.keys(borders), which crashes on null.
  // Table properties store OOXML sizes in eighth-points, while promoted table
  // attrs are consumed as pixels by the PM adapter/layout pipeline.
  extracted.borders = convertTableBordersToPixelUnits(tp.borders) ?? {};

  const indent = tp.tableIndent as { value?: number; type?: string } | undefined;
  if (indent?.value != null) {
    extracted.tableIndent = {
      width: twipsToPixels(indent.value),
      type: indent.type,
    };
  } else {
    extracted.tableIndent = null;
  }

  const spacing = tp.tableCellSpacing as { value?: number; type?: string } | undefined;
  if (spacing?.value != null) {
    extracted.tableCellSpacing = {
      value: twipsToPixels(spacing.value),
      type: spacing.type ?? 'dxa',
    };
    extracted.borderCollapse = 'separate';
  } else {
    extracted.tableCellSpacing = null;
    extracted.borderCollapse = null;
  }

  const width = tp.tableWidth as { value?: number; type?: string } | undefined;
  if (width) {
    if (width.type === 'pct' && typeof width.value === 'number') {
      extracted.tableWidth = { value: width.value, type: 'pct' };
    } else if (width.type === 'auto') {
      extracted.tableWidth = { width: 0, type: 'auto' };
    } else if (width.value != null) {
      const widthPx = twipsToPixels(width.value);
      extracted.tableWidth = widthPx != null ? { width: widthPx, type: width.type } : null;
    } else {
      extracted.tableWidth = null;
    }
  } else {
    extracted.tableWidth = null;
  }

  return extracted;
}

function convertTableBordersToPixelUnits(value: unknown): Record<string, unknown> | undefined {
  const clone = cloneBorders(value);
  if (!clone || Object.keys(clone).length === 0) return undefined;
  mapBorderSizes(clone, eighthPointsToPixels);
  return Object.keys(clone).length > 0 ? clone : undefined;
}

/**
 * Builds the canonical table attrs for a width-authoring mutation.
 *
 * Width edits are treated as an explicit authoring signal that the table should
 * now be fixed-layout. The nested `tableProperties.tableLayout` value drives
 * DOCX export, while the promoted top-level attrs keep pm-adapter/layout in sync
 * during the current editor session.
 *
 * @param currentAttrs - Existing table node attrs before mutation.
 * @param attrOverrides - Additional top-level attrs to write alongside the fixed layout sync.
 * @param tablePropertyOverrides - Nested `tableProperties` updates that should accompany the width edit.
 * @returns Fully synchronized table attrs for `setNodeMarkup`.
 */
export function buildWidthAuthoringTableAttrs(
  currentAttrs: Record<string, unknown>,
  attrOverrides: Record<string, unknown> = {},
  tablePropertyOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const currentTableProps = (currentAttrs.tableProperties ?? {}) as Record<string, unknown>;
  const nextTableWidth = resolveWidthAuthoringTableWidth(currentAttrs, attrOverrides, tablePropertyOverrides);
  const updatedTableProps: Record<string, unknown> = {
    ...currentTableProps,
    ...tablePropertyOverrides,
    tableLayout: 'fixed',
  };
  if (nextTableWidth) {
    updatedTableProps.tableWidth = nextTableWidth;
  } else {
    delete updatedTableProps.tableWidth;
  }

  return {
    ...currentAttrs,
    tableProperties: updatedTableProps,
    ...attrOverrides,
    ...syncExtractedTableAttrs(updatedTableProps),
    userEdited: true,
  };
}

type GridColumn = { col?: unknown };

function resolveWidthAuthoringTableWidth(
  currentAttrs: Record<string, unknown>,
  attrOverrides: Record<string, unknown>,
  tablePropertyOverrides: Record<string, unknown>,
): { value: number; type: 'dxa' } | null {
  const explicitOverride = normalizeTableWidthMeasurement(tablePropertyOverrides.tableWidth);
  if (explicitOverride) return explicitOverride;

  const gridWidth = sumGridColumnTwips(attrOverrides.grid ?? currentAttrs.grid);
  if (gridWidth != null) {
    return { value: gridWidth, type: 'dxa' };
  }

  return null;
}

function sumGridColumnTwips(grid: unknown): number | null {
  const columns = normalizeGridColumns(grid);
  if (!columns || columns.length === 0) return null;

  const total = columns.reduce((sum, column) => sum + column.col, 0);
  return total > 0 ? total : null;
}

function normalizeGridColumns(grid: unknown): { col: number }[] | null {
  if (Array.isArray(grid)) {
    const columns = grid.map((width) => normalizeGridWidth(width)).filter((width) => width != null);
    return columns.length > 0 ? columns : null;
  }

  if (grid && typeof grid === 'object') {
    const rawColWidths = (grid as { colWidths?: unknown }).colWidths;
    if (Array.isArray(rawColWidths)) {
      const columns = rawColWidths.map((width) => normalizeGridWidth(width)).filter((width) => width != null);
      return columns.length > 0 ? columns : null;
    }
  }

  return null;
}

function normalizeGridWidth(width: unknown): { col: number } | null {
  if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
    return { col: Math.round(width) };
  }

  const value = (width as GridColumn | null | undefined)?.col;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return { col: Math.round(value) };
  }

  return null;
}

function normalizeTableWidthMeasurement(width: unknown): { value: number; type: 'dxa' } | null {
  if (!width || typeof width !== 'object') return null;

  const value = (width as { value?: unknown }).value;
  const type = (width as { type?: unknown }).type;
  if (type !== 'dxa' || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return { value: Math.round(value), type: 'dxa' };
}
