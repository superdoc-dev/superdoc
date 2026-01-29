import { type InlineConverterParams } from './common';

import { resolveNodeSdtMetadata } from '../../sdt/index.js';

export function structuredContentNodeToBlocks({
  node,
  inheritedMarks,
  sdtMetadata,
  visitNode,
  runProperties,
}: InlineConverterParams): void {
  const inlineMetadata = resolveNodeSdtMetadata(node, 'structuredContent');
  const nextSdt = inlineMetadata ?? sdtMetadata;
  node.content?.forEach((child) => visitNode(child, inheritedMarks, nextSdt, runProperties, false));
}
