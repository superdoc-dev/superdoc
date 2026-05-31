/**
 * Document Part Object Handler
 *
 * Processes documentPartObject nodes (e.g., TOC galleries, page numbers).
 * Applies document part metadata and processes children appropriately.
 */

import type { PMNode, NodeHandlerContext } from '../types.js';
import { emitPendingSectionBreakForParagraph } from '../sections/index.js';
import { getDocPartGallery, getDocPartObjectId, getNodeInstruction, resolveNodeSdtMetadata } from './metadata.js';
import { processTocChildren } from './toc.js';
import { handleParagraphContainerNode } from './paragraph-container.js';
import { handleStructuredContentBlockNode } from './structured-content-block.js';

// Block field children whose paragraphs `findParagraphsWithSectPr` recurses into,
// so their handler must advance currentParagraphIndex in step (delegated to
// handleParagraphContainerNode).
const PARAGRAPH_CONTAINER_TYPES = new Set(['bibliography', 'index', 'tableOfAuthorities']);

/**
 * Handle document part object nodes (e.g., TOC galleries, page numbers).
 * Processes TOC children for Table of Contents galleries.
 * For other gallery types (page numbers, etc.), processes child paragraphs normally.
 *
 * If a section transition occurs inside this SDT, child paragraph processing
 * emits the pending break before the paragraph that starts the next section and
 * advances `currentParagraphIndex` in step with `findParagraphsWithSectPr`.
 *
 * @param node - Document part object node to process
 * @param context - Shared handler context
 */
export function handleDocumentPartObjectNode(node: PMNode, context: NodeHandlerContext): void {
  if (!Array.isArray(node.content)) return;

  const {
    blocks,
    recordBlockKind,
    nextBlockId,
    positions,
    bookmarks,
    hyperlinkConfig,
    sectionState,
    converters,
    converterContext,
    enableComments,
    trackedChangesConfig,
    themeColors,
  } = context;

  const docPartGallery = getDocPartGallery(node);
  const docPartObjectId = getDocPartObjectId(node);
  const tocInstruction = getNodeInstruction(node);
  const docPartSdtMetadata = resolveNodeSdtMetadata(node, 'docPartObject');
  const paragraphToFlowBlocks = converters.paragraphToFlowBlocks;

  if (docPartGallery === 'Table of Contents') {
    processTocChildren(
      Array.from(node.content),
      { docPartGallery, docPartObjectId, tocInstruction, sdtMetadata: docPartSdtMetadata },
      {
        nextBlockId,
        positions,
        bookmarks,
        hyperlinkConfig,
        enableComments,
        trackedChangesConfig,
        themeColors,
        converters,
        converterContext,
        sectionState,
      },
      { blocks, recordBlockKind },
    );
  } else if (paragraphToFlowBlocks) {
    // For non-ToC gallery types (page numbers, etc.), process child paragraphs normally.
    // `findParagraphsWithSectPr` recurses into documentPartObject (SD-2557), so child
    // paragraph indices ARE counted — we must mirror that by emitting pending section
    // breaks and advancing currentParagraphIndex per child.
    for (const child of node.content) {
      if (child.type === 'paragraph') {
        emitPendingSectionBreakForParagraph({ sectionState, nextBlockId, blocks, recordBlockKind });
        const childBlocks = paragraphToFlowBlocks({
          para: child,
          nextBlockId,
          positions,
          trackedChangesConfig,
          bookmarks,
          hyperlinkConfig,
          converters,
          themeColors,
          enableComments,
          converterContext,
        });
        for (const block of childBlocks) {
          blocks.push(block);
          recordBlockKind?.(block.kind);
        }
        if (sectionState) sectionState.currentParagraphIndex++;
      } else if (child.type === 'tableOfContents' && Array.isArray(child.content)) {
        // A nested tableOfContents node (e.g. from a "Custom Table of Contents" SDT where
        // the TOC field codes were preprocessed into an sd:tableOfContents element).
        // Word stores the TOC field codes on the child node, not the wrapper SDT - prefer
        // the child's instruction so per-TOC options aren't lost (mirrors the recursion
        // inside processTocChildren in toc.ts).
        const metadata = {
          docPartGallery: docPartGallery ?? '',
          docPartObjectId,
          tocInstruction: getNodeInstruction(child) ?? tocInstruction,
          sdtMetadata: docPartSdtMetadata,
        };
        const tocContext = {
          nextBlockId,
          positions,
          bookmarks,
          hyperlinkConfig,
          enableComments,
          trackedChangesConfig,
          themeColors,
          converters,
          converterContext,
          sectionState,
        };
        const output = { blocks, recordBlockKind };
        processTocChildren(child.content, metadata, tocContext, output);
      } else if (PARAGRAPH_CONTAINER_TYPES.has(child.type)) {
        // SD-3005: a block field (bibliography / index / table of authorities)
        // generated inside this SDT. Render its entry paragraphs and advance
        // currentParagraphIndex per child to match findParagraphsWithSectPr,
        // which recurses into these node types.
        handleParagraphContainerNode(child, context);
      } else if (child.type === 'structuredContentBlock') {
        // SD-3005: a nested content control (often wrapping a block field).
        // findParagraphsWithSectPr does NOT recurse structuredContentBlock, so
        // its handler renders without advancing currentParagraphIndex.
        handleStructuredContentBlockNode(child, context);
      }
    }
  }
}
