// @ts-nocheck
import { Extension } from '@core/Extension.js';
import { parseSizeUnit, minMax } from '@core/utilities/index.js';

/**
 * Do we need a unit conversion system?
 *
 * For reference.
 * https://github.com/remirror/remirror/tree/HEAD/packages/remirror__extension-font-size
 * https://github.com/remirror/remirror/blob/83adfa93f9a320b6146b8011790f27096af9340b/packages/remirror__core-utils/src/dom-utils.ts
 */

/**
 * Font size configuration
 * @typedef {Object} FontSizeDefaults
 * @property {number} [value=12] - Default font size value
 * @property {string} [unit='pt'] - Default unit (pt, px, em, rem)
 * @property {number} [min=8] - Minimum allowed size
 * @property {number} [max=96] - Maximum allowed size
 */

/**
 * Font size value
 * @typedef {string|number} FontSizeValue
 * @description Size with optional unit (e.g., '12pt', '16px', 14)
 */

/**
 * Configuration options for FontSize
 * @typedef {Object} FontSizeOptions
 * @category Options
 * @property {string[]} [types=['textStyle', 'tableCell']] - Node/mark types to add font size support to
 * @property {FontSizeDefaults} [defaults] - Default size configuration
 */

/**
 * Attributes for font size
 * @typedef {Object} FontSizeAttributes
 * @category Attributes
 * @property {FontSizeValue} [fontSize] - Font size with unit
 */

/**
 * @module FontSize
 * @sidebarTitle Font Size
 * @snippetPath /snippets/extensions/font-size.mdx
 */
export const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle', 'tableCell'],
      defaults: {
        value: 12,
        unit: 'pt',
        min: 8,
        max: 96,
      },
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseDOM: (el) => el.style.fontSize,
            renderDOM: (attrs) => {
              if (!attrs.fontSize) return {};
              let [value, unit] = parseSizeUnit(attrs.fontSize);
              if (Number.isNaN(value)) return {};
              unit = unit ? unit : this.options.defaults.unit;
              return { style: `font-size: ${value}${unit}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      /**
       * Set font size
       * @category Command
       * @param {FontSizeValue} fontSize - Size to apply (with optional unit)
       * @example
       * editor.commands.setFontSize('14pt')
       * editor.commands.setFontSize('18px')
       * editor.commands.setFontSize(16)
       * @note Automatically clamps to min/max values
       */
      setFontSize:
        (fontSize) =>
        ({ chain }) => {
          let value, unit;

          if (typeof fontSize === 'number') {
            value = fontSize;
            unit = null;
          } else {
            [value, unit] = parseSizeUnit(fontSize);
          }

          if (Number.isNaN(value)) {
            return false;
          }

          let { min, max, unit: defaultUnit } = this.options.defaults;
          value = minMax(Number(value), min, max);
          unit = unit ? unit : defaultUnit;

          return chain()
            .setMark('textStyle', { fontSize: `${value}${unit}` })
            .run();
        },

      /**
       * Remove font size
       * @category Command
       * @example
       * editor.commands.unsetFontSize()
       * @note Reverts to default document size
       */
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
        },
    };
  },
});
