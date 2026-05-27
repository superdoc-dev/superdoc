import type { TextRun } from '@superdoc/contracts';

import { applyInlineRunProperties, type InlineConverterParams } from './common';

import { resolveNodeSdtMetadata } from '../../sdt/index.js';

export function structuredContentNodeToBlocks({
  node,
  positions,
  defaultFont,
  defaultSize,
  inheritedMarks,
  sdtMetadata,
  visitNode,
  runProperties,
  inlineRunProperties,
  converterContext,
}: InlineConverterParams): TextRun | void {
  const inlineMetadata = resolveNodeSdtMetadata(node, 'structuredContent');
  const nextSdt = inlineMetadata ?? sdtMetadata;

  if (inlineMetadata?.scope === 'inline' && (!node.content || node.content.length === 0)) {
    const pos = positions.get(node);
    const contentPos = pos ? pos.start + 1 : undefined;
    const placeholder: TextRun = {
      kind: 'text',
      text: '',
      fontFamily: defaultFont,
      fontSize: defaultSize,
      sdt: inlineMetadata,
      visualPlaceholder: 'emptyInlineSdt',
      ...(contentPos != null ? { pmStart: contentPos, pmEnd: contentPos } : {}),
    };
    return applyInlineRunProperties(placeholder, runProperties, converterContext, inlineRunProperties);
  }

  // SD-2781: forward inlineRunProperties so children inside this SDT wrapper
  // preserve run-level bidi/script metadata. The SDT itself doesn't introduce a
  // new run boundary, so the parent run's inline source still applies.
  node.content?.forEach((child) =>
    visitNode(child, inheritedMarks, nextSdt, runProperties, false, inlineRunProperties),
  );
}
