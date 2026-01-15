/**
 * Document Index Processing Module
 *
 * Handles index field containers and keeps section break accounting aligned
 * with the paragraph flow inside the index.
 */

import type { PMNode, NodeHandlerContext } from '../types.js';
import { createSectionBreakBlock, hasIntrinsicBoundarySignals, shouldRequirePageBoundary } from '../sections/index.js';

/**
 * Extracts child nodes from an index node.
 *
 * Handles both array-based content (plain objects) and ProseMirror Fragment-like
 * content (which uses forEach instead of array iteration).
 *
 * @param node - The index node to extract children from
 * @returns Array of child nodes, or empty array if no children
 */
const getIndexChildren = (node: PMNode): PMNode[] => {
  if (Array.isArray(node.content)) return node.content;
  const content = node.content as { forEach?: (cb: (child: PMNode) => void) => void } | undefined;
  if (content && typeof content.forEach === 'function') {
    const children: PMNode[] = [];
    content.forEach((child) => {
      children.push(child);
    });
    return children;
  }
  return [];
};

/**
 * Handle index nodes by converting child paragraphs to flow blocks.
 *
 * @param node - Index node to process
 * @param context - Shared handler context
 */
export function handleIndexNode(node: PMNode, context: NodeHandlerContext): void {
  const children = getIndexChildren(node);
  if (children.length === 0) return;

  const {
    blocks,
    recordBlockKind,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    listCounterContext,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig,
    sectionState,
    converters,
  } = context;

  const paragraphToFlowBlocks = converters?.paragraphToFlowBlocks;
  if (!paragraphToFlowBlocks) {
    return;
  }

  const { getListCounter, incrementListCounter, resetListCounter } = listCounterContext;

  children.forEach((child) => {
    if (child.type !== 'paragraph') {
      return;
    }

    if (sectionState?.ranges?.length > 0) {
      const nextSection = sectionState.ranges[sectionState.currentSectionIndex + 1];
      if (nextSection && sectionState.currentParagraphIndex === nextSection.startParagraphIndex) {
        const currentSection = sectionState.ranges[sectionState.currentSectionIndex];
        const requiresPageBoundary =
          shouldRequirePageBoundary(currentSection, nextSection) || hasIntrinsicBoundarySignals(nextSection);
        const extraAttrs = requiresPageBoundary ? { requirePageBoundary: true } : undefined;
        const sectionBreak = createSectionBreakBlock(nextSection, nextBlockId, extraAttrs);
        blocks.push(sectionBreak);
        recordBlockKind(sectionBreak.kind);
        sectionState.currentSectionIndex++;
      }
    }

    const paragraphBlocks = paragraphToFlowBlocks(
      child,
      nextBlockId,
      positions,
      defaultFont,
      defaultSize,
      styleContext,
      { getListCounter, incrementListCounter, resetListCounter },
      trackedChangesConfig,
      bookmarks,
      hyperlinkConfig,
      undefined, // themeColors - not available in NodeHandlerContext
      context.converterContext,
    );

    paragraphBlocks.forEach((block) => {
      blocks.push(block);
      recordBlockKind(block.kind);
    });

    sectionState.currentParagraphIndex++;
  });
}
