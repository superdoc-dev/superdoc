import type { TextRun } from '@superdoc/contracts';
import { buildReferenceMarkerRun } from './reference-marker.js';
import type { InlineConverterParams } from './common.js';

export function endnoteReferenceToBlock(params: InlineConverterParams): TextRun {
  const { node, converterContext } = params;
  const id = (node.attrs as Record<string, unknown> | undefined)?.id;
  const displayId = resolveEndnoteDisplayNumber(id, converterContext.endnoteNumberById) ?? id ?? '*';

  return buildReferenceMarkerRun(String(displayId), params);
}

const resolveEndnoteDisplayNumber = (id: unknown, endnoteNumberById: Record<string, number> | undefined): unknown => {
  const key = id == null ? null : String(id);
  if (!key) return null;
  const mapped = endnoteNumberById?.[key];
  return typeof mapped === 'number' && Number.isFinite(mapped) && mapped > 0 ? mapped : null;
};
