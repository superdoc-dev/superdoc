/**
 * ProseMirror to FlowBlock Adapter
 *
 * Converts ProseMirror documents into FlowBlock[] for the layout engine pipeline.
 *
 * Responsibilities:
 * - Parse paragraph nodes from PM document
 * - Split text content into styled runs based on mark boundaries
 * - Generate deterministic BlockIds for layout tracking
 * - Normalize whitespace and handle empty paragraphs
 */

import type { FlowBlock, ParagraphBlock } from '@superdoc/contracts';
import { isValidTrackedMode } from './tracked-changes.js';
import { analyzeSectionRanges, createSectionBreakBlock, publishSectionMetadata } from './sections/index.js';
import { normalizePrefix, buildPositionMap, createBlockIdGenerator } from './utilities.js';
import {
  paragraphToFlowBlocks,
  contentBlockNodeToDrawingBlock,
  imageNodeToBlock,
  handleImageNode,
  vectorShapeNodeToDrawingBlock,
  shapeGroupNodeToDrawingBlock,
  shapeContainerNodeToDrawingBlock,
  shapeTextboxNodeToDrawingBlock,
  handleVectorShapeNode,
  handleShapeGroupNode,
  handleShapeContainerNode,
  handleShapeTextboxNode,
  tableNodeToBlock,
  handleTableNode,
  hydrateImageBlocks,
  handleParagraphNode,
} from './converters/index.js';
import {
  handleTableOfContentsNode,
  handleIndexNode,
  handleStructuredContentBlockNode,
  handleDocumentSectionNode,
  handleDocumentPartObjectNode,
} from './sdt/index.js';
import type {
  PMNode,
  TrackedChangesConfig,
  HyperlinkConfig,
  FlowBlocksResult,
  AdapterOptions,
  NodeHandlerContext,
  NodeHandler,
  NestedConverters,
  ConverterContext,
} from './types.js';

const DEFAULT_FONT = 'Times New Roman';
const DEFAULT_SIZE = 10 / 0.75; // 10pt in pixels

/**
 * Dispatch map for node type handlers.
 * Maps node type names to their corresponding handler functions.
 */
export const nodeHandlers: Record<string, NodeHandler> = {
  paragraph: handleParagraphNode,
  tableOfContents: handleTableOfContentsNode,
  index: handleIndexNode,
  structuredContentBlock: handleStructuredContentBlockNode,
  documentSection: handleDocumentSectionNode,
  table: handleTableNode,
  documentPartObject: handleDocumentPartObjectNode,
  image: handleImageNode,
  vectorShape: handleVectorShapeNode,
  shapeGroup: handleShapeGroupNode,
  shapeContainer: handleShapeContainerNode,
  shapeTextbox: handleShapeTextboxNode,
};

const converters: NestedConverters = {
  contentBlockNodeToDrawingBlock,
  imageNodeToBlock,
  vectorShapeNodeToDrawingBlock,
  shapeGroupNodeToDrawingBlock,
  shapeContainerNodeToDrawingBlock,
  shapeTextboxNodeToDrawingBlock,
  tableNodeToBlock,
  paragraphToFlowBlocks,
};

/**
 * Convert a ProseMirror document to FlowBlock array with bookmark tracking.
 *
 * Returns both blocks and a bookmark map for two-pass layout with
 * cross-reference resolution (e.g., TOC page numbers, PAGEREF fields).
 *
 * Use this when you need to resolve page references dynamically:
 * 1. Call toFlowBlocks() to get blocks + bookmarks
 * 2. Run first layout pass to position fragments
 * 3. Build anchor map from bookmarks and fragment PM positions
 * 4. Resolve pageRef tokens to actual page numbers
 * 5. Re-measure affected paragraphs (TOC entries)
 * 6. Run second layout pass for final positioning
 *
 * @param pmDoc - ProseMirror document
 * @param options - Optional configuration
 * @returns Object with blocks and bookmark position map
 *
 * @example
 * ```typescript
 * const { blocks, bookmarks } = toFlowBlocks(pmDoc);
 * const layout = layoutDocument(blocks, measures, options);
 * const anchorMap = buildAnchorMap(bookmarks, layout);
 * resolvePageRefTokens(blocks, anchorMap);
 * const finalLayout = layoutDocument(blocks, newMeasures, options);
 * ```
 */
