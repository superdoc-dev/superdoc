import type { ColumnLayout } from './index.js';

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
