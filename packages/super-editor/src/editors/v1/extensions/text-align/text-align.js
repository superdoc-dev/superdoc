// @ts-nocheck
import { Extension } from '@core/Extension.js';
import { mapDisplayAlignmentToStoredJustification } from '../../core/helpers/paragraph-alignment.js';
import { calculateResolvedParagraphProperties } from '../paragraph/resolvedPropertiesCache.js';

/**
 * Configuration options for TextAlign
 * @typedef {Object} TextAlignOptions
 * @category Options
 * @property {string[]} [alignments=['left', 'center', 'right', 'justify']] - Available alignment options
 * @property {string} [defaultAlignment='left'] - Default text alignment
 */

/**
 * @module TextAlign
 * @sidebarTitle Text Align
 * @snippetPath /snippets/extensions/text-align.mdx
 * @shortcut Mod-Shift-l | setTextAlign('left') | Align text left
 * @shortcut Mod-Shift-e | setTextAlign('center') | Align text center
 * @shortcut Mod-Shift-r | setTextAlign('right') | Align text right
 * @shortcut Mod-Shift-j | setTextAlign('justify') | Justify text
 */
export const TextAlign = Extension.create({
  name: 'textAlign',

  addOptions() {
    return {
      alignments: ['left', 'center', 'right', 'justify'],
    };
  },

  addCommands() {
    return {
      /**
       * Set text alignment
       * @category Command
       * @param {string} alignment - Alignment value (left, center, right, justify)
       * @example
       * editor.commands.setTextAlign('center')
       * editor.commands.setTextAlign('justify')
       */
      setTextAlign:
        (alignment) =>
        ({ commands, state, tr, dispatch }) => {
          const containsAlignment = this.options.alignments.includes(alignment);
          if (!containsAlignment) return false;

          if (!state?.doc || !state?.selection || !tr) {
            const paragraphProperties = getSelectionParagraphProperties(this.editor, state);
            const storedAlignment = mapDisplayAlignmentToStoredJustification(
              alignment,
              paragraphProperties?.rightToLeft,
            );
            return commands.updateAttributes('paragraph', { 'paragraphProperties.justification': storedAlignment });
          }

          const visitedPositions = new Set();
          let touched = false;

          const updateParagraph = (node, pos) => {
            if (node.type.name !== 'paragraph') return true;
            if (visitedPositions.has(pos)) return false;
            visitedPositions.add(pos);

            const paragraphProperties = this.editor
              ? calculateResolvedParagraphProperties(this.editor, node, state.doc.resolve(pos))
              : (node.attrs?.paragraphProperties ?? {});
            const storedAlignment = mapDisplayAlignmentToStoredJustification(
              alignment,
              paragraphProperties?.rightToLeft,
            );
            const existingParagraphProperties = node.attrs?.paragraphProperties ?? {};

            if (existingParagraphProperties.justification === storedAlignment) return false;

            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              paragraphProperties: {
                ...existingParagraphProperties,
                justification: storedAlignment,
              },
            });
            touched = true;
            return false;
          };

          state.selection.ranges.forEach((range) => {
            if (range.$from.pos === range.$to.pos) {
              const paragraph = getParagraphAtSelection(range.$from);
              if (paragraph) updateParagraph(paragraph.node, paragraph.pos);
              return;
            }

            state.doc.nodesBetween(range.$from.pos, range.$to.pos, updateParagraph);
          });

          if (touched && dispatch) dispatch(tr);
          return true;
        },

      /**
       * Remove text alignment (reset to default)
       * @category Command
       * @example
       * editor.commands.unsetTextAlign()
       * @note Resets alignment to the default value
       */
      unsetTextAlign:
        () =>
        ({ commands }) =>
          commands.resetAttributes('paragraph', 'paragraphProperties.justification'),
    };
  },

  addShortcuts() {
    return {
      'Mod-Shift-l': () => this.editor.commands.setTextAlign('left'),
      'Mod-Shift-e': () => this.editor.commands.setTextAlign('center'),
      'Mod-Shift-r': () => this.editor.commands.setTextAlign('right'),
      'Mod-Shift-j': () => this.editor.commands.setTextAlign('justify'),
    };
  },
});

function getSelectionParagraphProperties(editor, state) {
  const paragraph = getParagraphAtSelection(state?.selection?.$from);
  if (!paragraph) return {};
  if (!editor || !state?.doc) return paragraph.node?.attrs?.paragraphProperties ?? {};
  return calculateResolvedParagraphProperties(editor, paragraph.node, state.doc.resolve(paragraph.pos));
}

function getParagraphAtSelection($pos) {
  if (!$pos) return null;
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node?.type?.name === 'paragraph') {
      return { node, pos: depth > 0 ? $pos.before(depth) : 0 };
    }
  }
  return null;
}
