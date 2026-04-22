import type { TextRun } from '@superdoc/contracts';
import type { PMNode } from '../../types.js';
import { textNodeToRun } from './text-run.js';
import { buildFlowRunLink } from '../../marks/links.js';
import { type InlineConverterParams } from './common.js';

/**
 * Converts a crossReference PM node to a TextRun with the resolved display text.
 *
 * Renders Word REF / NOTEREF / STYLEREF fields imported from DOCX. Uses the
 * cached result text from Word (`attrs.resolvedText`) — we do not recompute
 * outline numbers for `\w`/`\r`/`\n` switches, we trust Word's cache.
 *
 * When the instruction carries the `\h` switch, the reference renders as an
 * internal hyperlink pointing at `#<target>` so clicks navigate to the
 * corresponding bookmark via the existing anchor-link navigation path.
 */
export function crossReferenceNodeToRun(params: InlineConverterParams): TextRun | null {
  const { node, positions, sdtMetadata } = params;

  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const resolvedText = typeof attrs.resolvedText === 'string' ? attrs.resolvedText : '';
  const target = typeof attrs.target === 'string' ? attrs.target : '';
  const instruction = typeof attrs.instruction === 'string' ? attrs.instruction : '';

  const run = textNodeToRun({
    ...params,
    node: { type: 'text', text: resolvedText, marks: [...(node.marks ?? [])] } as PMNode,
  });

  // \h switch - case-insensitive per ECMA-376 §17.16.1.
  if (target && /\\h\b/i.test(instruction)) {
    const synthesized = buildFlowRunLink({ anchor: target });
    if (synthesized) {
      run.link = run.link ? { ...run.link, ...synthesized, anchor: target } : synthesized;
    }
  }

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