export function toFlowBlocks(pmDoc: PMNode | object, options?: AdapterOptions): FlowBlocksResult {
  const defaultFont = options?.defaultFont ?? DEFAULT_FONT;
  const defaultSize = options?.defaultSize ?? DEFAULT_SIZE;
  const instrumentation = options?.instrumentation;
  const idPrefix = normalizePrefix(options?.blockIdPrefix);

  const doc = pmDoc as PMNode;

  if (!doc.content) {
    return { blocks: [], bookmarks: new Map() };
  }

  const trackedChangesMode = isValidTrackedMode(options?.trackedChangesMode) ? options.trackedChangesMode : 'review';
  const enableTrackedChanges = options?.enableTrackedChanges ?? true;
  const trackedChangesConfig: TrackedChangesConfig = {
    mode: trackedChangesMode,
    enabled: enableTrackedChanges,
  };
  const hyperlinkConfig: HyperlinkConfig = {
    enableRichHyperlinks: options?.enableRichHyperlinks ?? false,
  };
  const enableComments = options?.enableComments ?? true;
  const converterContext: ConverterContext = normalizeConverterContext(
    options?.converterContext,
    defaultFont,
    defaultSize,
  );

  const blocks: FlowBlock[] = [];
  const bookmarks = new Map<string, number>();
  const positions =
    options?.positions ??
    (options?.atomNodeTypes ? buildPositionMap(doc, { atomNodeTypes: options.atomNodeTypes }) : buildPositionMap(doc));

  const nextBlockId = createBlockIdGenerator(idPrefix);
  const blockCounts: Partial<Record<FlowBlock['kind'], number>> = {};
  const recordBlockKind = (kind: FlowBlock['kind']) => {
    blockCounts[kind] = (blockCounts[kind] ?? 0) + 1;
  };

  // Range-aware section analysis (matches toFlowBlocks semantics)
  const bodySectionProps = doc.attrs?.bodySectPr ?? doc.attrs?.sectPr;
  const sectionRanges = options?.emitSectionBreaks ? analyzeSectionRanges(doc, bodySectionProps) : [];
  publishSectionMetadata(sectionRanges, options);

  // Emit first section break before content to set initial properties.
  // The isFirstSection flag tells the layout engine to apply properties immediately
  // without forcing a page break (since there's no content yet), but we preserve
  // the section's actual type for semantic correctness.
  if (sectionRanges.length > 0 && sectionRanges[0]) {
    const sectionBreak = createSectionBreakBlock(sectionRanges[0], nextBlockId, { isFirstSection: true });
    blocks.push(sectionBreak);
    recordBlockKind(sectionBreak.kind);
  }

  // Build handler context for node processing
  const handlerContext: NodeHandlerContext = {
    blocks,
    recordBlockKind,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    converterContext,
    trackedChangesConfig,
    hyperlinkConfig,
    enableComments,
    bookmarks,
    sectionState: {
      ranges: sectionRanges,
      currentSectionIndex: 0,
      currentParagraphIndex: 0,
    },
    converters,
    themeColors: options?.themeColors,
  };

  // Process nodes using handler dispatch pattern
  doc.content.forEach((node) => {
    const handler = nodeHandlers[node.type];
    if (handler) {
      handler(node, handlerContext);
    }
  });

  // Ensure final body section is emitted only if not already emitted during paragraph processing.
  // The final section break is emitted by handleParagraphNode when entering the last section,
  // so we only need to emit it here if currentSectionIndex hasn't reached the last section yet.
  if (sectionRanges.length > 0) {
    const lastSectionIndex = sectionRanges.length - 1;
    const lastSection = sectionRanges[lastSectionIndex];
    // Only emit if we haven't processed the last section yet
    if (handlerContext.sectionState!.currentSectionIndex < lastSectionIndex) {
      const sectionBreak = createSectionBreakBlock(lastSection, nextBlockId);
      blocks.push(sectionBreak);
      recordBlockKind(sectionBreak.kind);
    }
  }

  instrumentation?.log?.({ totalBlocks: blocks.length, blockCounts, bookmarks: bookmarks.size });
  const hydratedBlocks = hydrateImageBlocks(blocks, options?.mediaFiles);

  // Post-process: Merge drop-cap paragraphs with their following text paragraphs
  const mergedBlocks = mergeDropCapParagraphs(hydratedBlocks);

  return { blocks: mergedBlocks, bookmarks };
}

