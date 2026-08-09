import type {
  DrawingMeasure,
  ParagraphBlock,
  ParagraphMeasure,
  TextboxContentMeasure,
  TextboxDrawing,
} from '@superdoc/contracts';
import { resolveShapeTextContentMeasureWidth } from '@superdoc/contracts';

export function layoutTextboxContent(
  block: TextboxDrawing,
  remeasureParagraph: (block: ParagraphBlock, maxWidth: number) => ParagraphMeasure,
): ParagraphMeasure[] | undefined {
  if (!Array.isArray(block.contentBlocks) || block.contentBlocks.length === 0) {
    return [];
  }
  if (block.contentBlocks.some((contentBlock) => contentBlock.kind !== 'paragraph')) return undefined;

  const insets = block.textInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const contentWidth = resolveShapeTextContentMeasureWidth(block.geometry.width, insets, block.textLayout);

  return block.contentBlocks.map((paragraphBlock) =>
    remeasureParagraph(paragraphBlock as ParagraphBlock, contentWidth),
  );
}

/** Prefer canonical measurement output, retaining the synchronous bridge as a legacy fallback. */
export function resolveTextboxContentMeasures(
  block: TextboxDrawing,
  measure: DrawingMeasure,
  remeasureParagraph?: (block: ParagraphBlock, maxWidth: number) => ParagraphMeasure,
): TextboxContentMeasure[] | undefined {
  if (Array.isArray(measure.contentMeasures)) return measure.contentMeasures;
  if (Array.isArray(block.contentMeasures)) return block.contentMeasures;
  return typeof remeasureParagraph === 'function' ? layoutTextboxContent(block, remeasureParagraph) : undefined;
}
