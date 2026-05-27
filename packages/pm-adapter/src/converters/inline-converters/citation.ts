import type { TextRun } from '@superdoc/contracts';
import type { PMNode } from '../../types.js';
import { textNodeToRun } from './text-run.js';
import type { InlineConverterParams } from './common.js';

/**
 * Converts a citation PM node to a TextRun with the resolved citation text.
 */
export function citationNodeToRun(params: InlineConverterParams): TextRun | null {
  const { node, positions, sdtMetadata } = params;

  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const resolvedText = (attrs.resolvedText as string) || '[Citation]';

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
