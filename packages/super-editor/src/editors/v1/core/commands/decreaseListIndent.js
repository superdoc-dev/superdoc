// @ts-check
import { changeListLevel } from './changeListLevel.js';

/**
 * Decreases the indent level of the current list item.
 * @returns {Function} A ProseMirror command function.
 */
export const decreaseListIndent =
  () =>
  ({ editor, tr, dispatch }) => {
    const handled = changeListLevel(-1, editor, tr);

    if (handled && dispatch) {
      dispatch(tr);
    }

    return handled;
  };
