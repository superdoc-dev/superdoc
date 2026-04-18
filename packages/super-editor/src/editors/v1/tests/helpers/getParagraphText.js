export const extractParagraphText = (paragraphNode) => {
  if (!paragraphNode?.content) return '';

  const parts = [];

  paragraphNode.content.forEach((child) => {
    if (child?.type === 'text' && typeof child.text === 'string') {
      parts.push(child.text);
      return;
    }

    if (child?.type === 'run' && Array.isArray(child.content)) {
      child.content.forEach((nested) => {
        if (nested?.type === 'text' && typeof nested.text === 'string') {
          parts.push(nested.text);
        }
      });
    }
  });

  return parts.join('');
};

export const extractRunTextNodes = (paragraphNode) => {
  if (!paragraphNode?.content) return [];
  return paragraphNode.content.flatMap((child) => {
    if (child?.type === 'run' && Array.isArray(child.content)) {
      return child.content.filter((nested) => nested?.type === 'text');
    }
    return child?.type === 'text' ? [child] : [];
  });
};
