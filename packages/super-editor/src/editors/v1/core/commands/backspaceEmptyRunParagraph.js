import { TextSelection } from 'prosemirror-state';

/**
 * Removes a paragraph that only contains an empty run when backspacing inside it.
 * Prevents deleting the only paragraph in the document.
 * @returns {import('@core/commands/types').Command}
 */
export const backspaceEmptyRunParagraph =
  () =>
  ({ state, dispatch }) => {
    const { $from } = state.selection;
    if (!state.selection.empty) return false;

    const paraType = state.schema.nodes.paragraph;
    const runType = state.schema.nodes.run;
    const para = $from.parent;

    // Only paragraph → one run → run has no content
    if (
      para.type !== paraType ||
      para.childCount !== 1 ||
      para.firstChild.type !== runType ||
      para.firstChild.content.size
    )
      return false;

    // Avoid producing an empty doc
    if (state.doc.childCount === 1 && $from.depth === 1) return false;

    if (dispatch) {
      const paraPos = $from.before(); // position of the paragraph
      let tr = state.tr.deleteRange(paraPos, paraPos + para.nodeSize).scrollIntoView();
      const targetPos = Math.max(1, Math.min(paraPos - 1, tr.doc.content.size));
      tr = tr.setSelection(TextSelection.create(tr.doc, targetPos));
      dispatch(tr);
    }
    return true;
  };
