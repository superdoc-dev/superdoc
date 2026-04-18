import type { TextRun } from '@superdoc/contracts';
import type { PMNode } from '../../types.js';
import { textNodeToRun } from './text-run.js';
import type { InlineConverterParams } from './common.js';

/**
 * Converts a documentStatField PM node to a TextRun with the resolved display text.
 */
export function documentStatFieldNodeToRun(params: InlineConverterParams): TextRun | null {
  const { node, positions, sdtMetadata } = params;

  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const resolvedText = (attrs.resolvedText as string) || '0';
  const marksAsAttrs = Array.isArray(attrs.marksAsAttrs) ? attrs.marksAsAttrs : undefined;

  const run = textNodeToRun({
    ...params,
    node: {
      type: 'text',
      text: resolvedText,
      marks: [...(node.marks ?? [])],
      ...(marksAsAttrs ? { attrs: { marksAsAttrs } } : {}),
    } as PMNode,
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
