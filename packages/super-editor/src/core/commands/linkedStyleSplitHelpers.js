export const isLinkedParagraphStyleId = (editor, styleId) => {
  if (!styleId || !editor?.converter?.linkedStyles) return false;
  return editor.converter.linkedStyles.some((style) => style.type === 'paragraph' && style.id === styleId);
};

export const clearInheritedLinkedStyleId = (attrs, editor) => {
  if (!attrs || typeof attrs !== 'object') return attrs;
  const paragraphProperties = attrs.paragraphProperties;
  const styleId = paragraphProperties?.styleId;
  if (!isLinkedParagraphStyleId(editor, styleId)) return attrs;

  const nextParagraphProperties = { ...paragraphProperties };
  delete nextParagraphProperties.styleId;

  return {
    ...attrs,
    paragraphProperties: nextParagraphProperties,
  };
};
