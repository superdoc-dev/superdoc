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
  const numericPicture =
    typeof attrs.pageNumberNumericPicture === 'string' && attrs.pageNumberNumericPicture.length > 0
      ? attrs.pageNumberNumericPicture
      : undefined;
  if (!format && !zeroPadding && !numericPicture) return undefined;
  return {
    ...(format ? { format: format as NonNullable<TextRun['pageNumberFieldFormat']>['format'] } : {}),
    ...(zeroPadding != null ? { zeroPadding } : {}),
    ...(numericPicture ? { numericPicture } : {}),
  };
}
