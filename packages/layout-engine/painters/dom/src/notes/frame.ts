import { shouldApplyPlainFootnotePainterReadOnly } from './story.js';

export const applyNoteStoryFrameAttributes = (el: HTMLElement, blockId: string | undefined): void => {
  if (shouldApplyPlainFootnotePainterReadOnly(blockId)) {
    el.setAttribute('contenteditable', 'false');
  }
};
