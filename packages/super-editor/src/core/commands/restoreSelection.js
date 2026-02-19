import { TextSelection } from 'prosemirror-state';

export const restoreSelection =
  () =>
  ({ editor, state, tr }) => {
    if (editor.options.lastSelection) {
      tr.setSelection(
        TextSelection.create(state.doc, editor.options.lastSelection.from, editor.options.lastSelection.to),
      );
      return true;
    }
    return false;
  };
