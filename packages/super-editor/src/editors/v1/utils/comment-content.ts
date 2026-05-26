export function buildCommentJsonFromText(text: string): unknown[] {
  const normalized = text.replace(/\r\n?/g, '\n');

  return normalized.split('\n').map((paragraphText) => ({
    type: 'paragraph',
    content: [
      {
        type: 'run',
        content: [
          {
            type: 'text',
            text: paragraphText,
          },
        ],
      },
    ],
  }));
}
