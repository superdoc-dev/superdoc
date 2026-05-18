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

export const shouldApplyPainterReadOnly = (blockId: string | undefined): boolean =>
  getNoteStoryKind(blockId) === 'footnote';
