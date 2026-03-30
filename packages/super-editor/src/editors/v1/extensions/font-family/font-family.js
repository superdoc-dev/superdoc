// @ts-nocheck
import { Extension } from '@core/Extension.js';

/**
 * Font family value
 * @typedef {string} FontFamilyValue
 * @description CSS font-family string (e.g., 'Arial', 'Times New Roman', 'sans-serif')
 */

/**
 * Configuration options for FontFamily
 * @typedef {Object} FontFamilyOptions
 * @category Options
 * @property {string[]} [types=['textStyle']] Mark types to add font family support to
 */

/**
 * Attributes for font family marks
 * @typedef {Object} FontFamilyAttributes
 * @category Attributes
 * @property {FontFamilyValue} [fontFamily] Font family for text
 * @example
 * // Set font family on selected text
 * editor.commands.setFontFamily('Arial')
 *
 * // Change to serif font
 * editor.commands.setFontFamily('Georgia, serif')
 *
 * // Remove custom font
 * editor.commands.unsetFontFamily()
 */

/**
 * @module FontFamily
 * @sidebarTitle Font Family
 * @snippetPath /snippets/extensions/font-family.mdx
 */
export const FontFamily = Extension.create({
  name: 'fontFamily',

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
          fontFamily: {
            default: null,
            parseDOM: (el) => el.style.fontFamily?.replace(/['"]+/g, ''),
            renderDOM: (attrs) => {
              if (!attrs.fontFamily) return {};
              return { style: `font-family: ${attrs.fontFamily}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      /**
       * Set font family
       * @category Command
       * @param {FontFamilyValue} fontFamily - Font family to apply
       * @example
       * // Set to Arial
       * editor.commands.setFontFamily('Arial')
       *
       * @example
       * // Set to serif font
       * editor.commands.setFontFamily('Georgia, serif')
       * @note Preserves other text styling attributes
       */
      setFontFamily:
        (fontFamily) =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontFamily }).run();
        },

      /**
       * Remove font family
       * @category Command
       * @example
       * editor.commands.unsetFontFamily()
       * @note Reverts to default document font
       */
      unsetFontFamily:
        () =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run();
        },
    };
  },
});
