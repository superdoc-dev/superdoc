import type { BorderSpec, CellBorders, Run, TableBorders, TableBorderValue } from '@superdoc/contracts';

/**
 * Hash helpers for block version computation.
 *
 * Duplicated from painters/dom/src/paragraph-hash-utils.ts to avoid a circular
 * dependency (painter-dom -> layout-resolved is not allowed). Keep the two
 * copies in sync.
 */

// ---------------------------------------------------------------------------
// Table/Cell border hashing
// ---------------------------------------------------------------------------

const isNoneBorder = (value: TableBorderValue): value is { none: true } => {
  return typeof value === 'object' && value !== null && 'none' in value && (value as { none: true }).none === true;
};

const isBorderSpec = (value: unknown): value is BorderSpec => {
  return typeof value === 'object' && value !== null && !('none' in value);
};

export const hashBorderSpec = (border: BorderSpec): string => {
  const parts: string[] = [];
  if (border.style !== undefined) parts.push(`s:${border.style}`);
  if (border.width !== undefined) parts.push(`w:${border.width}`);
  if (border.color !== undefined) parts.push(`c:${border.color}`);
  if (border.space !== undefined) parts.push(`sp:${border.space}`);
  return parts.join(',');
};

const hashTableBorderValue = (borderValue: TableBorderValue | undefined): string => {
  if (borderValue === undefined) return '';
  if (borderValue === null) return 'null';
  if (isNoneBorder(borderValue)) return 'none';
  if (isBorderSpec(borderValue)) {
    return hashBorderSpec(borderValue);
  }
  return '';
};

export const hashTableBorders = (borders: TableBorders | undefined): string => {
  if (!borders) return '';
  const parts: string[] = [];
  if (borders.top !== undefined) parts.push(`t:[${hashTableBorderValue(borders.top)}]`);
  if (borders.right !== undefined) parts.push(`r:[${hashTableBorderValue(borders.right)}]`);
  if (borders.bottom !== undefined) parts.push(`b:[${hashTableBorderValue(borders.bottom)}]`);
  if (borders.left !== undefined) parts.push(`l:[${hashTableBorderValue(borders.left)}]`);
  if (borders.insideH !== undefined) parts.push(`ih:[${hashTableBorderValue(borders.insideH)}]`);
  if (borders.insideV !== undefined) parts.push(`iv:[${hashTableBorderValue(borders.insideV)}]`);
  return parts.join(';');
};

export const hashCellBorders = (borders: CellBorders | undefined): string => {
  if (!borders) return '';
  const parts: string[] = [];
  if (borders.top) parts.push(`t:[${hashBorderSpec(borders.top)}]`);
  if (borders.right) parts.push(`r:[${hashBorderSpec(borders.right)}]`);
  if (borders.bottom) parts.push(`b:[${hashBorderSpec(borders.bottom)}]`);
  if (borders.left) parts.push(`l:[${hashBorderSpec(borders.left)}]`);
  return parts.join(';');
};

// ---------------------------------------------------------------------------
// Run property accessors
// ---------------------------------------------------------------------------

const hasStringProp = (run: Run, prop: string): run is Run & Record<string, string> => {
  return prop in run && typeof (run as Record<string, unknown>)[prop] === 'string';
};

const hasNumberProp = (run: Run, prop: string): run is Run & Record<string, number> => {
  return prop in run && typeof (run as Record<string, unknown>)[prop] === 'number';
};

const hasBooleanProp = (run: Run, prop: string): run is Run & Record<string, boolean> => {
  return prop in run && typeof (run as Record<string, unknown>)[prop] === 'boolean';
};

export const getRunStringProp = (run: Run, prop: string): string => {
  if (hasStringProp(run, prop)) {
    return run[prop];
  }
  return '';
};

export const getRunNumberProp = (run: Run, prop: string): number => {
  if (hasNumberProp(run, prop)) {
    return run[prop];
  }
  return 0;
};

export const getRunBooleanProp = (run: Run, prop: string): boolean => {
  if (hasBooleanProp(run, prop)) {
    return run[prop];
  }
  return false;
};

export const getRunUnderlineStyle = (run: Run): string => {
  if ('underline' in run && typeof run.underline === 'boolean') {
    return run.underline ? 'single' : '';
  }
  if ('underline' in run && run.underline && typeof run.underline === 'object') {
    return (run.underline as { style?: string }).style ?? '';
  }
  return '';
};

export const getRunUnderlineColor = (run: Run): string => {
  if ('underline' in run && run.underline && typeof run.underline === 'object') {
    return (run.underline as { color?: string }).color ?? '';
  }
  return '';
};
