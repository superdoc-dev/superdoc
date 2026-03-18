// @ts-nocheck
import { Extension } from '@core/index.js';
import { parseSizeUnit } from '@core/utilities/index.js';

/**
 * Letter spacing value
 * @typedef {string|number} LetterSpacingValue
 * @description Spacing with optional unit (e.g., '-0.75pt', '1px', 0.5)
 */

/**
 * Configuration options for LetterSpacing
 * @typedef {Object} LetterSpacingOptions
 * @category Options
 * @property {string[]} [types=['textStyle']] - Mark types to add letter spacing support to
 */

/**
 * Attributes for letter spacing
 * @typedef {Object} LetterSpacingAttributes
 * @category Attributes
 * @property {LetterSpacingValue} [letterSpacing] - Letter spacing with unit
 */

/**
 * @module LetterSpacing
 * @sidebarTitle Letter Spacing
 * @snippetPath /snippets/extensions/letter-spacing.mdx
 */
export const LetterSpacing = Extension.create({
  name: 'letterSpacing',

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
          letterSpacing: {
            default: null,
            parseDOM: (el) => el.style.letterSpacing || null,
            renderDOM: (attrs) => {
              if (!attrs.letterSpacing) return {};

              const [value, unit] = parseSizeUnit(attrs.letterSpacing);
              if (Number.isNaN(value)) return {};

              return {
                style: `letter-spacing: ${value}${unit ?? 'pt'}`,
              };
            },
          },
        },
      },
    ];
  },
});
