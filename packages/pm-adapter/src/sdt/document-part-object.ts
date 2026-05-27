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
      }
    }
  }
  // Note: Other documentPartObject types (e.g., Bibliography) are intentionally
  // not processed - they are ignored to maintain backward compatibility.
}
