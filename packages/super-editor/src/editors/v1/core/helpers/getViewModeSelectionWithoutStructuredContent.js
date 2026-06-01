import { NodeSelection, Selection } from 'prosemirror-state';
import { isStructuredContentNodeType } from '../../extensions/structured-content/nodeTypes.js';

function findEnclosingStructuredContentPosition($pos) {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (isStructuredContentNodeType(node.type.name)) {
      return $pos.before(depth);
    }
  }

  return null;
}

export function getViewModeSelectionWithoutStructuredContent(state) {
  const { selection, doc } = state;

  if (selection instanceof NodeSelection && isStructuredContentNodeType(selection.node.type.name)) {
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
