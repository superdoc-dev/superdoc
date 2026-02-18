/**
 * Insert a heading node at an absolute document position.
 *
 * Internally, headings are paragraph nodes with a heading styleId
 * (`Heading1` through `Heading6`) set on `paragraphProperties`.
 *
 * Supports optional seed text, deterministic block id assignment, and
 * operation-scoped tracked-change conversion via transaction meta.
 *
 * @param {{ pos: number; level: number; text?: string; sdBlockId?: string; tracked?: boolean }} options
 * @returns {import('./types/index.js').Command}
 */
export const insertHeadingAt =
  ({ pos, level, text = '', sdBlockId, tracked }) =>
  ({ state, dispatch }) => {
    const paragraphType = state.schema.nodes.paragraph;
    if (!paragraphType) return false;
    if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;
    if (!Number.isInteger(level) || level < 1 || level > 6) return false;

    const attrs = {
      ...(sdBlockId ? { sdBlockId } : undefined),
      paragraphProperties: { styleId: `Heading${level}` },
    };
    const normalizedText = typeof text === 'string' ? text : '';
    const textNode = normalizedText.length > 0 ? state.schema.text(normalizedText) : null;

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
