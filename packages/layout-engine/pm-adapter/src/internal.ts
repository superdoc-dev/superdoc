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
import type { StyleContext } from '@superdoc/style-engine';
import { isValidTrackedMode } from './tracked-changes.js';
import { analyzeSectionRanges, createSectionBreakBlock, publishSectionMetadata } from './sections/index.js';
import {
  pxToPt,
  pickNumber,
  pickDecimalSeparator,
  pickLang,
  normalizePrefix,
  buildPositionMap,
  createBlockIdGenerator,
} from './utilities.js';
import {
  paragraphToFlowBlocks as paragraphToFlowBlocksImpl,
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
  tableNodeToBlock as tableNodeToBlockImpl,
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
  BlockIdGenerator,
  PositionMap,
  NodeHandlerContext,
  NodeHandler,
  ListCounterContext,
  PMDocumentMap,
  BatchAdapterOptions,
  ThemeColorPalette,
  ConverterContext,
  TableNodeToBlockOptions,
  ParagraphToFlowBlocksConverter,
  TableNodeToBlockConverter,
} from './types.js';
import { defaultDecimalSeparatorFor } from '@superdoc/locale-utils';
import { DEFAULT_HYPERLINK_CONFIG } from './constants';

const DEFAULT_FONT = 'Arial';
const DEFAULT_SIZE = 16;
const DEFAULT_DECIMAL_SEPARATOR = '.';

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
  // orderedList and bulletList removed - list handling moved out of layout-engine
  image: handleImageNode,
  vectorShape: handleVectorShapeNode,
  shapeGroup: handleShapeGroupNode,
  shapeContainer: handleShapeContainerNode,
  shapeTextbox: handleShapeTextboxNode,
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

  const docAttrs = (typeof doc.attrs === 'object' && doc.attrs !== null ? doc.attrs : {}) as Record<string, unknown>;
  const docDecimalSeparator = pickDecimalSeparator(doc.attrs?.decimalSeparator);
  const docLang = pickLang(docAttrs.lang ?? docAttrs.language ?? docAttrs.locale);
  const derivedSeparator = docLang ? defaultDecimalSeparatorFor(docLang) : undefined;
  const docTabIntervalTwips =
    pickNumber(docAttrs.defaultTabIntervalTwips ?? docAttrs.tabIntervalTwips ?? undefined) ??
    ((): number | undefined => {
      const px = pickNumber(docAttrs.defaultTabIntervalPx ?? docAttrs.tabIntervalPx);
      return px != null ? Math.round(px * 15) : undefined;
    })();
  const optionDecimalSeparator = pickDecimalSeparator(options?.locale?.decimalSeparator);
  const decimalSeparator =
    optionDecimalSeparator ?? docDecimalSeparator ?? derivedSeparator ?? DEFAULT_DECIMAL_SEPARATOR;
  const styleContext: StyleContext = {
    defaults: {
      paragraphFont: defaultFont,
      fontSize: pxToPt(defaultSize) ?? 12,
      decimalSeparator,
      defaultTabIntervalTwips: docTabIntervalTwips,
    },
  };
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
  const themeColors = options?.themeColors;
  const converterContext = options?.converterContext;

  if (!doc.content) {
    return { blocks: [], bookmarks: new Map() };
  }

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

  // Track B: List counter tracker for sequential numbering
  // Maps "numId:ilvl" -> current counter value for that list/level
  const listCounters = new Map<string, number>();

  const getListCounter = (numId: number, ilvl: number): number => {
    const key = `${numId}:${ilvl}`;
    return listCounters.get(key) ?? 0;
  };

  const incrementListCounter = (numId: number, ilvl: number): number => {
    const key = `${numId}:${ilvl}`;
    const current = listCounters.get(key) ?? 0;
    const next = current + 1;
    listCounters.set(key, next);
    return next;
  };

  const resetListCounter = (numId: number, ilvl: number): void => {
    const key = `${numId}:${ilvl}`;
    listCounters.set(key, 0);
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

  const paragraphConverter = (
    para: PMNode,
    nextBlockId: BlockIdGenerator,
    positions: PositionMap,
    defaultFont: string,
    defaultSize: number,
    context: StyleContext,
    listCounterContext?: ListCounterContext,
    trackedChanges?: TrackedChangesConfig,
    bookmarks?: Map<string, number>,
    hyperlinkConfig?: HyperlinkConfig,
    themeColorsParam?: ThemeColorPalette,
    converterCtx?: ConverterContext,
  ): FlowBlock[] =>
    paragraphToFlowBlocks(
      para,
      nextBlockId,
      positions,
      defaultFont,
      defaultSize,
      context,
      listCounterContext,
      trackedChanges,
      bookmarks,
      hyperlinkConfig,
      themeColorsParam ?? themeColors,
      converterCtx ?? converterContext,
      enableComments,
    );

  const tableConverter = (
    node: PMNode,
    nextBlockId: BlockIdGenerator,
    positions: PositionMap,
    defaultFont: string,
    defaultSize: number,
    context: StyleContext,
    trackedChanges?: TrackedChangesConfig,
    bookmarks?: Map<string, number>,
    hyperlinkConfig?: HyperlinkConfig,
    themeColorsParam?: ThemeColorPalette,
    converterCtx?: ConverterContext,
  ): FlowBlock | null =>
    tableNodeToBlock(
      node,
      nextBlockId,
      positions,
      defaultFont,
      defaultSize,
      context,
      trackedChanges,
      bookmarks,
      hyperlinkConfig,
      themeColorsParam ?? themeColors,
      paragraphConverter,
      converterCtx ?? converterContext,
      {
        listCounterContext: { getListCounter, incrementListCounter, resetListCounter },
        converters: {
          paragraphToFlowBlocks: paragraphConverter,
          imageNodeToBlock,
          vectorShapeNodeToDrawingBlock,
          shapeGroupNodeToDrawingBlock,
          shapeContainerNodeToDrawingBlock,
          shapeTextboxNodeToDrawingBlock,
        },
      },
    );

  // Build handler context for node processing
  const handlerContext: NodeHandlerContext = {
    blocks,
    recordBlockKind,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    converterContext,
    listCounterContext: { getListCounter, incrementListCounter, resetListCounter },
    trackedChangesConfig,
    hyperlinkConfig,
    enableComments,
    bookmarks,
    sectionState: {
      ranges: sectionRanges,
      currentSectionIndex: 0,
      currentParagraphIndex: 0,
    },
    converters: {
      // Type assertion needed due to signature mismatch between actual function and type definition
      paragraphToFlowBlocks: paragraphConverter as unknown as ParagraphToFlowBlocksConverter,
      tableNodeToBlock: tableConverter as unknown as TableNodeToBlockConverter,
      imageNodeToBlock,
      vectorShapeNodeToDrawingBlock,
      shapeGroupNodeToDrawingBlock,
      shapeContainerNodeToDrawingBlock,
      shapeTextboxNodeToDrawingBlock,
    },
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
    if (handlerContext.sectionState.currentSectionIndex < lastSectionIndex) {
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

export function toFlowBlocksMap(documents: PMDocumentMap, options?: BatchAdapterOptions): Record<string, FlowBlock[]> {
  const { blockIdPrefixFactory, ...adapterOptions } = options ?? {};
  const result: Record<string, FlowBlock[]> = {};
  if (!documents) {
    return result;
  }

  Object.entries(documents).forEach(([key, doc]) => {
    if (!doc) return;
    const prefix = blockIdPrefixFactory?.(key) ?? adapterOptions.blockIdPrefix ?? `${key}-`;
    const perDocOptions: AdapterOptions = {
      ...adapterOptions,
      blockIdPrefix: prefix,
    };
    const { blocks } = toFlowBlocks(doc, perDocOptions);
    result[key] = blocks;
  });

  return result;
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
 * Wrapper for paragraphToFlowBlocks that injects block node converters.
 *
 * Paragraphs can contain inline images, shapes, and tables. This wrapper
 * injects those converters so the paragraph implementation can handle them.
 *
 * @see converters/paragraph.ts for the actual implementation
 */
function paragraphToFlowBlocks(
  para: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
  defaultFont: string,
  defaultSize: number,
  styleContext: StyleContext,
  listCounterContext?: ListCounterContext,
  trackedChanges?: TrackedChangesConfig,
  bookmarks?: Map<string, number>,
  hyperlinkConfig: HyperlinkConfig = DEFAULT_HYPERLINK_CONFIG,
  themeColors?: ThemeColorPalette,
  converterContext?: ConverterContext,
  enableComments = true,
): FlowBlock[] {
  return paragraphToFlowBlocksImpl(
    para,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    listCounterContext,
    trackedChanges,
    bookmarks,
    hyperlinkConfig,
    themeColors,
    {
      contentBlockNodeToDrawingBlock,
      imageNodeToBlock,
      vectorShapeNodeToDrawingBlock,
      shapeGroupNodeToDrawingBlock,
      shapeContainerNodeToDrawingBlock,
      shapeTextboxNodeToDrawingBlock,
      tableNodeToBlock: (
        node: PMNode,
        nextBlockId: BlockIdGenerator,
        positions: PositionMap,
        defaultFont: string,
        defaultSize: number,
        styleContext: StyleContext,
        trackedChanges?: TrackedChangesConfig,
        bookmarks?: Map<string, number>,
        hyperlinkConfig?: HyperlinkConfig,
        themeColors?: ThemeColorPalette,
        converterCtx?: ConverterContext,
      ) =>
        tableNodeToBlockImpl(
          node,
          nextBlockId,
          positions,
          defaultFont,
          defaultSize,
          styleContext,
          trackedChanges,
          bookmarks,
          hyperlinkConfig,
          themeColors,
          paragraphToFlowBlocks,
          converterCtx ?? converterContext,
          {
            listCounterContext,
            converters: {
              // Type assertion needed due to signature mismatch between actual function and type definition
              paragraphToFlowBlocks: paragraphToFlowBlocksImpl as unknown as ParagraphToFlowBlocksConverter,
              imageNodeToBlock,
              vectorShapeNodeToDrawingBlock,
              shapeGroupNodeToDrawingBlock,
              shapeContainerNodeToDrawingBlock,
              shapeTextboxNodeToDrawingBlock,
            },
          },
        ),
    },
    converterContext,
    enableComments,
  );
}

/**
 * Wrapper for tableNodeToBlock that injects the paragraph converter.
 *
 * Tables contain paragraphs in their cells. This wrapper injects the
 * paragraph converter so table cells can be properly converted.
 *
 * @see converters/table.ts for the actual implementation
 */
function tableNodeToBlock(
  node: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
  defaultFont: string,
  defaultSize: number,
  styleContext: StyleContext,
  trackedChanges?: TrackedChangesConfig,
  bookmarks?: Map<string, number>,
  hyperlinkConfig?: HyperlinkConfig,
  themeColors?: ThemeColorPalette,
  _paragraphToFlowBlocksParam?: unknown,
  converterContext?: ConverterContext,
  options?: TableNodeToBlockOptions,
): FlowBlock | null {
  return tableNodeToBlockImpl(
    node,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    trackedChanges,
    bookmarks,
    hyperlinkConfig,
    themeColors,
    paragraphToFlowBlocks,
    converterContext,
    options ?? {
      converters: {
        // Type assertion needed due to signature mismatch between actual function and type definition
        paragraphToFlowBlocks: paragraphToFlowBlocksImpl as unknown as ParagraphToFlowBlocksConverter,
        imageNodeToBlock,
        vectorShapeNodeToDrawingBlock,
        shapeGroupNodeToDrawingBlock,
        shapeContainerNodeToDrawingBlock,
        shapeTextboxNodeToDrawingBlock,
      },
    },
  );
}
