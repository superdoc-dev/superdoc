/**
 * Selection helpers for list toggling.
 *
 * `toggleList()` updates paragraph attributes in-place. The final selection
 * should feel natural for the initiating interaction:
 * - collapsed caret toggles should leave a collapsed caret in place
 * - ranged / multi-paragraph toggles should keep a ranged selection
 */

/**
 * Returns the closest editable text bounds for a paragraph node.
 *
 * Paragraph content is often wrapped in a `run` node. In that case we want the
 * selection inside the run content, not around the paragraph wrapper itself.
 *
 * @param {number} paragraphPos
 * @param {{ nodeSize?: number, firstChild?: { type?: { name?: string } } | null, lastChild?: { type?: { name?: string } } | null } | null | undefined} paragraphNode
 * @returns {{ from: number, to: number } | null}
 */
export function computeParagraphContentBounds(paragraphPos, paragraphNode) {
  if (!Number.isFinite(paragraphPos) || !paragraphNode || !Number.isFinite(paragraphNode.nodeSize)) {
    return null;
  }

  let from = paragraphPos + 1;
  let to = paragraphPos + paragraphNode.nodeSize - 1;

  if (paragraphNode.firstChild?.type?.name === 'run') {
    from = paragraphPos + 2;
  }

  if (paragraphNode.lastChild?.type?.name === 'run') {
    to = paragraphPos + paragraphNode.nodeSize - 2;
  }

  if (to < from) {
    to = from;
  }

  return { from, to };
}

/**
 * Computes the selection range to restore after toggling list formatting.
 *
 * @param {{
 *   selectionWasCollapsed: boolean,
 *   affectedParagraphCount: number,
 *   firstParagraphPos: number,
 *   lastParagraphPos: number,
 *   firstNode: { nodeSize?: number, firstChild?: { type?: { name?: string } }, lastChild?: { type?: { name?: string } } } | null | undefined,
 *   lastNode: { nodeSize?: number, firstChild?: { type?: { name?: string } }, lastChild?: { type?: { name?: string } } } | null | undefined,
 * }} params
 * @returns {{ from: number, to: number } | null}
 */
export function computeToggleListSelectionRange({
  selectionWasCollapsed,
  affectedParagraphCount,
  firstParagraphPos,
  lastParagraphPos,
  firstNode,
  lastNode,
}) {
  if (affectedParagraphCount <= 0) {
    return null;
  }

  const firstBounds = computeParagraphContentBounds(firstParagraphPos, firstNode);
  const lastBounds = computeParagraphContentBounds(lastParagraphPos, lastNode);

  if (!firstBounds || !lastBounds) {
    return null;
  }

  if (selectionWasCollapsed && affectedParagraphCount === 1) {
    return {
      from: lastBounds.to,
      to: lastBounds.to,
    };
  }

  return {
    from: firstBounds.from,
    to: lastBounds.to,
  };
}
