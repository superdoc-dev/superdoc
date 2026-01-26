import { type InlineConverterParams } from './common';
import { contentBlockNodeToDrawingBlock } from '../content-block.js';
import type { DrawingBlock } from '@superdoc/contracts';

export function inlineContentBlockConverter({
  node,
  positions,
  nextBlockId,
  paragraphAttrs,
}: InlineConverterParams): DrawingBlock | null {
  const attrs = node.attrs ?? {};
  if (!attrs.horizontalRule) {
    return null;
  }
  const indent = paragraphAttrs?.indent;
  const hrIndentLeft = typeof indent?.left === 'number' ? indent.left : undefined;
  const hrIndentRight = typeof indent?.right === 'number' ? indent.right : undefined;
  const hasIndent =
    (typeof hrIndentLeft === 'number' && hrIndentLeft !== 0) ||
    (typeof hrIndentRight === 'number' && hrIndentRight !== 0);
  const hrNode = hasIndent ? { ...node, attrs: { ...attrs, hrIndentLeft, hrIndentRight } } : node;
  const drawingBlock = contentBlockNodeToDrawingBlock(hrNode, nextBlockId, positions);
  return drawingBlock;
}
