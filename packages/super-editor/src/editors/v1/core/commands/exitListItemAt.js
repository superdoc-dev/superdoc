import { updateNumberingProperties } from './changeListLevel.js';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';

/**
 * Remove list numbering from the paragraph at a specific position.
 *
 * Unlike cursor-driven removeNumbering commands, this operation is explicit
 * and ignores caret/empty-line guards.
 *
 * @param {{ pos: number }} options
 * @returns {import('./types/index.js').Command}
 */
export const exitListItemAt =
  ({ pos }) =>
  ({ state, tr, editor, dispatch }) => {
    if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;

    const paragraph = state.doc.nodeAt(pos);
    if (!paragraph || paragraph.type.name !== 'paragraph') return false;

    const resolvedProps = getResolvedParagraphProperties(paragraph);
    const numberingProperties =
      resolvedProps?.numberingProperties ?? paragraph.attrs?.paragraphProperties?.numberingProperties;
    if (!numberingProperties) return false;

    updateNumberingProperties(null, paragraph, pos, editor, tr);
    if (dispatch) dispatch(tr);
    return true;
  };
