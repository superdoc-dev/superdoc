/**
 * Find the text marks from the nearest heading in the document.
 * Returns the marks array from the first text node found in a heading,
 * or an empty array if none exist.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {number} pos - insertion position
 * @returns {readonly import('prosemirror-model').Mark[]}
 */
function findNearbyHeadingMarks(doc, pos) {
  const headingPattern = /^Heading\d$/;
  const resolvedPos = doc.resolve(Math.min(pos, doc.content.size));

  for (let d = resolvedPos.depth; d >= 0; d--) {
    const parent = resolvedPos.node(d);
    const index = resolvedPos.index(d);

    const candidates = [];
    for (let i = index - 1; i >= 0; i--) candidates.push(parent.child(i));
    for (let i = index; i < parent.childCount; i++) candidates.push(parent.child(i));

    for (const node of candidates) {
      if (node.type.name !== 'paragraph') continue;
      const sid = node.attrs.paragraphProperties?.styleId;
      if (!sid || !headingPattern.test(sid)) continue;

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
 * Insert a heading node at an absolute document position.
 *
 * Internally, headings are paragraph nodes with a heading styleId
 * (`Heading1` through `Heading6`) set on `paragraphProperties`.
 *
 * When text is provided, it copies the text formatting from the nearest
 * existing heading so new headings match the document's heading style.
 *
 * @param {{ pos: number; level: number; text?: string; sdBlockId?: string; paraId?: string; tracked?: boolean; styleId?: string }} options
 * @returns {import('./types/index.js').Command}
 */
export const insertHeadingAt =
  ({ pos, level, text = '', sdBlockId, paraId, tracked, styleId }) =>
  ({ state, dispatch }) => {
    const paragraphType = state.schema.nodes.paragraph;
    if (!paragraphType) return false;
    if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;
    if (!Number.isInteger(level) || level < 1 || level > 6) return false;

    const attrs = {
      ...(sdBlockId ? { sdBlockId } : undefined),
      ...(paraId ? { paraId } : undefined),
      paragraphProperties: { styleId: styleId || `Heading${level}` },
    };
    const normalizedText = typeof text === 'string' ? text : '';

    let textNode = null;
    if (normalizedText.length > 0) {
      const marks = findNearbyHeadingMarks(state.doc, pos);
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
