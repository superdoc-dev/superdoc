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

/**
 * Recursively collect non-empty text fragments from a comment body payload: a
 * string, a PM/DOCX-schema node, or an array of either. Walks `content`,
 * `elements`, and `nodes` the same way the comment exporter and entity store do.
 */
export function collectCommentTextFragments(value: unknown, sink: string[]): void {
  if (!value) return;

  if (typeof value === 'string') {
    if (value.length > 0) sink.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectCommentTextFragments(item, sink);
    return;
  }

  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string' && record.text.length > 0) sink.push(record.text);

  if (record.content) collectCommentTextFragments(record.content, sink);
  if (record.elements) collectCommentTextFragments(record.elements, sink);
  if (record.nodes) collectCommentTextFragments(record.nodes, sink);
}

/**
 * Value-based test for whether a comment record carries authored body content.
 *
 * By the time a comment reaches export it has been normalized:
 * `useComment.getValues()` always stamps `commentText` (defaulting to '') and
 * `parentCommentId`, and the export translators always stamp `commentJSON`
 * (`[]` or `buildCommentJsonFromText('')`, i.e. a paragraph holding an empty run).
 * A key-presence test therefore reports every row as having a body. This instead
 * walks the actual payload and returns true only when there is non-whitespace
 * authored text.
 *
 * `trackedChangeText` / `deletedText` are the tracked change's OWN text, not
 * comment content, and are intentionally NOT consulted; otherwise every
 * body-less tracked-change projection row would look authored.
 */
export function commentHasMeaningfulContent(comment: unknown): boolean {
  if (!comment || typeof comment !== 'object') return false;
  const record = comment as Record<string, unknown>;

  const fragments: string[] = [];
  collectCommentTextFragments(record.commentText, fragments);
  collectCommentTextFragments(record.commentJSON, fragments);
  collectCommentTextFragments(record.elements, fragments);
  collectCommentTextFragments(record.text, fragments);

  return fragments.join('').trim().length > 0;
}
