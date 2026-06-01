import type { TextRun } from '@superdoc/contracts';
import { buildReferenceMarkerRun } from './reference-marker.js';
import { formatFootnoteCardinal } from '../../footnote-formatting.js';
import type { InlineConverterParams } from './common.js';

export function endnoteReferenceToBlock(params: InlineConverterParams): TextRun {
  const { node, converterContext } = params;
  const id = (node.attrs as Record<string, unknown> | undefined)?.id;
  const cardinal = resolveEndnoteDisplayNumber(id, converterContext.endnoteNumberById);
  // §17.11.11 — per-section numFmt override (endnoteFormatById) wins over the document default.
  const key = id == null ? null : String(id);
  const numFmt = (key && converterContext.endnoteFormatById?.[key]) || converterContext.endnoteNumberFormat;
  const displayText = cardinal != null ? formatFootnoteCardinal(cardinal, numFmt) : id != null ? String(id) : '*';

  return buildReferenceMarkerRun(displayText, params);
}

const resolveEndnoteDisplayNumber = (
  id: unknown,
  endnoteNumberById: Record<string, number> | undefined,
): number | null => {
  const key = id == null ? null : String(id);
  if (!key) return null;
  const mapped = endnoteNumberById?.[key];
  return typeof mapped === 'number' && Number.isFinite(mapped) && mapped > 0 ? mapped : null;
};
