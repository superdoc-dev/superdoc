import { createParagraphNear as originalCreateParagraphNear } from 'prosemirror-commands';
import { isNoteStorySession } from './linkedStyleSplitHelpers.js';
import { findParagraphDepth, restoreParagraphPropertiesAfterDispatch } from './noteParagraphStyle.js';

/**
 * Create a paragraph nearby.
 *
 * SD-3400: the ProseMirror base command creates the new paragraph with
 * default (empty) attributes. In a note story session the new paragraph must
 * keep the note's paragraph style (FootnoteText/EndnoteText), otherwise it
 * renders at the document default size.
 */
//prettier-ignore
export const createParagraphNear = () => ({ state, dispatch, editor }) => {
  if (!dispatch || !isNoteStorySession(editor)) {
    return originalCreateParagraphNear(state, dispatch);
  }

  const sourceDepth = findParagraphDepth(state.selection.$from);
  const sourceProps = sourceDepth ? state.selection.$from.node(sourceDepth).attrs?.paragraphProperties : null;

  return originalCreateParagraphNear(state, restoreParagraphPropertiesAfterDispatch(dispatch, sourceProps));
};
