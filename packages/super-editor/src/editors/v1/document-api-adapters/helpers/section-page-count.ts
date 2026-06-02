import { formatPageNumber, type PageNumberFormat } from '@superdoc/contracts';
import type { Editor } from '../../core/Editor.js';

export function resolveSectionPageCountFieldValue(
  editor: Editor,
  node: { attrs?: Record<string, unknown> },
): string | null {
  const sectionPageCount = editor.options?.sectionPageCount;
  if (sectionPageCount == null) return null;

  const pageNumberFormat = node.attrs?.pageNumberFormat;
  if (typeof pageNumberFormat === 'string' && pageNumberFormat) {
    return formatPageNumber(Number(sectionPageCount) || 1, pageNumberFormat as PageNumberFormat);
  }
  return String(sectionPageCount);
}
