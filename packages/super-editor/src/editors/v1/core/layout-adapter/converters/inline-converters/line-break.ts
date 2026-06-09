import type { Run, SdtMetadata } from '@superdoc/contracts';
import { type InlineConverterParams } from './common';
import { NotInlineNodeError } from './common.js';

/**
 * Converts a ProseMirror fieldAnnotation node into a FieldAnnotationRun for layout engine rendering.
 *
 * Field annotations are inline "pill" elements that display form fields or placeholders.
 * They render with distinctive styling (border, background, rounded corners) and can
 * contain different content types (text, image, signature, etc.).
 *
 * @param nodeForRun - FieldAnnotation PM node with attrs containing field configuration
 * @param positions - Position map for ProseMirror node tracking (pmStart/pmEnd)
 * @param fieldMetadata - SDT metadata extracted from the fieldAnnotation node
 * @returns FieldAnnotationRun object with all extracted properties
 */
export function lineBreakNodeToRun({ node, positions, sdtMetadata }: InlineConverterParams): Run {
  const attrs = node.attrs ?? {};
  const breakType = attrs.pageBreakType ?? attrs.lineBreakType ?? 'line';

  if (breakType === 'page' || breakType === 'column') {
    throw new NotInlineNodeError();
  }

  // Inline line break: preserve as a run so measurer can create a new line
  const lineBreakRun: Run = { kind: 'lineBreak', attrs: {} };
  const lbAttrs: Record<string, string> = {};
  if (attrs.lineBreakType) lbAttrs.lineBreakType = String(attrs.lineBreakType);
  if (attrs.clear) lbAttrs.clear = String(attrs.clear);
  if (Object.keys(lbAttrs).length > 0) {
    (lineBreakRun as { attrs: Record<string, string> }).attrs = lbAttrs;
  } else {
    delete (lineBreakRun as { attrs?: Record<string, string> }).attrs;
  }
  const pos = positions.get(node);
  if (pos) {
    (lineBreakRun as { pmStart: number }).pmStart = pos.start;
    (lineBreakRun as { pmEnd: number }).pmEnd = pos.end;
  }
  if (sdtMetadata) {
    (lineBreakRun as { sdt?: SdtMetadata }).sdt = sdtMetadata;
  }
  return lineBreakRun;
}
