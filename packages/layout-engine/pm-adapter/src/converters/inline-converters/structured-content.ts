import { type InlineConverterParams } from './common';

import { resolveNodeSdtMetadata } from '../../sdt/index.js';

export function structuredContentNodeToBlocks({
  node,
  inheritedMarks,
  sdtMetadata,
  visitNode,
  runProperties,
  inlineRunProperties,
}: InlineConverterParams): void {
  const inlineMetadata = resolveNodeSdtMetadata(node, 'structuredContent');
  const nextSdt = inlineMetadata ?? sdtMetadata;
  // SD-2781: forward inlineRunProperties so children inside this SDT wrapper
  // preserve run-level bidi/script metadata. The SDT itself doesn't introduce a
  // new run boundary, so the parent run's inline source still applies.
  node.content?.forEach((child) =>
    visitNode(child, inheritedMarks, nextSdt, runProperties, false, inlineRunProperties),
  );
}
