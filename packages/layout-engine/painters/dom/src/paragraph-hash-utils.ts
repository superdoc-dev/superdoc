import type {
  Run,
  ParagraphBorders,
  ParagraphBorder,
  TableBorders,
  TableBorderValue,
  CellBorders,
  BorderSpec,
} from '@superdoc/contracts';

/**
 * Hash helpers are duplicated from layout-bridge to avoid a circular dependency
 * (layout-bridge imports DOM_CLASS_NAMES from painter-dom). Keep these helpers
 * in sync with layout-bridge when formatting changes need cache invalidation.
 */

export const hashParagraphBorder = (border: ParagraphBorder): string => {
  const parts: string[] = [];
  if (border.style !== undefined) parts.push(`s:${border.style}`);
  if (border.width !== undefined) parts.push(`w:${border.width}`);
  if (border.color !== undefined) parts.push(`c:${border.color}`);
  if (border.space !== undefined) parts.push(`sp:${border.space}`);
  return parts.join(',');
};

export const hashParagraphBorders = (borders: ParagraphBorders): string => {
  const parts: string[] = [];
  if (borders.top) parts.push(`t:[${hashParagraphBorder(borders.top)}]`);
  if (borders.right) parts.push(`r:[${hashParagraphBorder(borders.right)}]`);
  if (borders.bottom) parts.push(`b:[${hashParagraphBorder(borders.bottom)}]`);
  if (borders.left) parts.push(`l:[${hashParagraphBorder(borders.left)}]`);
  return parts.join(';');
};

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

export const hashTableBorderValue = (borderValue: TableBorderValue | undefined): string => {
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

/**
 * Type guard to check if a run has a string property.
 *
 * @param run - The run to check
 * @param prop - The property name to check
 * @returns True if the run has the property and it's a string
 */
export const hasStringProp = (run: Run, prop: string): run is Run & Record<string, string> => {
  return prop in run && typeof (run as Record<string, unknown>)[prop] === 'string';
};

/**
 * Type guard to check if a run has a number property.
 *
 * @param run - The run to check
 * @param prop - The property name to check
 * @returns True if the run has the property and it's a number
 */
export const hasNumberProp = (run: Run, prop: string): run is Run & Record<string, number> => {
  return prop in run && typeof (run as Record<string, unknown>)[prop] === 'number';
};

/**
 * Type guard to check if a run has a boolean property.
 *
 * @param run - The run to check
 * @param prop - The property name to check
 * @returns True if the run has the property and it's a boolean
 */
export const hasBooleanProp = (run: Run, prop: string): run is Run & Record<string, boolean> => {
  return prop in run && typeof (run as Record<string, unknown>)[prop] === 'boolean';
};

/**
 * Safely gets a string property from a run, with type narrowing.
 *
 * @param run - The run to get the property from
 * @param prop - The property name
 * @returns The string value or empty string if not present
 */
export const getRunStringProp = (run: Run, prop: string): string => {
  if (hasStringProp(run, prop)) {
    return run[prop];
  }
  return '';
};

/**
 * Safely gets a number property from a run, with type narrowing.
 *
 * @param run - The run to get the property from
 * @param prop - The property name
 * @returns The number value or 0 if not present
 */
export const getRunNumberProp = (run: Run, prop: string): number => {
  if (hasNumberProp(run, prop)) {
    return run[prop];
  }
  return 0;
};

/**
 * Safely gets a boolean property from a run, with type narrowing.
 *
 * @param run - The run to get the property from
 * @param prop - The property name
 * @returns The boolean value or false if not present
 */
export const getRunBooleanProp = (run: Run, prop: string): boolean => {
  if (hasBooleanProp(run, prop)) {
    return run[prop];
  }
  return false;
};

/**
 * Safely gets the underline style from a run.
 * Handles the object-shaped underline property { style?, color? }.
 *
 * @param run - The run to get the underline style from
 * @returns The underline style or empty string if not present
 */
export const getRunUnderlineStyle = (run: Run): string => {
  if ('underline' in run && typeof run.underline === 'boolean') {
    return run.underline ? 'single' : '';
  }
  if ('underline' in run && run.underline && typeof run.underline === 'object') {
    return (run.underline as { style?: string }).style ?? '';
  }
  return '';
};

/**
 * Safely gets the underline color from a run.
 * Handles the object-shaped underline property { style?, color? }.
 *
 * @param run - The run to get the underline color from
 * @returns The underline color or empty string if not present
 */
export const getRunUnderlineColor = (run: Run): string => {
  if ('underline' in run && run.underline && typeof run.underline === 'object') {
    return (run.underline as { color?: string }).color ?? '';
  }
  return '';
};
