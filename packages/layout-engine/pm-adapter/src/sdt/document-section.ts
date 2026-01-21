/**
 * Document Section Processing Module
 *
 * Functions for processing documentSection SDT containers.
 * Document sections can contain paragraphs, lists, tables, images, and nested SDTs.
 */

import type { FlowBlock, ParagraphBlock, SdtMetadata, TrackedChangeMeta } from '@superdoc/contracts';
import type {
  PMNode,
  BlockIdGenerator,
  PositionMap,
  StyleContext,
  HyperlinkConfig,
  NodeHandlerContext,
  TrackedChangesConfig,
} from '../types.js';
import {
  applySdtMetadataToParagraphBlocks,
  applySdtMetadataToTableBlock,
  resolveNodeSdtMetadata,
  getDocPartGallery,
  getDocPartObjectId,
  getNodeInstruction,
} from './metadata.js';
import { processTocChildren } from './toc.js';

/**
 * Type for paragraph converter function.
 * This is injected to avoid circular dependencies.
 */
type ParagraphConverter = (
  para: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
  defaultFont: string,
  defaultSize: number,
  styleContext: StyleContext,
  trackedChanges?: TrackedChangesConfig,
  bookmarks?: Map<string, number>,
  hyperlinkConfig?: HyperlinkConfig,
) => FlowBlock[];

/**
 * Type for table converter function.
 */
type TableConverter = (
  node: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
  defaultFont: string,
  defaultSize: number,
  styleContext: StyleContext,
  trackedChanges?: TrackedChangesConfig,
  bookmarks?: Map<string, number>,
  hyperlinkConfig?: HyperlinkConfig,
) => FlowBlock | null;

/**
 * Type for image converter function.
 */
type ImageConverter = (
  node: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
  trackedMeta?: TrackedChangeMeta,
  trackedChanges?: TrackedChangesConfig,
) => FlowBlock | null;

/**
 * Context object containing processing dependencies and configuration.
 */
interface ProcessingContext {
  nextBlockId: BlockIdGenerator;
  positions: PositionMap;
  defaultFont: string;
  defaultSize: number;
  styleContext: StyleContext;
  bookmarks?: Map<string, number>;
  hyperlinkConfig: HyperlinkConfig;
}

/**
 * Output accumulator for blocks and block kind tracking.
 */
interface ProcessingOutput {
  blocks: FlowBlock[];
  recordBlockKind: (kind: FlowBlock['kind']) => void;
}

/**
 * Collection of converter functions for different node types.
 */
interface NodeConverters {
  paragraphToFlowBlocks: ParagraphConverter;
  tableNodeToBlock: TableConverter;
  imageNodeToBlock: ImageConverter;
}

/**
 * Processes a paragraph child node by converting it to flow blocks,
 * applying section metadata, and adding to output.
 *
 * @param child - The paragraph PM node to process
 * @param sectionMetadata - The documentSection metadata to apply
 * @param context - Processing context
 * @param output - Output accumulator
 * @param converters - Node converter functions
 */
function processParagraphChild(
  child: PMNode,
  sectionMetadata: SdtMetadata | undefined,
  context: ProcessingContext,
  output: ProcessingOutput,
  converters: NodeConverters,
): void {
  const paragraphBlocks = converters.paragraphToFlowBlocks(
    child,
    context.nextBlockId,
    context.positions,
    context.defaultFont,
    context.defaultSize,
    context.styleContext,
    undefined, // trackedChanges
    context.bookmarks,
    context.hyperlinkConfig,
  );
  applySdtMetadataToParagraphBlocks(
    paragraphBlocks.filter((b) => b.kind === 'paragraph') as ParagraphBlock[],
    sectionMetadata,
  );
  paragraphBlocks.forEach((block) => {
    output.blocks.push(block);
    output.recordBlockKind(block.kind);
  });
}

/**
 * Processes a table child node by converting it to a table block,
 * applying section metadata, and adding to output.
 *
 * @param child - The table PM node to process
 * @param sectionMetadata - The documentSection metadata to apply
 * @param context - Processing context
 * @param output - Output accumulator
 * @param converters - Node converter functions
 */
function processTableChild(
  child: PMNode,
  sectionMetadata: SdtMetadata | undefined,
  context: ProcessingContext,
  output: ProcessingOutput,
  converters: NodeConverters,
): void {
  const tableBlock = converters.tableNodeToBlock(
    child,
    context.nextBlockId,
    context.positions,
    context.defaultFont,
    context.defaultSize,
    context.styleContext,
    undefined,
    undefined,
    context.hyperlinkConfig,
  );
  if (tableBlock) {
    applySdtMetadataToTableBlock(tableBlock, sectionMetadata);
    output.blocks.push(tableBlock);
    output.recordBlockKind(tableBlock.kind);
  }
}

