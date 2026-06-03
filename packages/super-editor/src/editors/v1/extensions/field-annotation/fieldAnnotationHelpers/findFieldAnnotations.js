import { getAllFieldAnnotations } from './getAllFieldAnnotations.js';

/**
 * Find field annotations matching a predicate.
 *
 * @param {(node: import('./types.js').PmNode) => boolean} predicate -
 *   Called with each `fieldAnnotation` node; return `true` to keep the entry.
 * @param {import('./types.js').EditorState} state - The editor state to search.
 * @returns {import('./types.js').FieldAnnotationEntry[]} Matching
 *   `{ node, pos }` entries.
 */
export function findFieldAnnotations(predicate, state) {
  let allFieldAnnotations = getAllFieldAnnotations(state);
  let fieldAnnotations = [];

  allFieldAnnotations.forEach((annotation) => {
    if (predicate(annotation.node)) {
      fieldAnnotations.push(annotation);
    }
  });

  return fieldAnnotations;
}
