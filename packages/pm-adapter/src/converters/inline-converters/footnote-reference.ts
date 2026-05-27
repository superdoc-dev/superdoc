import type { TextRun } from '@superdoc/contracts';
import { buildReferenceMarkerRun } from './reference-marker.js';
import type { InlineConverterParams } from './common.js';

export function footnoteReferenceToBlock(params: InlineConverterParams): TextRun {
  const { node, converterContext } = params;
  const id = (node.attrs as Record<string, unknown> | undefined)?.id;
  const displayId = resolveFootnoteDisplayNumber(id, converterContext.footnoteNumberById) ?? id ?? '*';

  return buildReferenceMarkerRun(String(displayId), params);
}

const resolveFootnoteDisplayNumber = (id: unknown, footnoteNumberById: Record<string, number> | undefined): unknown => {
  const key = id == null ? null : String(id);
  if (!key) return null;
  const mapped = footnoteNumberById?.[key];
  return typeof mapped === 'number' && Number.isFinite(mapped) && mapped > 0 ? mapped : null;
};
