/**
 * Find all field annotations between two document positions.
 *
 * @param {number} from - Start position (inclusive).
 * @param {number} to - End position (exclusive).
 * @param {import('./types.js').PmNode} doc - Document node to scan.
 * @returns {import('./types.js').FieldAnnotationEntry[]} `{ node, pos }`
 *   per annotation in range.
 */
export function findFieldAnnotationsBetween(from, to, doc) {
  let fieldAnnotations = [];

  doc.nodesBetween(from, to, (node, pos) => {
    if (!node || node?.nodeSize === undefined) {
      return;
    }

    if (node.type.name === 'fieldAnnotation') {
      fieldAnnotations.push({
        node,
        pos,
      });
    }
  });

  return fieldAnnotations;
}
