import { findChildren } from '@core/helpers/findChildren.js';

/**
 * Get all field annotations in the document.
 *
 * @param {import('./types.js').EditorState} state - The editor state to search.
 * @returns {import('./types.js').FieldAnnotationEntry[]} Array of
 *   `{ node, pos }` entries where `node.type.name === 'fieldAnnotation'`.
 *   Empty array if none.
 */
export function getAllFieldAnnotations(state) {
  let fieldAnnotations = findChildren(state.doc, (node) => node.type.name === 'fieldAnnotation');

  return fieldAnnotations;
}
