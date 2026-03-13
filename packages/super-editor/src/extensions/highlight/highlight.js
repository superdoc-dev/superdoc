// @ts-nocheck
import { Mark, Attribute } from '@core/index.js';
import { cssColorToHex } from '@core/utilities/cssColorToHex.js';

/**
 * Configuration options for Highlight
 * @typedef {Object} HighlightOptions
 * @category Options
 * @property {Object} [htmlAttributes={}] - HTML attributes for highlight elements
 */

/**
 * Attributes for highlight marks
 * @typedef {Object} HighlightAttributes
 * @category Attributes
 * @property {string} [color] - Background color (CSS color value)
 */

/**
 * @module Highlight
 * @sidebarTitle Highlight
 * @snippetPath /snippets/extensions/highlight.mdx
 * @shortcut Mod-Shift-h | toggleHighlight | Toggle highlighted formatting
 */
export const Highlight = Mark.create({
  name: 'highlight',

  addOptions() {
    return {
      htmlAttributes: {},
    };
  },

  addAttributes() {
    return {
      color: {
        default: null,
        parseDOM: (element) => cssColorToHex(element.getAttribute('data-color') || element.style.backgroundColor),
        renderDOM: (attributes) => {
          if (!attributes.color) {
            return {};
          }
          return {
            'data-color': attributes.color,
            style: `background-color: ${attributes.color}; color: inherit`,
          };
        },
      },
    };
  },

  parseDOM() {
    return [
      { tag: 'mark' },
      {
        style: 'background-color',
        getAttrs: (value) => {
          if (!value || value === 'transparent' || value === 'inherit' || value === 'initial' || value === 'unset')
            return false;
          const color = cssColorToHex(value);
          return color ? { color } : false;
        },
      },
    ];
  },

  renderDOM({ htmlAttributes }) {
    return ['mark', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },

  addCommands() {
    return {
      /**
       * Apply highlight with specified color
       * @category Command
       * @param {string} color - CSS color value
       * @example
       * editor.commands.setHighlight('#FFEB3B')
       * editor.commands.setHighlight('rgba(255, 235, 59, 0.5)')
       */
      setHighlight:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),

      /**
       * Remove highlight formatting
       * @category Command
       * @example
       * editor.commands.unsetHighlight()
       */
      unsetHighlight:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),

      /**
       * Toggle highlight formatting
       * @category Command
       * @example
       * editor.commands.toggleHighlight()
       */
      toggleHighlight:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },

  addShortcuts() {
    return {
      'Mod-Shift-h': () => this.editor.commands.toggleHighlight(),
    };
  },
});
