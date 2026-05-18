import { shouldApplyPainterReadOnly } from './story.js';

export const applyNoteStoryFrameAttributes = (el: HTMLElement, blockId: string | undefined): void => {
  if (shouldApplyPainterReadOnly(blockId)) {
    el.setAttribute('contenteditable', 'false');
  }
};
