import { getNoteStoryKind } from '@superdoc/dom-contract';

export { getNoteStoryKind, isNonBodyStoryBlockId } from '@superdoc/dom-contract';
export type { NoteStoryKind } from '@superdoc/dom-contract';

// AIDEV-NOTE: FootnotesBuilder emits `footnote-{id}-` blocks into the body painter.
// Endnote and semantic note blocks have dedicated editing sessions, so only plain
// footnote story frames are locked at the painter layer.
export const shouldApplyPlainFootnotePainterReadOnly = (blockId: string | undefined): boolean =>
  getNoteStoryKind(blockId) === 'footnote';
