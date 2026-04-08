import type {
  FlowBlock,
  ImageBlock,
  ImageMeasure,
  Measure,
  DrawingBlock,
  DrawingMeasure,
  TableBlock,
  TableMeasure,
} from '@superdoc/contracts';

/**
 * Represents an anchored image or drawing block with its measurements.
 * Used to bundle block and measure data for anchor processing.
 */
export type AnchoredDrawing = {
  block: ImageBlock | DrawingBlock;
  measure: ImageMeasure | DrawingMeasure;
};

export type AnchoredTable = {
  block: TableBlock;
  measure: TableMeasure;
};

export type AnchoredObject = AnchoredDrawing | AnchoredTable;

export type AnchoredTableCollection = {
  byParagraph: Map<number, AnchoredTable[]>;
  withoutParagraph: AnchoredTable[];
};

function buildParagraphIndexById(blocks: FlowBlock[], len: number): Map<string, number> {
  const paragraphIndexById = new Map<string, number>();

  for (let i = 0; i < len; i += 1) {
    const block = blocks[i];
    if (block.kind === 'paragraph') {
      paragraphIndexById.set(block.id, i);
    }
  }

  return paragraphIndexById;
}

function findNearestParagraphIndex(blocks: FlowBlock[], len: number, fromIndex: number): number | null {
  for (let i = fromIndex - 1; i >= 0; i -= 1) {
    if (blocks[i].kind === 'paragraph') return i;
  }

  for (let i = fromIndex + 1; i < len; i += 1) {
    if (blocks[i].kind === 'paragraph') return i;
  }

  return null;
}

function resolveAnchorParagraphIndex(
  blocks: FlowBlock[],
  len: number,
  paragraphIndexById: Map<string, number>,
  fromIndex: number,
  anchorParagraphId: unknown,
): number | null {
  if (typeof anchorParagraphId === 'string') {
    const explicitIndex = paragraphIndexById.get(anchorParagraphId);
    if (typeof explicitIndex === 'number') {
      return explicitIndex;
    }
  }

  return findNearestParagraphIndex(blocks, len, fromIndex);
}

/**
 * Check if an anchored image should be pre-registered (before any paragraphs are laid out).
 * Images with vRelativeFrom='margin' or 'page' position themselves relative to the page,
 * not relative to their anchor paragraph. These need to be registered first so ALL
 * paragraphs can wrap around them.
 */
export function isPageRelativeAnchor(block: ImageBlock | DrawingBlock): boolean {
  const vRelativeFrom = block.anchor?.vRelativeFrom;
  return vRelativeFrom === 'margin' || vRelativeFrom === 'page';
}

/**
 * Collect anchored images that should be pre-registered before the layout loop.
 * These are images with vRelativeFrom='margin' or 'page' that affect all paragraphs.
 *
 * @param blocks - Array of flow blocks to scan for anchored images
 * @param measures - Corresponding measures for each block
 * @returns Array of anchored drawings that should be pre-registered
 */
export function collectPreRegisteredAnchors(blocks: FlowBlock[], measures: Measure[]): AnchoredDrawing[] {
  const result: AnchoredDrawing[] = [];
  const len = Math.min(blocks.length, measures.length);

  for (let i = 0; i < len; i += 1) {
    const block = blocks[i];
    const measure = measures[i];
    const isImage = block.kind === 'image' && measure?.kind === 'image';
    const isDrawing = block.kind === 'drawing' && measure?.kind === 'drawing';
    if (!isImage && !isDrawing) continue;

    const drawingBlock = block as ImageBlock | DrawingBlock;
    const drawingMeasure = measure as ImageMeasure | DrawingMeasure;

    if (!drawingBlock.anchor?.isAnchored) {
      continue;
    }

    // Only pre-register page/margin-relative anchors
    if (isPageRelativeAnchor(drawingBlock)) {
      result.push({ block: drawingBlock, measure: drawingMeasure });
    }
  }

  return result;
}

/**
 * Collect anchored drawings (images/drawings) mapped to their anchor paragraph index.
 * Map of paragraph block index -> anchored images/drawings associated with that paragraph.
 */
export function collectAnchoredDrawings(blocks: FlowBlock[], measures: Measure[]): Map<number, AnchoredDrawing[]> {
  const map = new Map<number, AnchoredDrawing[]>();
  const len = Math.min(blocks.length, measures.length);
  const paragraphIndexById = buildParagraphIndexById(blocks, len);

  for (let i = 0; i < len; i += 1) {
    const block = blocks[i];
    const measure = measures[i];
    const isImage = block.kind === 'image' && measure?.kind === 'image';
    const isDrawing = block.kind === 'drawing' && measure?.kind === 'drawing';
    if (!isImage && !isDrawing) continue;

    const drawingBlock = block as ImageBlock | DrawingBlock;
    const drawingMeasure = measure as ImageMeasure | DrawingMeasure;

    if (!drawingBlock.anchor?.isAnchored) {
      continue;
    }

    // Skip page/margin-relative anchors - they're handled by collectPreRegisteredAnchors
    if (isPageRelativeAnchor(drawingBlock)) {
      continue;
    }

    // Heuristic: anchor to nearest preceding paragraph, else nearest next paragraph
    const anchorParagraphId =
      typeof drawingBlock.attrs === 'object' && drawingBlock.attrs
        ? (drawingBlock.attrs as { anchorParagraphId?: unknown }).anchorParagraphId
        : undefined;
    const anchorParaIndex = resolveAnchorParagraphIndex(blocks, len, paragraphIndexById, i, anchorParagraphId);
    if (anchorParaIndex == null) continue; // no paragraphs at all

    const list = map.get(anchorParaIndex) ?? [];
    list.push({ block: drawingBlock, measure: drawingMeasure });
    map.set(anchorParaIndex, list);
  }

  return map;
}

/**
 * Collect anchored/floating tables mapped to their anchor paragraph index.
 * Also returns anchored tables that have no paragraph to attach to.
 */
export function collectAnchoredTables(blocks: FlowBlock[], measures: Measure[]): AnchoredTableCollection {
  const len = Math.min(blocks.length, measures.length);
  const byParagraph = new Map<number, AnchoredTable[]>();
  const withoutParagraph: AnchoredTable[] = [];
  const paragraphIndexById = buildParagraphIndexById(blocks, len);

  for (let i = 0; i < len; i += 1) {
    const block = blocks[i];
    const measure = measures[i];

    if (block.kind !== 'table' || measure?.kind !== 'table') continue;

    const tableBlock = block as TableBlock;
    const tableMeasure = measure as TableMeasure;

    // Check if the table is anchored/floating
    if (!tableBlock.anchor?.isAnchored) continue;

    // Heuristic: anchor to explicit paragraph id, else nearest preceding paragraph, else nearest next paragraph
    const anchorParagraphId =
      typeof tableBlock.attrs === 'object' && tableBlock.attrs
        ? (tableBlock.attrs as { anchorParagraphId?: unknown }).anchorParagraphId
        : undefined;
    const anchorParaIndex = resolveAnchorParagraphIndex(blocks, len, paragraphIndexById, i, anchorParagraphId);
    if (anchorParaIndex == null) {
      withoutParagraph.push({ block: tableBlock, measure: tableMeasure });
      continue;
    }

    const list = byParagraph.get(anchorParaIndex) ?? [];
    list.push({ block: tableBlock, measure: tableMeasure });
    byParagraph.set(anchorParaIndex, list);
  }

  return {
    byParagraph,
    withoutParagraph,
  };
}
