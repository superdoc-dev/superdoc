import { findNearbyMarks } from '../helpers/findNearbyMarks.js';

/**
 * Insert a heading node at an absolute document position.
 *
 * Copies text marks (fontFamily, color) from the nearest heading
 * or body paragraph so new headings match the document's font.
 *
 * @param {{ pos: number; level: number; text?: string; sdBlockId?: string; paraId?: string; tracked?: boolean }} options
 * @returns {import('./types/index.js').Command}
 */
export const insertHeadingAt =
  ({ pos, level, text = '', sdBlockId, paraId, tracked }) =>
  ({ state, dispatch }) => {
    const paragraphType = state.schema.nodes.paragraph;
    if (!paragraphType) return false;
    if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;
    if (!Number.isInteger(level) || level < 1 || level > 6) return false;

    const attrs = {
      ...(sdBlockId ? { sdBlockId } : undefined),
      ...(paraId ? { paraId } : undefined),
      paragraphProperties: { styleId: `Heading${level}` },
    };
    const normalizedText = typeof text === 'string' ? text : '';

    let textNode = null;
    if (normalizedText.length > 0) {
      const rawMarks = findNearbyMarks(state.doc, pos, { prefer: 'heading' });
      // Strip fontSize from copied marks — headings should keep their style-level size.
      const marks = rawMarks.map((mark) => {
        if (mark.type.name === 'textStyle' && mark.attrs.fontSize != null) {
          const { fontSize: _, ...rest } = mark.attrs;
          return mark.type.create(rest);
        }
        return mark;
      });
      const meaningful = marks.filter(
        (m) => m.type.name !== 'textStyle' || Object.values(m.attrs).some((v) => v != null),
      );
      textNode =
        meaningful.length > 0 ? state.schema.text(normalizedText, meaningful) : state.schema.text(normalizedText);
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
