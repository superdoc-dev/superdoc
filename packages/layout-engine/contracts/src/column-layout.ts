import type { ColumnLayout } from './index.js';

/**
 * Resolved geometry for a single column. `x` and `separatorX` are CONTENT-RELATIVE (measured from
 * the content-area left edge); add the content-left / left margin to get an absolute page x. This
 * is the single source every column consumer should read for positioning. (SD-2629)
 */
export type ColumnGeometry = {
  index: number;
  x: number;
  width: number;
  /** Gap after this column; 0 for the last column. */
  gapAfter: number;
  /** Separator x (content-relative); present only when a separator line is drawn after this column. */
  separatorX?: number;
};

export type NormalizedColumnLayout = ColumnLayout & { width: number };

export function widthsEqual(a?: number[], b?: number[]): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Usable explicit widths: finite and > 0. Empty unless explicit mode applies. (SD-2629)
 */
function usableExplicitWidths(input: ColumnLayout | undefined): number[] {
  if (!input || input.equalWidth !== false || !Array.isArray(input.widths)) return [];
  return input.widths.filter((width) => typeof width === 'number' && Number.isFinite(width) && width > 0);
}

/**
 * Resolved column mode. Explicit ONLY when `equalWidth === false` AND at least one usable child
 * width exists; otherwise equal mode. In equal mode Word ignores any child `w:col/@w` and divides
 * the content area evenly, so this is the single explicit/equal decision shared by extraction,
 * normalization, and geometry. (SD-2324 / SD-2629)
 */
export function resolveColumnMode(input: ColumnLayout | undefined): 'explicit' | 'equal' {
  return usableExplicitWidths(input).length > 0 ? 'explicit' : 'equal';
}

/**
 * Resolved column count and the SINGLE authority for "how many columns exist": the raw `w:num`
 * (default 1, floored, min 1) clamped to the usable explicit-width count in explicit mode (Word
 * renders min(num, valid-width count)). Both `normalizeColumnLayout` (width math) and the paginator
 * fill loop read this, so the two tracks cannot disagree: a section that declares more columns
 * than it supplies widths (e.g. w:num="4" with two <w:col>) neither pads surplus columns to ~0px
 * slivers nor advances the fill into non-existent columns. Content-width-independent. (SD-2324 F8 /
 * SD-2629)
 */
export function resolveColumnCount(input: ColumnLayout | undefined): number {
  const rawCount = input && Number.isFinite(input.count) ? Math.max(1, Math.floor(input.count)) : 1;
  const explicit = usableExplicitWidths(input);
  return explicit.length > 0 ? Math.min(rawCount, explicit.length) : rawCount;
}

export function cloneColumnLayout(columns?: ColumnLayout): ColumnLayout {
  return columns
    ? {
        count: columns.count,
        gap: columns.gap,
        ...(Array.isArray(columns.widths) ? { widths: [...columns.widths] } : {}),
        ...(Array.isArray(columns.gaps) ? { gaps: [...columns.gaps] } : {}),
        ...(columns.equalWidth !== undefined ? { equalWidth: columns.equalWidth } : {}),
        ...(columns.withSeparator !== undefined ? { withSeparator: columns.withSeparator } : {}),
      }
    : { count: 1, gap: 0 };
}

/**
 * Resolve an authored column config to what actually renders: count clamped to resolveColumnCount,
 * and per-column data reconciled with the mode. In explicit mode widths/gaps are sliced to the
 * resolved count (drop surplus); in equal mode they are dropped entirely, because Word ignores
 * child widths/spaces and divides evenly, and consumers like the DOM painter treat any `widths` as
 * explicit. NOT scaled to a content width; that is normalizeColumnLayout's job. Use for
 * render-facing metadata (page.columns / layout.columns / columnRegions) so it never advertises
 * phantom columns or stray explicit widths, e.g. count:4 with two widths becomes count:2. (SD-2629)
 */
