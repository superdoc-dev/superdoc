import { findNearbyMarks } from '../helpers/findNearbyMarks.js';

/**
 * Insert a paragraph node at an absolute document position.
 *
 * When text is provided, copies formatting (font, size, etc.) from the
 * nearest body paragraph so new content matches the document.
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

    let textNode = null;
    if (normalizedText.length > 0) {
      const marks = findNearbyMarks(state.doc, pos, { prefer: 'body' });
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
