import { TextSelection } from 'prosemirror-state';

export const SELECT_INLINE_SDT_BEFORE_RUN_START_META = 'selectInlineSdtBeforeRunStart';

function getPreviousInlineSdt(state) {
  const { $from } = state.selection;

  if ($from.parent.type.name === 'run' && $from.parentOffset === 0) {
    const runStart = $from.before($from.depth);
    const node = state.doc.resolve(runStart).nodeBefore;
    if (node?.type.name !== 'structuredContent') return null;
    return { node, pos: runStart - node.nodeSize };
  }

  const node = $from.nodeBefore;
  if (node?.type.name !== 'structuredContent') return null;
  return { node, pos: $from.pos - node.nodeSize };
}

/**
 * Selects inline SDT content when Backspace is pressed at the start of the
 * following run. Without this, run-aware Backspace scans into the SDT content.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const selectInlineSdtBeforeRunStart =
  () =>
  ({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) return false;

    const previousSdt = getPreviousInlineSdt(state);
    if (!previousSdt) return false;

    if (dispatch) {
      const contentStart = previousSdt.pos + 1;
      const contentEnd = previousSdt.pos + previousSdt.node.nodeSize - 1;

      dispatch(
        state.tr
          .setMeta(SELECT_INLINE_SDT_BEFORE_RUN_START_META, true)
          .setSelection(TextSelection.create(state.doc, contentStart, contentEnd)),
      );
    }

    return true;
  };
