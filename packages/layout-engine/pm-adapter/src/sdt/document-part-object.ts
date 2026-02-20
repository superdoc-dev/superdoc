/**
 * Document Part Object Handler
 *
 * Processes documentPartObject nodes (e.g., TOC galleries, page numbers).
 * Applies document part metadata and processes children appropriately.
 */

import type { PMNode, NodeHandlerContext } from '../types.js';
import { getDocPartGallery, getDocPartObjectId, getNodeInstruction, resolveNodeSdtMetadata } from './metadata.js';
import { processTocChildren } from './toc.js';

/**
 * Handle document part object nodes (e.g., TOC galleries, page numbers).
 * Processes TOC children for Table of Contents galleries.
 * For other gallery types (page numbers, etc.), processes child paragraphs normally.
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
        converters,
        converterContext,
      },
      { blocks, recordBlockKind },
    );
  } else if (paragraphToFlowBlocks) {
    // For non-ToC gallery types (page numbers, etc.), process child paragraphs normally
    for (const child of node.content) {
      if (child.type === 'paragraph') {
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
      }
    }
  }
  // Note: Other documentPartObject types (e.g., Bibliography) are intentionally
  // not processed - they are ignored to maintain backward compatibility.
}
