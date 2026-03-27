import type { ParagraphBlock, MathRun } from '@superdoc/contracts';
import type { PMNode, NodeHandlerContext } from '../types.js';
import { estimateMathDimensions } from './math-constants.js';

const JUSTIFICATION_TO_ALIGN: Record<string, 'left' | 'center' | 'right'> = {
  center: 'center',
  centerGroup: 'center',
  left: 'left',
  right: 'right',
};

/**
 * Handle mathBlock nodes (display math / m:oMathPara).
 * Produces a ParagraphBlock containing a single MathRun.
 */
export function handleMathBlockNode(node: PMNode, context: NodeHandlerContext): void {
  const { blocks, recordBlockKind, nextBlockId, positions } = context;

  const textContent = String(node.attrs?.textContent ?? '');
  const justification = String(node.attrs?.justification ?? 'centerGroup');
  const { width, height } = estimateMathDimensions(textContent);

  const pos = positions.get(node);

  const mathRun: MathRun = {
    kind: 'math',
    ommlJson: node.attrs?.originalXml ?? null,
    textContent,
    width,
    height,
    pmStart: pos?.start,
    pmEnd: pos?.end,
  };

  const block: ParagraphBlock = {
    kind: 'paragraph',
    id: nextBlockId('paragraph'),
    runs: [mathRun],
    attrs: {
      alignment: JUSTIFICATION_TO_ALIGN[justification] ?? 'center',
    },
  };

  blocks.push(block);
  recordBlockKind?.(block.kind);
}
