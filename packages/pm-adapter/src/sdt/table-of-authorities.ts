/**
 * Table of Authorities Processing Module
 *
 * Handles TOA field containers by converting child paragraphs to flow blocks.
 * Follows the same pattern as document-index.ts.
 */

import type { PMNode, NodeHandlerContext } from '../types.js';
import { createSectionBreakBlock, hasIntrinsicBoundarySignals, shouldRequirePageBoundary } from '../sections/index.js';

const getChildren = (node: PMNode): PMNode[] => {
  if (Array.isArray(node.content)) return node.content;
  const content = node.content as { forEach?: (cb: (child: PMNode) => void) => void } | undefined;
  if (content && typeof content.forEach === 'function') {
    const children: PMNode[] = [];
    content.forEach((child) => children.push(child));
    return children;
  }
  return [];
};

export function handleTableOfAuthoritiesNode(node: PMNode, context: NodeHandlerContext): void {
  const children = getChildren(node);
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
