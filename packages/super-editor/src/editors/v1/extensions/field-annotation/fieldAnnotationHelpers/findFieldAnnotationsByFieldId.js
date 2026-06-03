import { findChildren } from '@core/helpers/findChildren.js';

/**
 * Find field annotations by field ID or array of field IDs.
 *
 * @param {string | string[]} fieldIdOrArray - Single field ID or array
 *   of IDs to match against `node.attrs.fieldId`.
 * @param {import('./types.js').EditorState} state - The editor state to search.
 * @returns {import('./types.js').FieldAnnotationEntry[]} Matching
 *   `{ node, pos }` entries.
 */
export function findFieldAnnotationsByFieldId(fieldIdOrArray, state) {
  let fieldAnnotations = findChildren(state.doc, (node) => {
    let isFieldAnnotation = node.type.name === 'fieldAnnotation';
    if (Array.isArray(fieldIdOrArray)) {
      return isFieldAnnotation && fieldIdOrArray.includes(node.attrs.fieldId);
    } else {
      return isFieldAnnotation && node.attrs.fieldId === fieldIdOrArray;
    }
  });

  return fieldAnnotations;
}
