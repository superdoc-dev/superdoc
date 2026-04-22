import { Attribute } from '../Attribute.js';
import { getMarkType } from '../helpers/getMarkType.js';
import { isTextSelection } from '../helpers/isTextSelection.js';
import { resolveHeaderFooterSelection } from './helpers/resolveHeaderFooterSelection.js';
import { addParagraphRunProperty } from '../helpers/syncParagraphRunProperties.js';

function canSetMark(state, tr, newMarkType) {
  const selection = resolveHeaderFooterSelection({ tr });
  let cursor = null;

  if (isTextSelection(selection)) {
    cursor = selection.$cursor;
  }

  if (cursor) {
    const currentMarks = state.storedMarks ?? cursor.marks();

    // There can be no current marks that exclude the new mark
    return !!newMarkType.isInSet(currentMarks) || !currentMarks.some((mark) => mark.type.excludes(newMarkType));
  }

  return selection.ranges.some(({ $from, $to }) => {
    let someNodeSupportsMark =
      $from.depth === 0 ? state.doc.inlineContent && state.doc.type.allowsMarkType(newMarkType) : false;

    state.doc.nodesBetween($from.pos, $to.pos, (node, _pos, parent) => {
      // If we already found a mark that we can enable, return false to bypass the remaining search
      if (someNodeSupportsMark) return false;

      if (node.isInline) {
        const parentAllowsMarkType = !parent || parent.type.allowsMarkType(newMarkType);

        //prettier-ignore
        const currentMarksAllowMarkType = (
          !!newMarkType.isInSet(node.marks) || 
          !node.marks.some((otherMark) => otherMark.type.excludes(newMarkType))
        );

        someNodeSupportsMark = parentAllowsMarkType && currentMarksAllowMarkType;
      }
      return !someNodeSupportsMark;
    });

    return someNodeSupportsMark;
  });
}

/**
 * Add a mark with new attrs.
 * @param typeOrName The mark type or name.
 * @param attributes Attributes to add.
 */
//prettier-ignore
export const setMark = (typeOrName, attributes = {}) => ({ tr, state, dispatch }) => {
    const selection = resolveHeaderFooterSelection({ tr });
    const { empty, ranges } = selection;
    const type = getMarkType(typeOrName, state.schema);

    if (dispatch) {
      if (empty) {
        const oldAttributes = Attribute.getMarkAttributes(state, type);
        const newMark = type.create({
          ...oldAttributes,
          ...attributes,
        });

        tr.addStoredMark(
          newMark,
        );
        addParagraphRunProperty(tr, newMark);
      } else {
        ranges.forEach((range) => {
          const from = range.$from.pos;
          const to = range.$to.pos;

          state.doc.nodesBetween(from, to, (node, pos) => {
            const trimmedFrom = Math.max(pos, from);
            const trimmedTo = Math.min(pos + node.nodeSize, to);
            const someHasMark = node.marks.find((mark) => mark.type === type);

            // if there is already a mark of this type
            // we know that we have to merge its attributes
            // otherwise we add a fresh new mark
            if (someHasMark) {
              node.marks.forEach((mark) => {
                if (type === mark.type) {
                  tr.addMark(
                    trimmedFrom,
                    trimmedTo,
                    type.create({
                      ...mark.attrs,
                      ...attributes,
                    }),
                  );
                }
              });
            } else {
              tr.addMark(trimmedFrom, trimmedTo, type.create(attributes));
            }
          });
        });
      }
    }

    return canSetMark(state, tr, type);
  };
