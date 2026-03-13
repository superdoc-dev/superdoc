import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';

/**
 * Insert a list-item paragraph before/after a target list paragraph position.
 *
 * This command preserves numbering metadata (numId/ilvl) from the target item,
 * and always leaves marker rendering to the numbering plugin.
 *
 * @param {{ pos: number; position: 'before' | 'after'; text?: string; sdBlockId?: string; tracked?: boolean }} options
 * @returns {import('./types/index.js').Command}
 */
export const insertListItemAt =
  ({ pos, position, text = '', sdBlockId, tracked }) =>
  ({ state, dispatch }) => {
    if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;
    if (position !== 'before' && position !== 'after') return false;

    const targetNode = state.doc.nodeAt(pos);
    if (!targetNode || targetNode.type.name !== 'paragraph') return false;

    const resolvedProps = getResolvedParagraphProperties(targetNode);
    const paragraphProperties = targetNode.attrs?.paragraphProperties ?? {};
    const numberingProperties = resolvedProps?.numberingProperties ?? paragraphProperties?.numberingProperties;
    if (!numberingProperties) return false;

    const paragraphType = state.schema.nodes.paragraph;
    if (!paragraphType) return false;

    const newParagraphProperties = {
      ...paragraphProperties,
      numberingProperties: { ...numberingProperties },
    };

    const attrs = {
      ...(targetNode.attrs ?? {}),
      sdBlockId: sdBlockId ?? null,
      paraId: null,
      textId: null,
      listRendering: null,
      paragraphProperties: newParagraphProperties,
      numberingProperties: newParagraphProperties.numberingProperties,
    };

    const normalizedText = typeof text === 'string' ? text : '';
    const textNode = normalizedText.length > 0 ? state.schema.text(normalizedText) : undefined;

    let paragraphNode;
    try {
      paragraphNode =
        paragraphType.createAndFill(attrs, textNode) ?? paragraphType.create(attrs, textNode ? [textNode] : undefined);
    } catch {
      return false;
    }
    if (!paragraphNode) return false;

    const insertPos = position === 'before' ? pos : pos + targetNode.nodeSize;
    if (!Number.isInteger(insertPos) || insertPos < 0 || insertPos > state.doc.content.size) return false;

    if (!dispatch) return true;

    try {
      const tr = state.tr.insert(insertPos, paragraphNode).setMeta('inputType', 'programmatic');
      if (tracked === true) tr.setMeta('forceTrackChanges', true);
      else if (tracked === false) tr.setMeta('skipTrackChanges', true);
      dispatch(tr);
      return true;
    } catch {
      return false;
    }
  };
