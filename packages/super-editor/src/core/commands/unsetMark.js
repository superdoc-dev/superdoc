import { getMarkRange } from '../helpers/getMarkRange.js';
import { getMarkType } from '../helpers/getMarkType.js';
import { removeParagraphRunProperty } from '../helpers/syncParagraphRunProperties.js';

/**
 * Remove all marks in the current selection.
 * @param typeOrName Mark type or name.
 * @param options.extendEmptyMarkRange Removes the mark even across the current selection.
 */
//prettier-ignore
export const unsetMark = (typeOrName, options = {}) => ({ tr, state, dispatch, editor }) => {
  const { extendEmptyMarkRange = false } = options;
  let { selection } = tr;
  if (editor.options.isHeaderOrFooter) {
    selection = editor.options.lastSelection;
  }
  const type = getMarkType(typeOrName, state.schema);
  const { $from, empty, ranges } = selection;

  if (!dispatch) return true;

  const markToRemove =
    (tr.storedMarks ?? state.storedMarks ?? $from.marks()).find((mark) => mark.type === type) ?? {
      type,
      attrs: {},
    };

  if (empty && extendEmptyMarkRange) {
    let { from, to } = selection;
    const attrs = $from.marks().find((mark) => mark.type === type)?.attrs;
    const range = getMarkRange($from, type, attrs);

    if (range) {
      from = range.from;
      to = range.to;
    }

    tr.removeMark(from, to, type);
  } else {
    ranges.forEach((range) => {
      tr.removeMark(range.$from.pos, range.$to.pos, type);
    });
  }

  tr.removeStoredMark(type);
  removeParagraphRunProperty(tr, markToRemove);

  return true;
};
