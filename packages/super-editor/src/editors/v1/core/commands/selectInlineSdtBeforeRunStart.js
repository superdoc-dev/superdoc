import { NodeSelection } from 'prosemirror-state';

export const SELECT_INLINE_SDT_BEFORE_RUN_START_META = 'selectInlineSdtBeforeRunStart';

function blocksWrapperDelete(node) {
  return node.attrs.lockMode === 'sdtLocked' || node.attrs.lockMode === 'sdtContentLocked';
}

/**
 * Selects an inline SDT wrapper when Backspace is pressed at the start of the
 * following run. Without this, run-aware Backspace scans into the SDT content.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const selectInlineSdtBeforeRunStart =
  () =>
  ({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) return false;

    const { $from } = selection;
    if ($from.parent.type.name !== 'run') return false;
    if ($from.parentOffset !== 0) return false;

    const runStart = $from.before($from.depth);
    const previousSibling = state.doc.resolve(runStart).nodeBefore;
    if (previousSibling?.type.name !== 'structuredContent') return false;

    if (blocksWrapperDelete(previousSibling)) return true;

    if (dispatch) {
      dispatch(
        state.tr
          .setMeta(SELECT_INLINE_SDT_BEFORE_RUN_START_META, true)
          .setSelection(NodeSelection.create(state.doc, runStart - previousSibling.nodeSize)),
      );
    }

    return true;
  };
