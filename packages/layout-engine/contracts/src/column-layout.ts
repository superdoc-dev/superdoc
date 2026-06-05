import type { ColumnLayout } from './index.js';

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

export function cloneColumnLayout(columns?: ColumnLayout): ColumnLayout {
  return columns
    ? {
        count: columns.count,
        gap: columns.gap,
        ...(Array.isArray(columns.widths) ? { widths: [...columns.widths] } : {}),
        ...(columns.equalWidth !== undefined ? { equalWidth: columns.equalWidth } : {}),
        ...(columns.withSeparator !== undefined ? { withSeparator: columns.withSeparator } : {}),
      }
    : { count: 1, gap: 0 };
}

export function normalizeColumnLayout(
  input: ColumnLayout | undefined,
  contentWidth: number,
  epsilon = 0.0001,
): NormalizedColumnLayout {
  const rawCount = input && Number.isFinite(input.count) ? Math.floor(input.count) : 1;
  let count = Math.max(1, rawCount || 1);
  const gap = Math.max(0, input?.gap ?? 0);
  // Honor per-column widths ONLY in explicit mode (`equalWidth === false`). In equal mode
  // (true or omitted) Word ignores child widths and divides the content area evenly, so any
  // widths that reach here are not authoritative and must not drive geometry. (SD-2324)
  const explicitWidths =
    input?.equalWidth === false && Array.isArray(input?.widths) && input.widths.length > 0
      ? input.widths.filter((width) => typeof width === 'number' && Number.isFinite(width) && width > 0)
      : [];
  // Explicit columns are defined by their <w:col> widths. When the section declares more
  // columns than it supplies widths (e.g. w:num="4" with two <w:col>), the surplus columns
  // have no width and previously padded to ~0px, rendering as 1px slivers of vertical text
  // (SD-2324 F8). Clamp the count to the widths actually provided so every column renders.
  if (explicitWidths.length > 0 && explicitWidths.length < count) {
    count = explicitWidths.length;
  }
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
