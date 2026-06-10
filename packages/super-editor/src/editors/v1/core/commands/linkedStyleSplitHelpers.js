import { readTranslatedLinkedStyles } from '@core/parts/adapters/styles-read.js';

/**
 * SD-3400: note story sessions (footnote/endnote editing) keep their
 * paragraph style across structural edits — Word's FootnoteText/EndnoteText
 * have no w:next, so new and merged paragraphs stay note-styled. Header and
 * footer stories keep body behavior.
 */
export const isNoteStorySession = (editor) =>
  Boolean(editor?.options?.parentEditor && !editor?.options?.isHeaderOrFooter);

export const isLinkedParagraphStyleId = (editor, styleId) => {
  if (!styleId) return false;

  const translatedStyles = readTranslatedLinkedStyles(editor)?.styles;
  const styleDefinition = translatedStyles?.[styleId];
  return Boolean(styleDefinition?.type === 'paragraph' && styleDefinition?.link);
};

export const isLinkedCharacterStyleId = (editor, styleId) => {
  if (!styleId) return false;

  const translatedStyles = readTranslatedLinkedStyles(editor)?.styles;
  if (!translatedStyles) return false;
  return Object.values(translatedStyles).some((def) => def?.type === 'paragraph' && def?.link === styleId);
};

export const clearInheritedLinkedStyleId = (attrs, editor, { emptyParagraph = false } = {}) => {
  if (!emptyParagraph) return attrs;
  // SD-3400: pressing Enter in a footnote continues with the note style;
  // clearing it here made new note paragraphs render at the document default
  // size. The clearing heuristic targets body heading-like flows, so it stays
  // active for the body and header/footer.
  if (isNoteStorySession(editor)) return attrs;
  if (!attrs || typeof attrs !== 'object') return attrs;
  const paragraphProperties = attrs.paragraphProperties;
  const styleId = paragraphProperties?.styleId;
  if (!isLinkedParagraphStyleId(editor, styleId)) return attrs;

  return {
    ...attrs,
    paragraphProperties: {
      ...paragraphProperties,
      styleId: null,
    },
  };
};
