// @ts-nocheck
import { Extension } from '@core/index.js';
import { cssColorToHex } from '@core/utilities/cssColorToHex.js';

/**
 * Color value format
 * @typedef {string} ColorValue
 * @description Accepts hex colors (#ff0000), rgb(255,0,0), or named colors (red)
 */

/**
 * Configuration options for Color
 * @typedef {Object} ColorOptions
 * @category Options
 * @property {string[]} [types=['textStyle']] Mark types to add color support to
 */

/**
 * Attributes for color marks
 * @typedef {Object} ColorAttributes
 * @category Attributes
 * @property {ColorValue} [color] Text color value
 * @example
 * // Apply color to selected text
 * editor.commands.setColor('#ff0000')
 *
 * // Remove color
 * editor.commands.unsetColor()
 */

/**
 * @module Color
 * @sidebarTitle Color
 * @snippetPath /snippets/extensions/color.mdx
 */
export const Color = Extension.create({
  name: 'color',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          color: {
            default: null,
            parseDOM: (el) => cssColorToHex(el.style.color),
            renderDOM: (attrs) => {
              if (!attrs.color) return {};
              return { style: `color: ${attrs.color}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      /**
       * Set text color
       * @category Command
       * @param {ColorValue} color - Color value to apply
       * @example
       * // Set to red using hex
       * editor.commands.setColor('#ff0000')
       *
       * @example
       * // Set using rgb
       * editor.commands.setColor('rgb(255, 0, 0)')
       *
       * @example
       * // Set using named color
       * editor.commands.setColor('blue')
       * @note Preserves other text styling attributes
       */
      setColor:
        (color) =>
        ({ chain }) => {
          return chain().setMark('textStyle', { color: color }).run();
        },

      /**
       * Remove text color
       * @category Command
       * @example
       * editor.commands.unsetColor()
       * @note Removes color while preserving other text styles
       */
      unsetColor:
        () =>
        ({ chain }) => {
          return chain().setMark('textStyle', { color: null }).removeEmptyTextStyle().run();
        },
    };
  },
});
