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
        ({ commands, state }) => {
          const containsAlignment = this.options.alignments.includes(alignment);
          if (!containsAlignment) return false;
          const $from = state?.selection?.$from;
          let paragraphNode = null;
          let paragraphDepth = -1;

          if ($from) {
            for (let depth = $from.depth; depth >= 0; depth--) {
              const nodeAtDepth = $from.node(depth);
              if (nodeAtDepth?.type?.name === 'paragraph') {
                paragraphNode = nodeAtDepth;
                paragraphDepth = depth;
                break;
              }
            }
          }

          let paragraphProperties = paragraphNode?.attrs?.paragraphProperties ?? {};

          if (this.editor && $from && paragraphNode && paragraphDepth > 0) {
            const paragraphStartPos = $from.before(paragraphDepth);
            const paragraphPos = state.doc.resolve(paragraphStartPos);
            paragraphProperties = calculateResolvedParagraphProperties(this.editor, paragraphNode, paragraphPos);
          }

          const storedAlignment = mapDisplayAlignmentToStoredJustification(alignment, paragraphProperties?.rightToLeft);
          return commands.updateAttributes('paragraph', { 'paragraphProperties.justification': storedAlignment });
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
