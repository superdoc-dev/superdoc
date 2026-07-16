import { Plugin, PluginKey } from 'prosemirror-state';
import { isNoteStorySession } from '@core/commands/linkedStyleSplitHelpers.js';

export const noteStyleGuardPluginKey = new PluginKey('noteStyleGuard');

/**
 * SD-3432: invariant guard for note story sessions (footnote/endnote
 * editing). No top-level paragraph may end a transaction without its note
 * paragraph style.
 *
 * The per-command wrappers (splitBlock, joinBackward, joinForward,
 * createParagraphNear, liftEmptyBlock) preserve the style on the paths they
 * cover, but two creators slip through them:
 *
 * - createParagraphNear/liftEmptyBlock fired from a gap or node selection:
 *   there is no source paragraph at the selection, so the restore wrapper
 *   has no styleId to stamp and passes the default-attrs paragraph through.
 * - WebKit DOM-observer reparses: `paragraphProperties` is not rendered to
 *   the DOM (`rendered: false` in the paragraph extension), so a reparse
 *   that crosses a paragraph boundary recreates the paragraph with default
 *   attributes.
 *
 * Both depend on async selection sync and mutation batching, which makes the
 * loss flaky and timing-sensitive. This appendTransaction is the single net
 * under all of them: any top-level paragraph left without a styleId after a
 * doc change is re-stamped with the paragraphProperties of its nearest
 * styled sibling (preferring the previous one, matching Word's continuation
 * semantics and the restore wrappers' source choice). Nested paragraphs
 * (e.g. inside tables) keep their own styles and are not touched.
 *
 * @param {import('../../core/Editor').Editor} editor The owning editor.
 * @returns {import('prosemirror-state').Plugin}
 */
export function createNoteStyleGuardPlugin(editor) {
  return new Plugin({
    key: noteStyleGuardPluginKey,
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      if (!isNoteStorySession(editor)) return null;

      const paragraphs = [];
      newState.doc.forEach((node, offset) => {
        if (node.type.name === 'paragraph') paragraphs.push({ node, pos: offset });
      });
      if (!paragraphs.some(({ node }) => (node.attrs?.paragraphProperties?.styleId ?? null) === null)) {
        return null;
      }

      const styledProps = (index, step) => {
        for (let i = index + step; i >= 0 && i < paragraphs.length; i += step) {
          const props = paragraphs[i].node.attrs?.paragraphProperties;
          if (props?.styleId) return props;
        }
        return null;
      };

      let tr = null;
      paragraphs.forEach(({ node, pos }, index) => {
        if ((node.attrs?.paragraphProperties?.styleId ?? null) !== null) return;
        const sourceProps = styledProps(index, -1) ?? styledProps(index, +1);
        if (!sourceProps) return;
        tr = tr ?? newState.tr;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, paragraphProperties: sourceProps });
      });
      return tr;
    },
  });
}
