import type { TextRun } from '@superdoc/contracts';
import type { PMNode } from '../../types.js';
import { textNodeToRun } from './text-run.js';
import type { InlineConverterParams } from './common.js';

/**
 * Converts a sequenceField PM node to a TextRun with the resolved sequence number.
 */
export function sequenceFieldNodeToRun(params: InlineConverterParams): TextRun | null {
  const { node, positions, sdtMetadata } = params;

  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const resolvedNumber = (attrs.resolvedNumber as string) || '0';

  const run = textNodeToRun({
    ...params,
    node: { type: 'text', text: resolvedNumber, marks: [...(node.marks ?? [])] } as PMNode,
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
