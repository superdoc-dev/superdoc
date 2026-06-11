/**
 * Paragraph-Container Field Module
 *
 * Shared handler for block field containers whose children are paragraphs:
 * bibliography, document index, and table of authorities. Each converts its
 * child paragraphs to flow blocks while keeping section-break accounting
 * aligned with the paragraph flow. The three previously hand-rolled identical
 * copies of this loop; they now delegate here.
 */

import type { PMNode, NodeHandlerContext } from '../types.js';
import { createSectionBreakBlock, hasIntrinsicBoundarySignals, shouldRequirePageBoundary } from '../sections/index.js';

/**
 * Extract child nodes from a paragraph-container node.
 *
 * Handles both array-based content (plain objects) and ProseMirror
 * Fragment-like content (which uses forEach instead of array iteration).
 *
 * @param node - The container node to extract children from
 * @returns Array of child nodes, or empty array if no children
 */
export const getParagraphContainerChildren = (node: PMNode): PMNode[] => {
  if (Array.isArray(node.content)) return node.content;
  const content = node.content as { forEach?: (cb: (child: PMNode) => void) => void } | undefined;
  if (content && typeof content.forEach === 'function') {
    const children: PMNode[] = [];
    content.forEach((child) => children.push(child));
    return children;
  }
  return [];
};

/**
 * Convert a paragraph-container field's child paragraphs to flow blocks,
 * emitting pending section breaks and advancing the section-break paragraph
 * counter as it goes.
 *
 * @param node - The container node (bibliography / index / tableOfAuthorities)
 * @param context - Shared handler context
 */
export function handleParagraphContainerNode(node: PMNode, context: NodeHandlerContext): void {
  const children = getParagraphContainerChildren(node);
  if (children.length === 0) return;

  const {
    blocks,
    recordBlockKind,
    nextBlockId,
    positions,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig,
    sectionState,
    converters,
    themeColors,
    enableComments,
  } = context;

  const paragraphToFlowBlocks = converters.paragraphToFlowBlocks;

  children.forEach((child) => {
    if (child.type !== 'paragraph') return;

    if ((sectionState?.ranges?.length ?? 0) > 0) {
      const nextSection = sectionState!.ranges[sectionState!.currentSectionIndex + 1];
      if (nextSection && sectionState!.currentParagraphIndex === nextSection.startParagraphIndex) {
        const currentSection = sectionState!.ranges[sectionState!.currentSectionIndex];
        const requiresPageBoundary =
          shouldRequirePageBoundary(currentSection, nextSection) || hasIntrinsicBoundarySignals(nextSection);
        const extraAttrs = requiresPageBoundary ? { requirePageBoundary: true } : undefined;
        const sectionBreak = createSectionBreakBlock(nextSection, nextBlockId, extraAttrs);
        blocks.push(sectionBreak);
        recordBlockKind?.(sectionBreak.kind);
        sectionState!.currentSectionIndex++;
      }
    }

    const paragraphBlocks = paragraphToFlowBlocks({
      para: child,
      nextBlockId,
      positions,
      trackedChangesConfig,
      bookmarks,
      hyperlinkConfig,
      themeColors,
      converterContext: context.converterContext,
      enableComments,
      converters,
    });

    paragraphBlocks.forEach((block) => {
      blocks.push(block);
      recordBlockKind?.(block.kind);
    });

    sectionState!.currentParagraphIndex++;
  });
}
