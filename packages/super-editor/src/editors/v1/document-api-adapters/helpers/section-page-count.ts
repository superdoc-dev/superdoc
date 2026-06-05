import { formatPageNumberFieldValue, type PageNumberFieldFormat } from '@superdoc/contracts';
import type { Editor } from '../../core/Editor.js';

export function resolveSectionPageCountFieldValue(
  editor: Editor,
  node: { attrs?: Record<string, unknown> },
): string | null {
  const sectionPageCount = editor.options?.sectionPageCount;
  if (sectionPageCount == null) return null;

  const pageNumberFormat =
    typeof node.attrs?.pageNumberFormat === 'string' && node.attrs.pageNumberFormat
      ? node.attrs.pageNumberFormat
      : undefined;
  const pageNumberZeroPadding =
    typeof node.attrs?.pageNumberZeroPadding === 'number' && Number.isFinite(node.attrs.pageNumberZeroPadding)
      ? node.attrs.pageNumberZeroPadding
      : undefined;

  if (pageNumberFormat || pageNumberZeroPadding != null) {
    return formatPageNumberFieldValue(Number(sectionPageCount) || 1, {
      ...(pageNumberFormat ? { format: pageNumberFormat as PageNumberFieldFormat['format'] } : {}),
      ...(pageNumberZeroPadding != null ? { zeroPadding: pageNumberZeroPadding } : {}),
    });
  }
  return String(sectionPageCount);
}
