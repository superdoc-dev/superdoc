import type { TextRun } from '@superdoc/contracts';
import { buildReferenceMarkerRun } from './reference-marker.js';
import { formatFootnoteCardinal } from '../../footnote-formatting.js';
import type { InlineConverterParams } from './common.js';

export function footnoteReferenceToBlock(params: InlineConverterParams): TextRun {
  const { node, converterContext } = params;
  const attrs = node.attrs as Record<string, unknown> | undefined;
  const id = attrs?.id;

  // SD-2658: when customMarkFollows is set, the document supplies a literal
  // symbol in the next run to use as the visible mark. Suppress the auto
  // numeric marker but emit an empty (zero-width) reference run so positions
  // stay consistent and the renderer keeps the anchor for click handling.
  if (isCustomMarkFollows(attrs?.customMarkFollows)) {
    return buildReferenceMarkerRun('', params);
  }

  const cardinal = resolveFootnoteDisplayNumber(id, converterContext.footnoteNumberById);
  // §17.11.11 — per-section numFmt override (footnoteFormatById) wins over the
  // document-wide footnoteNumberFormat. Falls back to the doc default.
  const key = id == null ? null : String(id);
  const numFmt = (key && converterContext.footnoteFormatById?.[key]) || converterContext.footnoteNumberFormat;
  const displayText = cardinal != null ? formatFootnoteCardinal(cardinal, numFmt) : id != null ? String(id) : '*';

  return buildReferenceMarkerRun(displayText, params);
}

/**
 * SD-2658: OOXML on/off type — `1`, `true`, `on` are truthy; `0`, `false`,
 * `off`, missing are falsy. Match Word's tolerant parsing so attribute
 * importers that pass through string or boolean both work.
 */
const isCustomMarkFollows = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
};

const resolveFootnoteDisplayNumber = (
  id: unknown,
  footnoteNumberById: Record<string, number> | undefined,
): number | null => {
  const key = id == null ? null : String(id);
  if (!key) return null;
  const mapped = footnoteNumberById?.[key];
  return typeof mapped === 'number' && Number.isFinite(mapped) && mapped > 0 ? mapped : null;
};
