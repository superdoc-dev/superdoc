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
