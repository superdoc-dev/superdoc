// @ts-check
import { objectIncludes } from '../utilities/objectIncludes.js';

/**
 * Get the range of a mark in a document
 * @param {Array<import("prosemirror-model").Mark>} marks
 * @param {import("prosemirror-model").MarkType} type
 * @param {Object} attrs
 * @returns {Object} The range of the mark in the document
 */
function findMarkInSet(marks, type, attrs = {}) {
  return marks.find((item) => {
    return item.type === type && objectIncludes(item.attrs, attrs);
  });
}

/**
 * Check if a mark is in a set of marks
 * @param {Array<import("prosemirror-model").Mark>} marks
 * @param {import("prosemirror-model").MarkType} type
 * @param {Object} attrs
 * @returns {boolean} True if the mark is in the set, false otherwise
 */
function isMarkInSet(marks, type, attrs = {}) {
  return !!findMarkInSet(marks, type, attrs);
}

/**
 * Get the range of a mark in a document
 * @param {import("prosemirror-model").ResolvedPos} $pos - The position in the document
 * @param {import("prosemirror-model").MarkType} type - The type of the mark
 * @param {Object} attrs - The attributes of the mark
 * @returns {Object} The range of the mark in the document
 */
export function getMarkRange($pos, type, attrs = {}) {
  if (!$pos || !type) return;

  let start = $pos.parent.childAfter($pos.parentOffset);

  if ($pos.parentOffset === start.offset && start.offset !== 0) {
    start = $pos.parent.childBefore($pos.parentOffset);
  }

  if (!start.node) return;

  const mark = findMarkInSet([...start.node.marks], type, attrs);
  if (!mark) return;

  let startIndex = start.index;
  let startPos = $pos.start() + start.offset;
  let endIndex = startIndex + 1;
  let endPos = startPos + start.node.nodeSize;

  findMarkInSet([...start.node.marks], type, attrs);

  while (startIndex > 0 && mark.isInSet($pos.parent.child(startIndex - 1).marks)) {
    startIndex -= 1;
    startPos -= $pos.parent.child(startIndex).nodeSize;
  }

  while (endIndex < $pos.parent.childCount && isMarkInSet([...$pos.parent.child(endIndex).marks], type, attrs)) {
    endPos += $pos.parent.child(endIndex).nodeSize;
    endIndex += 1;
  }

  return { from: startPos, to: endPos };
}
