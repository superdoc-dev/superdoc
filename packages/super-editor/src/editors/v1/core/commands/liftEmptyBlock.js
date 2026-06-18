import { liftEmptyBlock as originalLiftEmptyBlock } from 'prosemirror-commands';
import { isNoteStorySession } from './linkedStyleSplitHelpers.js';
import { findParagraphDepth, restoreParagraphPropertiesAfterDispatch } from './noteParagraphStyle.js';

/**
 * If the cursor is in an empty textblock that can be lifted, lift the block.
 *
 * SD-3400: when the base command splits instead of lifting, the resulting
 * paragraph can lose its attributes; in note story sessions re-stamp the
 * note paragraph style.
 *
 * https://prosemirror.net/docs/ref/#commands.liftEmptyBlock
 */
//prettier-ignore
export const liftEmptyBlock = () => ({ state, dispatch, editor }) => {
  if (!dispatch || !isNoteStorySession(editor)) {
    return originalLiftEmptyBlock(state, dispatch);
  }

  const sourceDepth = findParagraphDepth(state.selection.$from);
  const sourceProps = sourceDepth ? state.selection.$from.node(sourceDepth).attrs?.paragraphProperties : null;

  return originalLiftEmptyBlock(state, restoreParagraphPropertiesAfterDispatch(dispatch, sourceProps));
};
