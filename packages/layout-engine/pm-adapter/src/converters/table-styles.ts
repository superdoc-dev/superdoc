import type { BoxSpacing } from '@superdoc/contracts';
import { resolveTableProperties } from '@superdoc/style-engine/ooxml';
import type { TableProperties, TableCellMargins } from '@superdoc/style-engine/ooxml';
import type { PMNode } from '../types.js';
import type { ConverterContext } from '../converter-context.js';
import { twipsToPx, normalizeCellPaddingTopBottom } from '../utilities.js';

export type TableStyleHydration = {
  borders?: Record<string, unknown>;
  cellPadding?: BoxSpacing;
  justification?: string;
  tableWidth?: { width?: number; type?: string };
  tableCellSpacing?: { value?: number; type?: string };
};

/**
 * Hydrates table-level attributes from inline properties and the style-engine.
 *
 * Cascade: style-resolved properties fill gaps that inline properties don't cover.
 * Inline properties (from PM node attrs) always win.
 *
 * The hydrator never mutates the PM node and only returns new objects,
 * so callers must merge the result with the node's attrs explicitly.
 */
export const hydrateTableStyleAttrs = (
  tableNode: PMNode,
  context?: ConverterContext,
  effectiveStyleId?: string | null,
): TableStyleHydration | null => {
  const hydration: TableStyleHydration = {};
  const tableProps = (tableNode.attrs?.tableProperties ?? null) as Record<string, unknown> | null;

  // Collect inline values first, then merge with style-resolved values below.
  let inlineBorders: Record<string, unknown> | undefined;
  let inlinePadding: BoxSpacing | undefined;

  // 1. Inline properties (highest priority)
  if (tableProps) {
    const padding = convertCellMarginsToPx(tableProps.cellMargins as Record<string, unknown>);
    if (padding) inlinePadding = normalizeCellPaddingTopBottom(padding);

    if (tableProps.borders && typeof tableProps.borders === 'object') {
      inlineBorders = clonePlainObject(tableProps.borders as Record<string, unknown>);
    }

    if (typeof tableProps.justification === 'string') {
      hydration.justification = tableProps.justification;
    }

    const tableWidth = normalizeTableWidth(tableProps.tableWidth);
    if (tableWidth) {
      hydration.tableWidth = tableWidth;
    }
  }

  // 2. Style-resolved properties (fill gaps not covered by inline, per-side)
  // Three-state contract for effectiveStyleId:
  //   undefined = "not provided" → fall back to raw node attr
  //   null      = "resolver found no valid style" → skip style resolution
  //   string    = "use this style"
  const styleId =
    effectiveStyleId === null
      ? undefined
      : (effectiveStyleId ??
        (typeof tableNode.attrs?.tableStyleId === 'string' ? tableNode.attrs.tableStyleId : undefined));
  if (styleId && context?.translatedLinkedStyles) {
    const resolved = resolveTableProperties(styleId, context.translatedLinkedStyles);

    // Per-side merge: inline sides win, style fills missing sides.
    if (resolved.borders) {
      const styleBorders = clonePlainObject(resolved.borders as unknown as Record<string, unknown>);
      hydration.borders = inlineBorders ? { ...styleBorders, ...inlineBorders } : styleBorders;
    } else if (inlineBorders) {
      hydration.borders = inlineBorders;
    }

    if (resolved.cellMargins) {
      const stylePadding = convertCellMarginsToPx(resolved.cellMargins as unknown as Record<string, unknown>);
      if (stylePadding) {
        const normalizedStylePadding = normalizeCellPaddingTopBottom(stylePadding);
        hydration.cellPadding = inlinePadding
          ? { ...normalizedStylePadding, ...inlinePadding }
          : normalizedStylePadding;
      } else if (inlinePadding) {
        hydration.cellPadding = inlinePadding;
      }
    } else if (inlinePadding) {
      hydration.cellPadding = inlinePadding;
    }

    if (!hydration.justification && resolved.justification) {
      hydration.justification = resolved.justification;
    }
    if (resolved.tableCellSpacing) {
      hydration.tableCellSpacing = resolved.tableCellSpacing as { value?: number; type?: string };
    }
    if (!hydration.tableWidth && resolved.tableWidth) {
      const tableWidth = normalizeTableWidth(resolved.tableWidth);
      if (tableWidth) hydration.tableWidth = tableWidth;
    }
  } else {
    // No style resolved — use inline values as-is.
    if (inlineBorders) hydration.borders = inlineBorders;
    if (inlinePadding) hydration.cellPadding = inlinePadding;
  }

  return Object.keys(hydration).length > 0 ? hydration : null;
};

const clonePlainObject = (value: Record<string, unknown>): Record<string, unknown> => ({ ...value });

const convertCellMarginsToPx = (margins: Record<string, unknown>): BoxSpacing | undefined => {
  if (!margins || typeof margins !== 'object') return undefined;
  const spacing: BoxSpacing = {};
  const keyMap: Record<string, keyof BoxSpacing> = {
    top: 'top',
    bottom: 'bottom',
    left: 'left',
    right: 'right',
    marginTop: 'top',
    marginBottom: 'bottom',
    marginLeft: 'left',
    marginRight: 'right',
    marginStart: 'left',
    marginEnd: 'right',
  };

  Object.entries(margins).forEach(([key, value]) => {
    const side = keyMap[key];
    if (!side) return;
    const px = measurementToPx(value);
    if (px != null) spacing[side] = px;
  });

  return Object.keys(spacing).length ? spacing : undefined;
};

const measurementToPx = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as { value?: number; type?: string };
  if (typeof entry.value !== 'number') return undefined;
  if (!entry.type || entry.type === 'px' || entry.type === 'pixel') return entry.value;
  if (entry.type === 'dxa') return twipsToPx(entry.value);
  return undefined;
};

const normalizeTableWidth = (value: unknown): { width?: number; type?: string } | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const measurement = value as { value?: number; width?: number; type?: string };
  const raw = typeof measurement.width === 'number' ? measurement.width : measurement.value;
  if (typeof raw !== 'number') return undefined;
  if (!measurement.type || measurement.type === 'px' || measurement.type === 'pixel') {
    return { width: raw, type: measurement.type ?? 'px' };
  }
  if (measurement.type === 'dxa') {
    return { width: twipsToPx(raw), type: 'px' };
  }
  return { width: raw, type: measurement.type };
};
