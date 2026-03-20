/**
 * Find the text marks (fontFamily, fontSize, etc.) from the nearest
 * body paragraph in the document. Returns the marks array from the
 * first text node found, or an empty array if none exist.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {number} pos - insertion position
 * @returns {readonly import('prosemirror-model').Mark[]}
 */
function findNearbyTextMarks(doc, pos) {
  const headingPattern = /^Heading\d$/;
  const resolvedPos = doc.resolve(Math.min(pos, doc.content.size));

  // Walk up the tree looking for sibling paragraphs
  for (let d = resolvedPos.depth; d >= 0; d--) {
    const parent = resolvedPos.node(d);
    const index = resolvedPos.index(d);

    // Check paragraphs before the insertion point first, then after
    const candidates = [];
    for (let i = index - 1; i >= 0; i--) candidates.push(parent.child(i));
    for (let i = index; i < parent.childCount; i++) candidates.push(parent.child(i));

    for (const node of candidates) {
      if (node.type.name !== 'paragraph') continue;
      // Skip headings — we want body text formatting
      const sid = node.attrs.paragraphProperties?.styleId;
      if (sid && headingPattern.test(sid)) continue;

      // Find the first text node with marks
      let found = null;
      node.descendants((child) => {
        if (found) return false;
        if (child.isText && child.marks.length > 0) {
          found = child.marks;
          return false;
        }
      });
      if (found) return found;
    }
  }

  return [];
}

/**
 * Insert a paragraph node at an absolute document position.
 *
 * When text is provided, it copies the text formatting (font, size, etc.)
 * from the nearest body paragraph so new content matches the document.
 *
 * @param {{ pos: number; text?: string; sdBlockId?: string; paraId?: string; tracked?: boolean; styleId?: string }} options
 * @returns {import('./types/index.js').Command}
 */
export const insertParagraphAt =
  ({ pos, text = '', sdBlockId, paraId, tracked, styleId }) =>
  ({ state, dispatch }) => {
    const paragraphType = state.schema.nodes.paragraph;
    if (!paragraphType) return false;
    if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;

    const attrs = {
      ...(sdBlockId ? { sdBlockId } : undefined),
      ...(paraId ? { paraId } : undefined),
      ...(styleId ? { paragraphProperties: { styleId } } : undefined),
    };
    const normalizedText = typeof text === 'string' ? text : '';

    // Create text node with marks copied from nearest paragraph
    let textNode = null;
    if (normalizedText.length > 0) {
      const marks = findNearbyTextMarks(state.doc, pos);
      textNode = marks.length > 0 ? state.schema.text(normalizedText, marks) : state.schema.text(normalizedText);
    }

    let paragraphNode;
    try {
      paragraphNode =
        paragraphType.createAndFill(attrs, textNode ?? undefined) ??
        paragraphType.create(attrs, textNode ? [textNode] : undefined);
    } catch {
      return false;
    }

    if (!paragraphNode) return false;

    try {
      const tr = state.tr.insert(pos, paragraphNode);
      if (!dispatch) return true;
      tr.setMeta('inputType', 'programmatic');
      if (tracked === true) tr.setMeta('forceTrackChanges', true);
      else if (tracked === false) tr.setMeta('skipTrackChanges', true);
      dispatch(tr);
      return true;
    } catch {
      return false;
    }
  };
