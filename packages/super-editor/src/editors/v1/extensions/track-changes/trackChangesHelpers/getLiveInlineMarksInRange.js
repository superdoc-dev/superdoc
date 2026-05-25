/**
 * Collect the live PM marks present on inline nodes in `[from, to]`,
 * deduplicated by `${typeName}:${attrsJson}`.
 *
 * @param {object} args
 * @param {import('./types.js').PmNode} args.doc - Document to scan.
 * @param {number} args.from - Range start (inclusive).
 * @param {number} args.to - Range end (exclusive).
 * @returns {import('./types.js').PmMark[]} Unique inline marks in range.
 */
export const getLiveInlineMarksInRange = ({ doc, from, to }) => {
  /** @type {import('./types.js').PmMark[]} */
  const marks = [];
  const seen = new Set();

  doc.nodesBetween(from, to, (node) => {
    if (!node.isInline) {
      return;
    }

    node.marks.forEach((mark) => {
      const key = `${mark.type.name}:${JSON.stringify(mark.attrs || {})}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      marks.push(mark);
    });
  });

  return marks;
};
