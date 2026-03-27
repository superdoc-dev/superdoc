import { readTranslatedLinkedStyles } from '@core/parts/adapters/styles-read.js';

export const isLinkedParagraphStyleId = (editor, styleId) => {
  if (!styleId) return false;

  const translatedStyles = readTranslatedLinkedStyles(editor)?.styles;
  const styleDefinition = translatedStyles?.[styleId];
  return Boolean(styleDefinition?.type === 'paragraph' && styleDefinition?.link);
};

export const clearInheritedLinkedStyleId = (attrs, editor, { emptyParagraph = false } = {}) => {
  if (!emptyParagraph) return attrs;
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
