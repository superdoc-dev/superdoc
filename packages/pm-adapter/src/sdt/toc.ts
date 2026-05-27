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
import { emitPendingSectionBreakForParagraph } from '../sections/index.js';
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
      // Only fabricate SDT metadata when the TOC came from a w:sdt/w:docPartObj
      // wrapper (gallery is set). A direct `tableOfContents` PM node has no
      // enclosing SDT, so inventing one here would mislead downstream consumers.
      if (!block.attrs.sdt && metadata.gallery) {
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
    // Optional: only set when the TOC is wrapped in a w:sdt/w:docPartObj.
    // Direct `tableOfContents` PM nodes omit this — no SDT metadata is fabricated.
    docPartGallery?: string;
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
    sectionState?: NodeHandlerContext['sectionState'];
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
      // SD-2557: emit any pending section break before this child. `findParagraphsWithSectPr`
      // recurses into documentPartObject, so TOC child paragraph indices are part of the
      // section-range counting — advance the counter after processing to stay in sync.
      emitPendingSectionBreakForParagraph({
        sectionState: context.sectionState,
        nextBlockId: context.nextBlockId,
        blocks,
        recordBlockKind,
      });

      // Direct paragraph child - convert and tag
      const paragraphBlocks = paragraphConverter({
        para: child,
        nextBlockId: context.nextBlockId,
        positions: context.positions,
        trackedChangesConfig: context.trackedChangesConfig,
        bookmarks: context.bookmarks,
        hyperlinkConfig: context.hyperlinkConfig,
        themeColors: context.themeColors,
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

      if (context.sectionState) context.sectionState.currentParagraphIndex++;
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
 * Handle direct `tableOfContents` PM nodes (not wrapped in a `documentPartObject`
 * SDT). Delegates to `processTocChildren` — the single code path that also
 * services `handleDocumentPartObjectNode`. This keeps the section-range
 * counting contract intact: `findParagraphsWithSectPr` counts every
 * `tableOfContents` child, and `processTocChildren` advances
 * `sectionState.currentParagraphIndex` per child so deferred section breaks
 * fire at the right paragraph boundary (SD-2557).
 *
 * @param node - Table of contents node to process
 * @param context - Shared handler context
 */
export function handleTableOfContentsNode(node: PMNode, context: NodeHandlerContext): void {
  if (!Array.isArray(node.content)) return;

  processTocChildren(
    node.content,
    {
      // No enclosing SDT — omit gallery so applyTocMetadata does not fabricate
      // a docPartObject sdt entry on each TOC paragraph.
      tocInstruction: getNodeInstruction(node),
    },
    {
      nextBlockId: context.nextBlockId,
      positions: context.positions,
      bookmarks: context.bookmarks,
      trackedChangesConfig: context.trackedChangesConfig,
      hyperlinkConfig: context.hyperlinkConfig,
      enableComments: context.enableComments,
      themeColors: context.themeColors,
      converters: context.converters,
      converterContext: context.converterContext,
      sectionState: context.sectionState,
    },
    { blocks: context.blocks, recordBlockKind: context.recordBlockKind },
  );
}