export function resolveColumnLayout(input: ColumnLayout): ColumnLayout {
  const count = resolveColumnCount(input);
  const resolved = cloneColumnLayout(input);
  resolved.count = count;
  if (resolveColumnMode(input) === 'explicit') {
    if (Array.isArray(resolved.widths)) resolved.widths = resolved.widths.slice(0, count);
    if (Array.isArray(resolved.gaps)) resolved.gaps = resolved.gaps.slice(0, Math.max(0, count - 1));
  } else {
    delete resolved.widths;
    delete resolved.gaps;
  }
  return resolved;
}

/**
 * Build resolved per-column geometry from already-resolved widths and the uniform scalar gap.
 * SD-2629 step 1 keeps this behavior-preserving: it mirrors today's normalized output (scaled
 * widths, uniform gap). Per-column `gaps` do NOT drive geometry until the semantic flip (step 4).
 */
function buildColumnGeometry(widths: number[], gap: number, withSeparator: boolean): ColumnGeometry[] {
  const geometry: ColumnGeometry[] = [];
  let x = 0;
  for (let i = 0; i < widths.length; i += 1) {
    const width = widths[i];
    const isLast = i === widths.length - 1;
    const gapAfter = isLast ? 0 : gap;
    const col: ColumnGeometry = { index: i, x, width, gapAfter };
    if (withSeparator && !isLast) col.separatorX = x + width + gap / 2;
    geometry.push(col);
    x += width + gapAfter;
  }
  return geometry;
}

export function normalizeColumnLayout(
  input: ColumnLayout | undefined,
  contentWidth: number,
  epsilon = 0.0001,
): NormalizedColumnLayout {
  const count = resolveColumnCount(input);
  const gap = Math.max(0, input?.gap ?? 0);
  // Honor per-column widths ONLY in explicit mode (`equalWidth === false` with usable widths).
  // In equal mode (true or omitted) Word ignores child widths and divides the content area evenly,
  // so any widths that reach here are not authoritative and must not drive geometry. (SD-2324)
  const explicitWidths = usableExplicitWidths(input);
  const totalGap = gap * (count - 1);
  const availableWidth = contentWidth - totalGap;

  let widths =
    explicitWidths.length > 0
      ? explicitWidths.slice(0, count)
      : Array.from({ length: count }, () => (availableWidth > 0 ? availableWidth / count : contentWidth));

  if (widths.length < count) {
    const remaining = Math.max(0, availableWidth - widths.reduce((sum, width) => sum + width, 0));
    const fallbackWidth = count - widths.length > 0 ? remaining / (count - widths.length) : 0;
    widths.push(...Array.from({ length: count - widths.length }, () => fallbackWidth));
  }

  const totalExplicitWidth = widths.reduce((sum, width) => sum + width, 0);
  if (availableWidth > 0 && totalExplicitWidth > 0) {
    const scale = availableWidth / totalExplicitWidth;
    widths = widths.map((width) => Math.max(1, width * scale));
  }

  const width = widths.reduce((max, value) => Math.max(max, value), 0);

  if (!Number.isFinite(width) || width <= epsilon) {
    return {
      count: 1,
      gap: 0,
      width: Math.max(0, contentWidth),
      ...(input?.withSeparator !== undefined ? { withSeparator: input.withSeparator } : {}),
    };
  }

  return {
    count,
    gap,
    ...(widths.length > 0 ? { widths } : {}),
    ...(input?.equalWidth !== undefined ? { equalWidth: input.equalWidth } : {}),
    ...(input?.withSeparator !== undefined ? { withSeparator: input.withSeparator } : {}),
    width,
  };
}

/**
 * Resolve per-column geometry for an already-normalized layout. This is the SD-2629 consumer API:
 * fill/positioning/separators/hit-testing/footnotes/floating anchors/balancing should read this
 * single source rather than re-deriving from `widths`/`gap`. Behavior-preserving in step 1: it
 * mirrors today's normalized widths + scalar gap; per-column `gaps` drive it only after the flip.
 */
