export type NoteStoryKind = 'footnote' | 'endnote' | 'semantic-footnote' | 'semantic-endnote';

export const getNoteStoryKind = (blockId: string | undefined): NoteStoryKind | undefined => {
  if (typeof blockId !== 'string') {
    return undefined;
  }

  if (blockId.startsWith('footnote-')) {
    return 'footnote';
  }
  if (blockId.startsWith('endnote-')) {
    return 'endnote';
  }
  if (blockId.startsWith('__sd_semantic_footnote-')) {
    return 'semantic-footnote';
  }
  if (blockId.startsWith('__sd_semantic_endnote-')) {
    return 'semantic-endnote';
  }

  return undefined;
};

export const isNonBodyStoryBlockId = (blockId: string | undefined): boolean => getNoteStoryKind(blockId) !== undefined;

// AIDEV-NOTE: FootnotesBuilder emits `footnote-{id}-` blocks into the body painter.
// Endnote and semantic note blocks have dedicated editing sessions, so only plain
// footnote story frames are locked at the painter layer.
export const shouldApplyPlainFootnotePainterReadOnly = (blockId: string | undefined): boolean =>
  getNoteStoryKind(blockId) === 'footnote';
