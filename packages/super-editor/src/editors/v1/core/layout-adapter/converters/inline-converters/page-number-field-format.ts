import type { TextRun } from '@superdoc/contracts';

export function getPageNumberFieldFormat(
  attrs: Record<string, unknown> | undefined,
): TextRun['pageNumberFieldFormat'] | undefined {
  if (!attrs) return undefined;
  const format = typeof attrs.pageNumberFormat === 'string' ? attrs.pageNumberFormat : undefined;
  const zeroPadding =
    typeof attrs.pageNumberZeroPadding === 'number' && Number.isFinite(attrs.pageNumberZeroPadding)
      ? attrs.pageNumberZeroPadding
      : undefined;
  if (!format && !zeroPadding) return undefined;
  return {
    ...(format ? { format: format as NonNullable<TextRun['pageNumberFieldFormat']>['format'] } : {}),
    ...(zeroPadding ? { zeroPadding } : {}),
  };
}
