// @ts-nocheck
import { Extension } from '@core/Extension.js';

/**
 * Configuration options for TextTransform
 * @typedef {Object} TextTransformOptions
 * @category Options
 * @property {string[]} [types=['textStyle']] - Mark types to apply text transform to
 */

/**
 * Attributes for text transform
 * @typedef {Object} TextTransformAttributes
 * @category Attributes
 * @property {string} [textTransform] - Text transform value (uppercase, lowercase, capitalize, none)
 */

/**
 * @module TextTransform
 * @sidebarTitle Text Transform
 * @snippetPath /snippets/extensions/text-transform.mdx
 */
export const TextTransform = Extension.create({
  name: 'textTransform',

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
          /**
           * @category Attribute
           * @param {string} [textTransform] - Text transform value (uppercase, lowercase, capitalize, none)
           */
          textTransform: {
            default: null,
            renderDOM: (attrs) => {
              if (!attrs.textTransform) return {};
              return {
                style: `text-transform: ${attrs.textTransform}`,
              };
            },
          },
        },
      },
    ];
  },
});
