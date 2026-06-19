import type { ParagraphMeasure, TextboxDrawing } from '@superdoc/contracts';

export function layoutTextboxContent(
  block: TextboxDrawing,
  remeasureParagraph: (block: TextboxDrawing['contentBlocks'][number], maxWidth: number) => ParagraphMeasure,
): ParagraphMeasure[] {
  if (!Array.isArray(block.contentBlocks) || block.contentBlocks.length === 0) {
    return [];
  }

  const insets = block.textInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const contentWidth = Math.max(1, block.geometry.width - insets.left - insets.right);

  return block.contentBlocks.map((paragraphBlock) => remeasureParagraph(paragraphBlock, contentWidth));
}
