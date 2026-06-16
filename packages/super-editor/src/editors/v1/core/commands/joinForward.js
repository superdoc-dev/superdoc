import { joinForward as originalJoinForward } from 'prosemirror-commands';
import { isNoteStorySession } from './linkedStyleSplitHelpers.js';
import { findParagraphDepth, restoreParagraphPropertiesAfterDispatch } from './noteParagraphStyle.js';

/**
 * Join two nodes forward.
 *
 * If the selection is empty and the cursor is at the end of a
 * textblock, try to reduce or remove the boundary between that block
 * and the one after it, either by joining them or by moving the other
 * block closer to this one in the tree structure. Will use the view
 * for accurate start-of-textblock detection if given.
 *
 * https://prosemirror.net/docs/ref/#commands.joinForward
 */
//prettier-ignore
export const joinForward = () => ({ state, dispatch, editor }) => {
  // SD-3400: keep the current paragraph's note style on forward joins.
  if (dispatch && isNoteStorySession(editor)) {
    const depth = findParagraphDepth(state.selection.$from);
    const props = depth ? state.selection.$from.node(depth).attrs?.paragraphProperties : null;
    dispatch = restoreParagraphPropertiesAfterDispatch(dispatch, props);
  }
  const { selection, doc } = state;
  const { $from } = selection;

  if (
    !$from.parent.isTextblock || 
    $from.parentOffset > 0
  ) {
    // Normal case, let original handle it
    return originalJoinForward(state, dispatch);
  }

  const beforePos = $from.before();
  const nodeBefore = doc.resolve(beforePos).nodeBefore;
  const nodeAfter = doc.resolve(beforePos).nodeAfter;

  // Dont join lists
  const isList = (node) => node?.type.name === 'orderedList' || node?.type.name === 'bulletList';
  if (isList(nodeBefore) || isList(nodeAfter)) {
    return false;
  }

  return originalJoinForward(state, dispatch);
};
