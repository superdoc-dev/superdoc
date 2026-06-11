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

function getNextInlineSdt(state) {
  const { $from } = state.selection;

  if ($from.parent.type.name === 'run' && $from.parentOffset === $from.parent.content.size) {
    const runEnd = $from.after($from.depth);
    const node = state.doc.resolve(runEnd).nodeAfter;
    if (node?.type.name !== 'structuredContent') return null;
    return { node, pos: runEnd };
  }

  const node = $from.nodeAfter;
  if (node?.type.name !== 'structuredContent') return null;
  return { node, pos: $from.pos };
}

function selectInlineSdtContent(state, dispatch, sdt) {
  if (dispatch) {
    const contentStart = sdt.pos + 1;
    const contentEnd = sdt.pos + sdt.node.nodeSize - 1;

    dispatch(
      state.tr
        .setMeta(SELECT_INLINE_SDT_BEFORE_RUN_START_META, true)
        .setSelection(TextSelection.create(state.doc, contentStart, contentEnd)),
    );
  }

  return true;
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

    return selectInlineSdtContent(state, dispatch, previousSdt);
  };

/**
 * Selects inline SDT content when Delete is pressed at the end of the
 * previous run. Mirrors selectInlineSdtBeforeRunStart for forward deletion.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const selectInlineSdtAfterRunEnd =
  () =>
  ({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) return false;

    const nextSdt = getNextInlineSdt(state);
    if (!nextSdt) return false;

    return selectInlineSdtContent(state, dispatch, nextSdt);
  };
