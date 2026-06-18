import { liftTarget } from 'prosemirror-transform';
import { isNoteStorySession } from './linkedStyleSplitHelpers.js';

/**
 * Normalize nodes to the default node (paragraph by default).
 * This may be helpful before applying a new node type.
 *
 * The paragraph is the default node because
 * it has the highest priority (priority: 1000) and it's loaded first.
 */
// prettier-ignore
export const clearNodes = () => ({ state, tr, dispatch, editor }) => {
  const { selection } = tr;
  const { ranges } = selection;

  if (!dispatch) return true;

  ranges.forEach(({ $from, $to }) => {
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (node.type.isText) return;

      const { doc, mapping } = tr;
      const $mappedFrom = doc.resolve(mapping.map(pos));
      const $mappedTo = doc.resolve(mapping.map(pos + node.nodeSize));
      const nodeRange = $mappedFrom.blockRange($mappedTo);
      if (!nodeRange) return;

      const targetLiftDepth = liftTarget(nodeRange);

      if (node.type.isTextblock) {
        const { defaultType } = $mappedFrom.parent.contentMatchAt($mappedFrom.index());
        // SD-3400: note paragraphs keep their note style (FootnoteText) even
        // when normalized — clearing it makes them render at the body size.
        const preservedAttrs = isNoteStorySession(editor)
          ? { paragraphProperties: node.attrs?.paragraphProperties }
          : undefined;
        tr.setNodeMarkup(nodeRange.start, defaultType, preservedAttrs);
      }

      if (targetLiftDepth || targetLiftDepth === 0) {
        tr.lift(nodeRange, targetLiftDepth);
      }
    });
  });

  return true;
};
