/**
 * Insert a paragraph node at an absolute document position.
 *
 * Supports optional seed text, deterministic block id assignment, and
 * operation-scoped tracked-change conversion via transaction meta.
 *
 * @param {{ pos: number; text?: string; sdBlockId?: string; tracked?: boolean }} options
 * @returns {import('./types/index.js').Command}
 */
export const insertParagraphAt =
  ({ pos, text = '', sdBlockId, tracked }) =>
  ({ state, dispatch }) => {
    const paragraphType = state.schema.nodes.paragraph;
    if (!paragraphType) return false;
    if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;

    const attrs = sdBlockId ? { sdBlockId } : undefined;
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

    // Validate the structural insertion before the dispatch guard so that
    // editor.can().insertParagraphAt() accurately reflects feasibility.
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
