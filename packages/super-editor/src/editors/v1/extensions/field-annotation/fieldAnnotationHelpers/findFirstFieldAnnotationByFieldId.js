/**
 * Find the first field annotation matching the given field ID.
 *
 * @param {string} fieldId - The field ID to match against `node.attrs.fieldId`.
 * @param {import('./types.js').EditorState} state - The editor state to search.
 * @returns {import('./types.js').FieldAnnotationEntry | null} The first
 *   match, or `null` if none.
 */
export function findFirstFieldAnnotationByFieldId(fieldId, state) {
  let fieldAnnotation = findNode(state.doc, (node) => {
    return node.type.name === 'fieldAnnotation' && node.attrs.fieldId === fieldId;
  });

  return fieldAnnotation;
}

/**
 * @param {import('./types.js').PmNode} node
 * @param {(node: import('./types.js').PmNode) => boolean} predicate
 * @returns {import('./types.js').FieldAnnotationEntry | null}
 */
function findNode(node, predicate) {
  /** @type {import('./types.js').FieldAnnotationEntry | null} */
  let found = null;
  node.descendants((node, pos) => {
    if (predicate(node)) found = { node, pos };
    if (found) return false;
  });
  return found;
}
