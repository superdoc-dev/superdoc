import { posToDOMRect } from '@core/helpers/index.js';
import { getAllFieldAnnotations } from './getAllFieldAnnotations.js';

/**
 * Get all field annotations in the document, paired with their DOM
 * bounding rect from the current view.
 *
 * @param {import('./types.js').EditorView} view - The editor view; used
 *   to compute DOM rects.
 * @param {import('./types.js').EditorState} state - The editor state to search.
 * @returns {import('./types.js').FieldAnnotationEntryWithRect[]}
 *   `{ node, pos, rect }` per annotation. `rect` is the bounding rect
 *   from `view.coordsAtPos`.
 */
export function getAllFieldAnnotationsWithRect(view, state) {
  let fieldAnnotations = getAllFieldAnnotations(state).map(({ node, pos }) => {
    let rect = posToDOMRect(view, pos, pos + node.nodeSize);
    return {
      node,
      pos,
      rect,
    };
  });

  return fieldAnnotations;
}
