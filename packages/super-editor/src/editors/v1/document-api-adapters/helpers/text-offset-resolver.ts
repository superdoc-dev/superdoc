import type { Node as ProseMirrorNode } from 'prosemirror-model';

export type TextOffsetRange = {
  start: number;
  end: number;
};

export type ResolvedTextRange = {
  from: number;
  to: number;
};

function resolveSegmentPosition(
  targetOffset: number,
  segmentStart: number,
  segmentLength: number,
  docFrom: number,
  docTo: number,
): number {
  if (segmentLength <= 1) {
    return targetOffset <= segmentStart ? docFrom : docTo;
  }
  return docFrom + (targetOffset - segmentStart);
}

/**
 * Converts an absolute ProseMirror position inside a block to the block's
 * flattened text offset (same model as {@link resolveTextRangeInBlock}:
 * text = length, leaf atoms = 1, block separators = 1, inline wrapper
 * tokens = 0). Returns the total flattened length when `pmPos` is at or
 * past the end of the block.
 *
 * Use this for any PM-selection → TextTarget conversion — subtracting
 * `pmPos - blockPos - 1` is wrong for blocks with inline wrappers
 * (`run`, etc.) or leaf atoms, because PM positions include wrapper
 * boundary tokens that the flattened model does not.
 */
export function pmPositionToTextOffset(blockNode: ProseMirrorNode, blockPos: number, pmPos: number): number {
  const contentStart = blockPos + 1;
  if (pmPos <= contentStart) return 0;

  let offset = 0;
  let done = false;

  const visit = (node: ProseMirrorNode, docPos: number): void => {
    if (done) return;

    if (node.isText) {
      const text = node.text ?? '';
      const endPos = docPos + text.length;
      if (pmPos >= endPos) {
        offset += text.length;
      } else {
        offset += Math.max(0, pmPos - docPos);
        done = true;
      }
      return;
    }

    if (node.isLeaf) {
      const endPos = docPos + node.nodeSize;
      if (pmPos >= endPos) {
        offset += 1;
      } else {
        // pmPos falls inside (or at the start of) the leaf; snap to start.
        done = true;
      }
      return;
    }

    visitContent(node, docPos + 1);
  };

  const visitContent = (node: ProseMirrorNode, contentPos: number): void => {
    let isFirst = true;
    let childOffset = 0;
    for (let i = 0; i < node.childCount; i += 1) {
      if (done) return;
      const child = node.child(i);
      const childPos = contentPos + childOffset;

      if (child.isBlock && !isFirst) {
        if (pmPos >= childPos + 1) {
          offset += 1;
        } else {
          done = true;
          return;
        }
      }

      visit(child, childPos);
      childOffset += child.nodeSize;
      isFirst = false;
    }
  };

  visitContent(blockNode, contentStart);
  return offset;
}

/**
 * Computes the total flattened text length of a block node using the same
 * offset model as {@link resolveTextRangeInBlock}: text contributes its
 * length, leaf atoms contribute 1, block separators contribute 1.
 */
export function computeTextContentLength(blockNode: ProseMirrorNode): number {
  let length = 0;

  const walk = (node: ProseMirrorNode): void => {
    if (node.isText) {
      length += (node.text ?? '').length;
      return;
    }
    if (node.isLeaf) {
      length += 1;
      return;
    }
    // Non-leaf, non-text: walk children
    let first = true;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.isBlock && !first) length += 1; // block separator
      walk(child);
      first = false;
    }
  };

  let first = true;
  for (let i = 0; i < blockNode.childCount; i++) {
    const child = blockNode.child(i);
    if (child.isBlock && !first) length += 1;
    walk(child);
    first = false;
  }

  return length;
}

/**
 * Resolves block-relative text offsets into absolute ProseMirror positions.
 *
 * Uses the same flattened text model as search:
 * - Text contributes its length.
 * - Leaf atoms contribute 1.
 * - Inline wrappers contribute only their inner text.
 * - Block separators contribute 1 between block children.
 */
export function resolveTextRangeInBlock(
  blockNode: ProseMirrorNode,
  blockPos: number,
  range: TextOffsetRange,
): ResolvedTextRange | null {
  if (range.start < 0 || range.end < range.start) return null;

  let offset = 0;
  let fromPos: number | undefined;
  let toPos: number | undefined;

  const advanceSegment = (segmentLength: number, docFrom: number, docTo: number) => {
    const segmentStart = offset;
    const segmentEnd = offset + segmentLength;

    if (fromPos == null && range.start <= segmentEnd) {
      fromPos = resolveSegmentPosition(range.start, segmentStart, segmentLength, docFrom, docTo);
    }
    if (toPos == null && range.end <= segmentEnd) {
      toPos = resolveSegmentPosition(range.end, segmentStart, segmentLength, docFrom, docTo);
    }

    offset = segmentEnd;
  };

  const walkNodeContent = (node: ProseMirrorNode, contentStart: number) => {
    let isFirstChild = true;
    let childOffset = 0;

    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      const childPos = contentStart + childOffset;

      if (child.isBlock && !isFirstChild) {
        advanceSegment(1, childPos, childPos + 1);
      }

      walkNode(child, childPos);
      childOffset += child.nodeSize;
      isFirstChild = false;
    }
  };

  const walkNode = (node: ProseMirrorNode, docPos: number) => {
    if (node.isText) {
      const text = node.text ?? '';
      if (text.length > 0) {
        advanceSegment(text.length, docPos, docPos + text.length);
      }
      return;
    }

    if (node.isLeaf) {
      advanceSegment(1, docPos, docPos + node.nodeSize);
      return;
    }

    walkNodeContent(node, docPos + 1);
  };

  walkNodeContent(blockNode, blockPos + 1);

  // Empty text blocks have no traversable segments. A collapsed 0..0 range
  // should still resolve to the block start so inserts can target blank docs.
  if (offset === 0 && range.start === 0 && range.end === 0) {
    const anchor = blockPos + 1;
    return { from: anchor, to: anchor };
  }

  if (range.end > offset) return null;
  if (fromPos == null || toPos == null) return null;
  return { from: fromPos, to: toPos };
}
