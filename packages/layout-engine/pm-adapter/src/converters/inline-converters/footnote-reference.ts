import { TextRun } from '@superdoc/contracts';
import { PMNode } from '../../types';
import { textNodeToRun } from './text-run';
import type { InlineConverterParams } from './common';

export function footnoteReferenceToBlock(params: InlineConverterParams): TextRun {
  const { node, converterContext } = params;
  const refPos = params.positions.get(node);
  const id = (node.attrs as Record<string, unknown> | undefined)?.id;
  const displayId = resolveFootnoteDisplayNumber(id, converterContext.footnoteNumberById) ?? id ?? '*';
  const displayText = toSuperscriptDigits(displayId);

  const run = textNodeToRun({
    ...params,
    node: { type: 'text', text: displayText, marks: [...(node.marks ?? [])] } as PMNode,
  });

  // Copy PM positions from the parent footnoteReference node
  if (refPos) {
    run.pmStart = refPos.start;
    run.pmEnd = refPos.end;
  }

  return run;
}

const resolveFootnoteDisplayNumber = (id: unknown, footnoteNumberById: Record<string, number> | undefined): unknown => {
  const key = id == null ? null : String(id);
  if (!key) return null;
  const mapped = footnoteNumberById?.[key];
  return typeof mapped === 'number' && Number.isFinite(mapped) && mapped > 0 ? mapped : null;
};

const toSuperscriptDigits = (value: unknown): string => {
  const map: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  };
  return String(value ?? '')
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
};
