import { NodeSelection, Selection } from 'prosemirror-state';

const STRUCTURED_CONTENT_NODE_TYPES = new Set(['structuredContent', 'structuredContentBlock']);

function findEnclosingStructuredContentPosition($pos) {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (STRUCTURED_CONTENT_NODE_TYPES.has(node.type.name)) {
      return $pos.before(depth);
    }
  }

  return null;
}

export function getViewModeSelectionWithoutStructuredContent(state) {
  const { selection, doc } = state;

  if (selection instanceof NodeSelection && STRUCTURED_CONTENT_NODE_TYPES.has(selection.node.type.name)) {
    const candidate = Selection.near(doc.resolve(selection.from), -1);
    const candidatePos = findEnclosingStructuredContentPosition(candidate.$from);
    if (candidatePos !== null) return null;
    return candidate;
  }

  if (selection.empty) return null;

  const startPos = findEnclosingStructuredContentPosition(selection.$from);
  const endPos = findEnclosingStructuredContentPosition(selection.$to);

  if (startPos === null || endPos === null || startPos !== endPos) return null;

  return Selection.near(doc.resolve(startPos), -1);
}
