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
      }
    : { count: 1, gap: 0 };
}

export function normalizeColumnLayout(
  input: ColumnLayout | undefined,
  contentWidth: number,
  epsilon = 0.0001,
): NormalizedColumnLayout {
  const rawCount = input && Number.isFinite(input.count) ? Math.floor(input.count) : 1;
  const count = Math.max(1, rawCount || 1);
  const gap = Math.max(0, input?.gap ?? 0);
  const totalGap = gap * (count - 1);
  const availableWidth = contentWidth - totalGap;
  const explicitWidths =
    Array.isArray(input?.widths) && input.widths.length > 0
      ? input.widths.filter((width) => typeof width === 'number' && Number.isFinite(width) && width > 0)
      : [];

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
    };
  }

  return {
    count,
    gap,
    ...(widths.length > 0 ? { widths } : {}),
    ...(input?.equalWidth !== undefined ? { equalWidth: input.equalWidth } : {}),
    width,
  };
}
