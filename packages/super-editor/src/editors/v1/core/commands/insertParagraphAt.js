import { buildTextWithTabs } from '../../document-api-adapters/helpers/text-with-tabs.js';

/**
 * Insert a paragraph node at an absolute document position.
 *
 * @param {{ pos: number; text?: string; sdBlockId?: string; paraId?: string; tracked?: boolean }} options
 * @returns {import('./types/index.js').Command}
 */
export const insertParagraphAt =
  ({ pos, text = '', sdBlockId, paraId, tracked }) =>
  ({ state, dispatch }) => {
    const paragraphType = state.schema.nodes.paragraph;
    if (!paragraphType) return false;
    if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;

    const attrs = {
      ...(sdBlockId ? { sdBlockId } : undefined),
      ...(paraId ? { paraId } : undefined),
    };
    const normalizedText = typeof text === 'string' ? text : '';
    // buildTextWithTabs splits '\t' into real tab nodes so exports emit <w:tab/>
    // instead of a raw tab character inside <w:t>.
    const content = normalizedText.length > 0 ? buildTextWithTabs(state.schema, normalizedText, undefined) : null;

    let paragraphNode;
    try {
      paragraphNode =
        paragraphType.createAndFill(attrs, content ?? undefined) ?? paragraphType.create(attrs, content ?? undefined);
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
