/**
 * Structured Content Block Handler
 *
 * Processes SDT structuredContentBlock nodes, applying metadata to nested
 * paragraphs and tables while preserving their content structure.
 */

import type { ParagraphBlock, TableBlock } from '@superdoc/contracts';
import type { PMNode, NodeHandlerContext } from '../types.js';
import { resolveNodeSdtMetadata, applySdtMetadataToParagraphBlocks, applySdtMetadataToTableBlock } from './metadata.js';

/**
 * Handle structured content block nodes.
 * Processes child paragraphs and tables, applying SDT metadata.
 *
 * @param node - Structured content block node to process
 * @param context - Shared handler context
 */
export function handleStructuredContentBlockNode(node: PMNode, context: NodeHandlerContext): void {
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
    enableComments,
    themeColors,
  } = context;
  const structuredContentMetadata = resolveNodeSdtMetadata(node, 'structuredContentBlock');
  const paragraphToFlowBlocks = converters.paragraphToFlowBlocks;

  // SD-1333: a documentPartObject is a transparent SDT wrapper. When it sits
  // as a direct child of a structuredContentBlock (e.g. a Signature SDT
  // wrapping a PAGE field), treat its inner paragraph/table children as if
  // they were direct children of the structuredContentBlock and apply the
  // outer SDT metadata to them.
  const visitChild = (child: PMNode): void => {
    if (child.type === 'paragraph') {
      const paragraphBlocks = paragraphToFlowBlocks({
        para: child,
        nextBlockId,
        positions,
        trackedChangesConfig,
        bookmarks,
        hyperlinkConfig,
        themeColors,
        enableComments,
        converters,
        converterContext,
      });
      applySdtMetadataToParagraphBlocks(
        paragraphBlocks.filter((b) => b.kind === 'paragraph') as ParagraphBlock[],
        structuredContentMetadata,
      );
      paragraphBlocks.forEach((block) => {
        blocks.push(block);
        recordBlockKind?.(block.kind);
      });
      return;
    }
    if (child.type === 'table') {
      const tableNodeToBlock = converters?.tableNodeToBlock;
      if (tableNodeToBlock) {
        const tableBlock = tableNodeToBlock(child, {
          nextBlockId,
          positions,
          trackedChangesConfig,
          bookmarks,
          hyperlinkConfig,
          themeColors,
          enableComments,
          converters,
          converterContext,
        });
        if (tableBlock) {
          applySdtMetadataToTableBlock(tableBlock as TableBlock, structuredContentMetadata);
          blocks.push(tableBlock);
          recordBlockKind?.(tableBlock.kind);
        }
      }
      return;
    }
    if (child.type === 'documentPartObject' && Array.isArray(child.content)) {
      child.content.forEach(visitChild);
    }
  };

  node.content.forEach(visitChild);
}