/**
 * Merge drop-cap paragraphs with their following text paragraphs.
 *
 * In DOCX, drop caps are encoded as separate paragraphs containing just the
 * drop cap letter(s) with w:framePr/@w:dropCap. This function:
 * 1. Identifies paragraphs with dropCapDescriptor (the drop-cap letter paragraph)
 * 2. Merges them with the following paragraph (the text paragraph)
 * 3. Transfers the dropCapDescriptor to the merged paragraph
 * 4. Removes the original drop-cap-only paragraph
 *
 * @param blocks - Array of flow blocks to process
 * @returns New array with drop-cap paragraphs merged
 */
function mergeDropCapParagraphs(blocks: FlowBlock[]): FlowBlock[] {
  const result: FlowBlock[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    // Check if this is a drop-cap paragraph (has dropCapDescriptor)
    if (block.kind === 'paragraph' && block.attrs?.dropCapDescriptor && i + 1 < blocks.length) {
      const dropCapBlock = block as ParagraphBlock;
      const nextBlock = blocks[i + 1];

      // Check if next block is a paragraph we can merge with
      if (nextBlock.kind === 'paragraph') {
        const textBlock = nextBlock as ParagraphBlock;

        // Create merged paragraph:
        // - Use the text block's ID and most attributes
        // - Prepend the drop-cap letter to the runs (not the runs themselves,
        //   as the letter is already in the dropCapDescriptor.run)
        // - Transfer the dropCapDescriptor from the drop-cap block
        const mergedBlock: ParagraphBlock = {
          kind: 'paragraph',
          id: textBlock.id,
          runs: textBlock.runs,
          attrs: {
            ...textBlock.attrs,
            dropCapDescriptor: dropCapBlock.attrs?.dropCapDescriptor,
            // Clear the legacy dropCap flag on the merged block
            dropCap: undefined,
          },
        };

        result.push(mergedBlock);
        // Skip both the drop-cap block and the text block
        i += 2;
        continue;
      }
    }

    // Not a drop-cap or no following paragraph - keep as-is
    result.push(block);
    i += 1;
  }

  return result;
}

/**
 * Normalize and populate the converter context with defaults.
 *
 * Ensures that essential properties like default font and size
 * are set in the converter context for consistent styling.
 *
 * @param context - Existing converter context (may be undefined)
 * @param defaultFont - Default font family to use
 * @param defaultSize - Default font size in pixels
 * @returns Normalized converter context
 */
function normalizeConverterContext(
  context: ConverterContext | undefined,
  defaultFont: string,
  defaultSize: number,
): ConverterContext {
  if (!context) {
    context = {
      translatedNumbering: {},
      translatedLinkedStyles: {
        docDefaults: {},
        latentStyles: {},
        styles: {},
      },
    };
  }

  if (!context.translatedLinkedStyles.docDefaults) {
    context.translatedLinkedStyles.docDefaults = {};
  }
  if (!context.translatedLinkedStyles.docDefaults.runProperties) {
    context.translatedLinkedStyles.docDefaults.runProperties = {};
  }
  if (!context.translatedLinkedStyles.docDefaults.runProperties.fontFamily) {
    context.translatedLinkedStyles.docDefaults.runProperties.fontFamily = {};
  }
  if (!context.translatedLinkedStyles.docDefaults.runProperties.fontFamily.ascii) {
    context.translatedLinkedStyles.docDefaults.runProperties.fontFamily.ascii = defaultFont;
  }
  if (!context.translatedLinkedStyles.docDefaults.runProperties.fontSize) {
    context.translatedLinkedStyles.docDefaults.runProperties.fontSize = defaultSize * 0.75 * 2; // size in half-points
  }

  return context;
}