/**
 * Processes an image child node by converting it to an image block,
 * applying section metadata, and adding to output.
 *
 * @param child - The image PM node to process
 * @param sectionMetadata - The documentSection metadata to apply
 * @param context - Processing context
 * @param output - Output accumulator
 * @param converters - Node converter functions
 */
function processImageChild(
  child: PMNode,
  sectionMetadata: SdtMetadata | undefined,
  context: ProcessingContext,
  output: ProcessingOutput,
  converters: NodeConverters,
): void {
  const imageBlock = converters.imageNodeToBlock(child, context.nextBlockId, context.positions);
  if (imageBlock && imageBlock.kind === 'image') {
    // Apply section metadata to image block
    if (sectionMetadata) {
      if (!imageBlock.attrs) imageBlock.attrs = {};
      imageBlock.attrs.sdt = sectionMetadata;
    }
    output.blocks.push(imageBlock);
    output.recordBlockKind(imageBlock.kind);
  }
}

/**
 * Processes a nested structuredContentBlock child by resolving its metadata,
 * processing its grandchildren (paragraphs and tables), and chaining metadata
 * (nested metadata first, then section metadata).
 *
 * @param child - The structuredContentBlock PM node to process
 * @param sectionMetadata - The documentSection metadata to apply
 * @param context - Processing context
 * @param output - Output accumulator
 * @param converters - Node converter functions
 */
function processNestedStructuredContent(
  child: PMNode,
  sectionMetadata: SdtMetadata | undefined,
  context: ProcessingContext,
  output: ProcessingOutput,
  converters: NodeConverters,
): void {
  // Nested structured content block inside section - unwrap and chain metadata
  const nestedMetadata = resolveNodeSdtMetadata(child, 'structuredContentBlock');
  child.content?.forEach((grandchild) => {
    if (grandchild.type === 'paragraph') {
      const paragraphBlocks = converters.paragraphToFlowBlocks(
        grandchild,
        context.nextBlockId,
        context.positions,
        context.defaultFont,
        context.defaultSize,
        context.styleContext,
        undefined, // trackedChanges
        context.bookmarks,
        context.hyperlinkConfig,
      );
      // Apply nested structured content metadata first, then section metadata
      const paraOnly = paragraphBlocks.filter((b) => b.kind === 'paragraph') as ParagraphBlock[];
      applySdtMetadataToParagraphBlocks(paraOnly, nestedMetadata);
      applySdtMetadataToParagraphBlocks(paraOnly, sectionMetadata);
      paragraphBlocks.forEach((block) => {
        output.blocks.push(block);
        output.recordBlockKind(block.kind);
      });
    } else if (grandchild.type === 'table') {
      const tableBlock = converters.tableNodeToBlock(
        grandchild,
        context.nextBlockId,
        context.positions,
        context.defaultFont,
        context.defaultSize,
        context.styleContext,
        undefined,
        undefined,
        context.hyperlinkConfig,
      );
      if (tableBlock) {
        if (nestedMetadata) applySdtMetadataToTableBlock(tableBlock, nestedMetadata);
        applySdtMetadataToTableBlock(tableBlock, sectionMetadata);
        output.blocks.push(tableBlock);
        output.recordBlockKind(tableBlock.kind);
      }
    }
  });
}

/**
 * Processes a documentPartObject child node (e.g., Table of Contents) by
 * handling TOC-specific processing and applying section metadata with special
 * containerSdt logic to preserve docPart metadata.
 *
 * @param child - The documentPartObject PM node to process
 * @param sectionMetadata - The documentSection metadata to apply
 * @param context - Processing context
 * @param output - Output accumulator
 * @param converters - Node converter functions
 */
