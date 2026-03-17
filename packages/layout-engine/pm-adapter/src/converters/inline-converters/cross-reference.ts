import type { TextRun } from '@superdoc/contracts';
import type { PMNode, PMMark } from '../../types.js';
import { textNodeToRun } from './text-run.js';
import { applyMarksToRun } from '../../marks/index.js';
import { applyInlineRunProperties, type InlineConverterParams } from './common.js';

/**
 * Converts a crossReference PM node to a TextRun with the resolved display text.
 */
export function crossReferenceNodeToRun(params: InlineConverterParams): TextRun | null {
  const { node, positions, defaultFont, defaultSize, inheritedMarks, sdtMetadata, runProperties, converterContext } =
    params;

  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const resolvedText = (attrs.resolvedText as string) || (attrs.target as string) || '';
  if (!resolvedText) return null;

  const run = textNodeToRun({
    ...params,
    node: { type: 'text', text: resolvedText, marks: [...(node.marks ?? [])] } as PMNode,
  });

  const pos = positions.get(node);
  if (pos) {
    run.pmStart = pos.start;
    run.pmEnd = pos.end;
  }

  if (sdtMetadata) {
    run.sdt = sdtMetadata;
  }

  return run;
}
