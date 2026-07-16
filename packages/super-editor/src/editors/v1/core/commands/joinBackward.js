import { joinBackward as originalJoinBackward } from 'prosemirror-commands';
import { isNoteStorySession } from './linkedStyleSplitHelpers.js';
import { findParagraphDepth, restoreParagraphPropertiesAfterDispatch } from './noteParagraphStyle.js';

/**
 * Join two nodes backward.
 *
 * If the selection is empty and at the start of a textblock, try to
 * reduce the distance between that block and the one before it—if
 * there's a block directly before it that can be joined, join them.
 * If not, try to move the selected block closer to the next one in
 * the document structure by lifting it out of its parent or moving it
 * into a parent of the previous block. Will use the view for accurate
 * (bidi-aware) start-of-textblock detection if given.
 *
 * https://prosemirror.net/docs/ref/#commands.joinBackward
 */
//prettier-ignore
export const joinBackward = () => ({ state, dispatch, editor }) => {
  const { selection, doc } = state;
  const { $from } = selection;

  // SD-3400: in note sessions, the merged paragraph must keep the note
  // paragraph style. PM's join keeps the first paragraph's attrs in simple
  // joins, but the deleteBarrier restructuring path can drop them.
  const guardedDispatch = (paragraphProps) =>
    isNoteStorySession(editor) ? restoreParagraphPropertiesAfterDispatch(dispatch, paragraphProps) : dispatch;

  if (
    !$from.parent.isTextblock || 
    $from.parentOffset > 0
  ) {
    // Normal case, let original handle it
    return originalJoinBackward(state, dispatch);
  }

  const beforePos = $from.before();
  const nodeBefore = doc.resolve(beforePos).nodeBefore;
  const nodeAfter = doc.resolve(beforePos).nodeAfter;

  // Dont join lists
  const isList = (node) => node?.type.name === 'orderedList' || node?.type.name === 'bulletList';
  if (isList(nodeBefore) || isList(nodeAfter)) {
    return false;
  }

  // The join survivor is the paragraph BEFORE the cut; its style wins (Word).
  const survivorProps =
    nodeBefore?.type?.name === 'paragraph'
      ? nodeBefore.attrs?.paragraphProperties
      : (findParagraphDepth($from) ? $from.node(findParagraphDepth($from)).attrs?.paragraphProperties : null);

  return originalJoinBackward(state, dispatch ? guardedDispatch(survivorProps) : dispatch);
};