function processDocumentPartObject(
  child: PMNode,
  sectionMetadata: SdtMetadata | undefined,
  context: ProcessingContext,
  output: ProcessingOutput,
  converters: NodeConverters,
): void {
  // Nested doc part (e.g., TOC) inside section
  const docPartGallery = getDocPartGallery(child);
  const docPartObjectId = getDocPartObjectId(child);
  const tocInstruction = getNodeInstruction(child);
  const docPartSdtMetadata = resolveNodeSdtMetadata(child, 'docPartObject');

  if (docPartGallery === 'Table of Contents') {
    // Track blocks count before processTocChildren so we can apply section metadata after
    const blocksBeforeToc = output.blocks.length;

    processTocChildren(
      Array.from(child.content ?? []),
      { docPartGallery, docPartObjectId, tocInstruction, sdtMetadata: docPartSdtMetadata },
      {
        nextBlockId: context.nextBlockId,
        positions: context.positions,
        defaultFont: context.defaultFont,
        defaultSize: context.defaultSize,
        styleContext: context.styleContext,
        bookmarks: context.bookmarks,
        hyperlinkConfig: context.hyperlinkConfig,
      },
      { blocks: output.blocks, recordBlockKind: output.recordBlockKind },
      converters.paragraphToFlowBlocks,
    );

    // Apply section metadata to TOC paragraphs while preserving docPart metadata
    // TOC paragraphs have docPartObject metadata (gallery, instruction, uniqueId) in attrs.sdt
    // which is critical for TOC functionality. We preserve this in sdt and add section
    // metadata to attrs.containerSdt so painters can render section lock/hide styling.
    for (let i = blocksBeforeToc; i < output.blocks.length; i++) {
      const block = output.blocks[i];
      if (block.kind === 'paragraph') {
        const existingMetadata = block.attrs?.sdt;
        if (existingMetadata?.type === 'docPartObject') {
          // Preserve docPart in sdt, add section to containerSdt
          if (sectionMetadata) {
            if (!block.attrs) block.attrs = {};
            block.attrs.containerSdt = sectionMetadata;
          }
        } else {
          // No conflict - apply section metadata normally
          applySdtMetadataToParagraphBlocks([block], sectionMetadata);
        }
      }
    }
  }
}

/**
 * Processes child nodes within a documentSection, applying section metadata
 * to all contained blocks (paragraphs, lists, tables, images, nested SDTs, TOCs).
 *
 * This function handles the recursive processing of complex document structures
 * while ensuring that SDT metadata is properly propagated to all child blocks.
 *
 * @param children - Child PM nodes within the documentSection to process
 * @param sectionMetadata - The documentSection metadata to apply to children
 * @param context - Processing context including functions, maps, and optional bookmarks
 * @param output - Output accumulator for blocks and block kind tracking
 * @param converters - Converter functions for different node types (dependency injection)
 */
export function processDocumentSectionChildren(
  children: PMNode[],
  sectionMetadata: SdtMetadata | undefined,
  context: ProcessingContext,
  output: ProcessingOutput,
  converters: NodeConverters,
): void {
  children.forEach((child) => {
    if (child.type === 'paragraph') {
      processParagraphChild(child, sectionMetadata, context, output, converters);
    } else if (child.type === 'table') {
      processTableChild(child, sectionMetadata, context, output, converters);
    } else if (child.type === 'image') {
      processImageChild(child, sectionMetadata, context, output, converters);
    } else if (child.type === 'structuredContentBlock' && Array.isArray(child.content)) {
      processNestedStructuredContent(child, sectionMetadata, context, output, converters);
    } else if (child.type === 'documentPartObject' && Array.isArray(child.content)) {
      processDocumentPartObject(child, sectionMetadata, context, output, converters);
    }
    // orderedList and bulletList removed - list handling moved out of layout-engine
  });
}

/**
 * Handle document section nodes.
 * Unwraps SDT documentSection into child blocks (paragraphs, tables, lists, images, etc.).
 *
 * @param node - Document section node to process
 * @param context - Shared handler context
 */
export function handleDocumentSectionNode(node: PMNode, context: NodeHandlerContext): void {
  if (!Array.isArray(node.content)) return;

  const {
    blocks,
    recordBlockKind,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    bookmarks,
    hyperlinkConfig,
    converters,
  } = context;
  const sectionMetadata = resolveNodeSdtMetadata(node, 'documentSection');

  // Get converters from context
  const convertersToUse: NodeConverters = {
    paragraphToFlowBlocks: converters?.paragraphToFlowBlocks || ((): FlowBlock[] => []),
    tableNodeToBlock: converters?.tableNodeToBlock || ((): FlowBlock | null => null),
    imageNodeToBlock: converters?.imageNodeToBlock || ((): FlowBlock | null => null),
  };

  processDocumentSectionChildren(
    node.content,
    sectionMetadata,
    {
      nextBlockId,
      positions,
      defaultFont,
      defaultSize,
      styleContext,
      bookmarks,
      hyperlinkConfig,
    },
    { blocks, recordBlockKind },
    convertersToUse,
  );
}