export function getColumnGeometry(normalized: NormalizedColumnLayout): ColumnGeometry[] {
  const widths =
    Array.isArray(normalized.widths) && normalized.widths.length > 0 ? normalized.widths : [normalized.width];
  return buildColumnGeometry(widths, normalized.gap, Boolean(normalized.withSeparator));
}

// ---------------------------------------------------------------------------
// Resolved-geometry consumer API (SD-2629). All x values are CONTENT-RELATIVE;
// callers pass the content-left / left margin as `originX` to get an absolute page x.
// ---------------------------------------------------------------------------

function clampColumnIndex(geometry: ColumnGeometry[], index: number): number {
  if (geometry.length === 0) return 0;
  return Math.max(0, Math.min(index, geometry.length - 1));
}

/** Width of the column at `index` (px). */
export function getColumnWidth(geometry: ColumnGeometry[], index: number): number {
  return geometry[clampColumnIndex(geometry, index)]?.width ?? 0;
}

/** Left edge of the column at `index`, as `originX + content-relative x`. */
export function getColumnX(geometry: ColumnGeometry[], index: number, originX = 0): number {
  return originX + (geometry[clampColumnIndex(geometry, index)]?.x ?? 0);
}

/** Gap after the column at `index` (0 for the last column). */
export function getColumnGapAfter(geometry: ColumnGeometry[], index: number): number {
  return geometry[clampColumnIndex(geometry, index)]?.gapAfter ?? 0;
}

/** Absolute x of each separator line (only columns that draw one), as `originX + content-relative`. */
export function getColumnSeparatorPositions(geometry: ColumnGeometry[], originX = 0): number[] {
  return geometry
    .filter((col) => typeof col.separatorX === 'number')
    .map((col) => originX + (col.separatorX as number));
}

/** Index of the column containing absolute `x` (clicks in a gap map to the preceding column). */
export function getColumnAtX(geometry: ColumnGeometry[], x: number, originX = 0): number {
  if (geometry.length === 0) return 0;
  const cx = x - originX;
  let result = 0;
  for (const col of geometry) {
    if (cx >= col.x) result = col.index;
    else break;
  }
  return result;
}

/** Structural equality of two column layouts, including per-column `gaps`. */
export function columnLayoutsEqual(a?: ColumnLayout, b?: ColumnLayout): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.count === b.count &&
    a.gap === b.gap &&
    a.equalWidth === b.equalWidth &&
    Boolean(a.withSeparator) === Boolean(b.withSeparator) &&
    widthsEqual(a.widths, b.widths) &&
    widthsEqual(a.gaps, b.gaps)
  );
}

/**
 * Render equality: true when two column configs produce the SAME rendered layout even if their raw
 * fields differ. Compares the canonical render form for today's renderer (resolved mode + count,
 * scalar gap, withSeparator, and in explicit mode the sliced widths) and deliberately ignores raw
 * `equalWidth` and the surplus count/widths that resolution discards. Per-column `gaps` are
 * intentionally ignored until geometry/separators consume them (step 4), so a gaps-only authored
 * delta does not split regions or invalidate the normalized-columns cache before it becomes
 * paint-significant. Use for region/cache change detection so e.g. `{num:4, widths:[a,b]}` vs
 * `{num:2, widths:[a,b]}`, or `equalWidth:true` vs an omitted equalWidth, do not split into
 * separate regions. (SD-2629)
 */
export function columnRenderLayoutsEqual(a?: ColumnLayout, b?: ColumnLayout): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const mode = resolveColumnMode(a);
  if (mode !== resolveColumnMode(b)) return false;
  if (resolveColumnCount(a) !== resolveColumnCount(b)) return false;
  if ((a.gap ?? 0) !== (b.gap ?? 0)) return false;
  if (Boolean(a.withSeparator) !== Boolean(b.withSeparator)) return false;
  if (mode === 'explicit') {
    const ra = resolveColumnLayout(a);
    const rb = resolveColumnLayout(b);
    if (!widthsEqual(ra.widths, rb.widths)) return false;
  }
  return true;
}
