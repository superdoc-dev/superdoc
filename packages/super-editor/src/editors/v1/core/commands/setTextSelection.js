import { TextSelection } from 'prosemirror-state';

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/**
 * Set the text selection to the provided `{ from, to }` positions.
 * Falls back to the current selection when the values are omitted and
 * clamps the positions to the document bounds.
 *
 * @param {{ from?: number, to?: number }} position
 * @returns {import('./types/index.js').Command}
 */
export const setTextSelection =
  ({ from, to }) =>
  ({ state, dispatch, editor }) => {
    if (typeof from !== 'number' && typeof to !== 'number') {
      return false;
    }

    const doc = state.doc;
    const docSize = doc.content.size;

    const nextFrom = clamp(typeof from === 'number' ? from : state.selection.from, 0, docSize);
    const nextToBase = typeof to === 'number' ? to : nextFrom;
    const nextTo = clamp(nextToBase, 0, docSize);

    const [head, anchor] = nextFrom <= nextTo ? [nextFrom, nextTo] : [nextTo, nextFrom];
    const selection = TextSelection.create(doc, head, anchor);

    if (dispatch) {
      const transaction = state.tr.setSelection(selection);
      dispatch(transaction);
    }

    // Prefer direct DOM focus with preventScroll to avoid page jumps
    if (editor?.view?.dom && typeof editor.view.dom.focus === 'function') {
      editor.view.dom.focus({ preventScroll: true });
    } else if (editor?.view && typeof editor.view.focus === 'function') {
      // Fallback for tests or environments without direct DOM access
      editor.view.focus();
    }

    return true;
  };
