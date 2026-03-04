import { type InlineConverterParams } from './common';

export function bookmarkStartNodeToBlocks({
  node,
  positions,
  bookmarks,
  visitNode,
  inheritedMarks,
  sdtMetadata,
  runProperties,
}: InlineConverterParams): void {
  // Track bookmark position for cross-reference resolution
  const nodeAttrs =
    typeof node.attrs === 'object' && node.attrs !== null ? (node.attrs as Record<string, unknown>) : {};
  const bookmarkName = typeof nodeAttrs.name === 'string' ? nodeAttrs.name : undefined;
  if (bookmarkName && bookmarks) {
    const nodePos = positions.get(node);
    if (nodePos) {
      bookmarks.set(bookmarkName, nodePos.start);
    }
  }
  // Process any content inside the bookmark (usually empty)
  if (Array.isArray(node.content)) {
    node.content.forEach((child) => visitNode(child, inheritedMarks, sdtMetadata, runProperties));
  }
}
