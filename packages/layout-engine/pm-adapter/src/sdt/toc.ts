/**
 * Table of Contents (TOC) Processing Module
 *
 * Functions for processing Table of Contents structures from OOXML documents.
 * Handles TOC metadata application and recursive TOC node processing.
 */

import type { FlowBlock, ParagraphBlock, SdtMetadata } from '@superdoc/contracts';
import type {
  PMNode,
  BlockIdGenerator,
  PositionMap,
  HyperlinkConfig,
  TrackedChangesConfig,
  NodeHandlerContext,
  NestedConverters,
  ConverterContext,
  ThemeColorPalette,
} from '../types.js';
import { applySdtMetadataToParagraphBlocks, getNodeInstruction } from './metadata.js';

/**
 * Apply TOC metadata to paragraph blocks.
 * Marks paragraphs as TOC entries and stores TOC-specific metadata.
 *
 * @param blocks - Array of flow blocks (only paragraphs are modified)
 * @param metadata - TOC metadata containing gallery, uniqueId, and instruction
 */
export function applyTocMetadata(
  blocks: FlowBlock[],
  metadata: {
    gallery?: string | null;
    uniqueId?: string | null;
    instruction?: string | null;
  },
): void {
  blocks.forEach((block) => {
    if (block.kind === 'paragraph') {
      if (!block.attrs) block.attrs = {};
      block.attrs.isTocEntry = true;
      // Store TOC metadata as SDT for proper typing
      if (!block.attrs.sdt) {
        block.attrs.sdt = {
          type: 'docPartObject',
          gallery: metadata.gallery,
          uniqueId: metadata.uniqueId,
          instruction: metadata.instruction,
        };
      }
      if (metadata.instruction) {
        block.attrs.tocInstruction = metadata.instruction;
      }
    }
  });
}

/**
 * Process TOC children and add metadata to paragraph blocks.
 * Handles both flat paragraphs and nested tableOfContents structures.
 *
 * This function is typically called from node handlers when processing
 * documentPartObject nodes with gallery="Table of Contents".
 *
 * @param children - Child nodes to process (paragraphs or nested tableOfContents)
 * @param metadata - TOC metadata to apply to all unwrapped paragraphs
 * @param context - Conversion context (fonts, positions, etc.)
 * @param outputArrays - Mutable arrays to append blocks to
 * @param paragraphConverter - Function to convert PM paragraph nodes to FlowBlocks
 *
 * @example
 * ```typescript
 * processTocChildren(
 *   node.content,
 *   {
 *     docPartGallery: 'Table of Contents',
 *     docPartObjectId: 'toc-1',
 *     tocInstruction: 'TOC \\o "1-3" \\h \\z \\u',
 *     sdtMetadata: { type: 'docPartObject', gallery: 'Table of Contents' }
 *   },
 *   context,
 *   { blocks, recordBlockKind },
 *   paragraphToFlowBlocks
 * );
 * ```
 */
export function processTocChildren(
  children: readonly PMNode[],
  metadata: {
    docPartGallery: string;
    docPartObjectId?: string;
    tocInstruction?: string;
    sdtMetadata?: SdtMetadata;
  },
  context: {
    nextBlockId: BlockIdGenerator;
    positions: PositionMap;
    bookmarks: Map<string, number>;
    trackedChangesConfig: TrackedChangesConfig;
    hyperlinkConfig: HyperlinkConfig;
    enableComments: boolean;
    converters: NestedConverters;
    converterContext: ConverterContext;
    themeColors?: ThemeColorPalette;
  },
  outputArrays: {
    blocks: FlowBlock[];
    recordBlockKind?: (kind: FlowBlock['kind']) => void;
  },
): void {
  const paragraphConverter = context.converters.paragraphToFlowBlocks;
  const { docPartGallery, docPartObjectId, tocInstruction } = metadata;
  const { blocks, recordBlockKind } = outputArrays;

  children.forEach((child) => {
    if (child.type === 'paragraph') {
      // Direct paragraph child - convert and tag
      const paragraphBlocks = paragraphConverter({
        para: child,
        nextBlockId: context.nextBlockId,
        positions: context.positions,
        trackedChangesConfig: context.trackedChangesConfig,
        bookmarks: context.bookmarks,
        hyperlinkConfig: context.hyperlinkConfig,
        converters: context.converters,
        enableComments: context.enableComments,
        converterContext: context.converterContext,
      });

      applyTocMetadata(paragraphBlocks, {
        gallery: docPartGallery,
        uniqueId: docPartObjectId,
        instruction: tocInstruction,
      });
      applySdtMetadataToParagraphBlocks(
        paragraphBlocks.filter((b) => b.kind === 'paragraph') as ParagraphBlock[],
        metadata.sdtMetadata,
      );

      paragraphBlocks.forEach((block) => {
        blocks.push(block);
        recordBlockKind?.(block.kind);
      });
    } else if (child.type === 'tableOfContents' && Array.isArray(child.content)) {
      // Nested tableOfContents - recurse with potentially different instruction
      const childInstruction = getNodeInstruction(child);
      const finalInstruction = childInstruction ?? tocInstruction;

      processTocChildren(
        child.content,
        { docPartGallery, docPartObjectId, tocInstruction: finalInstruction, sdtMetadata: metadata.sdtMetadata },
        context,
        outputArrays,
      );
    }
  });
}

/**
 * Handle table of contents nodes.
 * Processes child paragraphs and marks them as TOC entries.
 *
 * @param node - Table of contents node to process
 * @param context - Shared handler context
 */
export function handleTableOfContentsNode(node: PMNode, context: NodeHandlerContext): void {
  if (!Array.isArray(node.content)) return;

  const {
    blocks,
    recordBlockKind,
    nextBlockId,
    positions,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig,
    converters,
    converterContext,
    themeColors,
    enableComments,
  } = context;
  const tocInstruction = getNodeInstruction(node);
  const paragraphToFlowBlocks = converters.paragraphToFlowBlocks;

  node.content.forEach((child) => {
    if (child.type === 'paragraph') {
      const paragraphBlocks = paragraphToFlowBlocks({
        para: child,
        nextBlockId,
        positions,
        trackedChangesConfig,
        bookmarks,
        themeColors,
        hyperlinkConfig,
        converters,
        enableComments,
        converterContext,
      });
      paragraphBlocks.forEach((block) => {
        if (block.kind === 'paragraph') {
          if (!block.attrs) block.attrs = {};
          block.attrs.isTocEntry = true;
          if (tocInstruction) block.attrs.tocInstruction = tocInstruction;
        }
        blocks.push(block);
        recordBlockKind?.(block.kind);
      });
    }
  });
}
