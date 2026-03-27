import type { ParagraphBlock, MathRun } from '@superdoc/contracts';
import type { PMNode, NodeHandlerContext } from '../types.js';

/** Rough width estimate per character for math content (px). */
const MATH_CHAR_WIDTH = 10;
/** Default height for math content (px). */
const MATH_DEFAULT_HEIGHT = 24;

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
  const justification = String(node.attrs?.justification ?? 'center');
  const width = Math.max(textContent.length * MATH_CHAR_WIDTH, 20);

  const pos = positions.get(node);

  const mathRun: MathRun = {
    kind: 'math',
    ommlJson: node.attrs?.originalXml ?? null,
    textContent,
    width,
    height: MATH_DEFAULT_HEIGHT,
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
