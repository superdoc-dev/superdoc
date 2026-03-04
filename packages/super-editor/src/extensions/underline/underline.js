// @ts-nocheck
import { Mark, Attribute } from '@core/index.js';
import { getUnderlineCssString } from '@extensions/linked-styles/index.js';
import { createCascadeToggleCommands } from '@extensions/shared/cascade-toggle.js';

/**
 * Underline style configuration
 * @typedef {Object} UnderlineConfig
 * @property {'single'|'double'|'thick'|'dotted'|'dashed'|'wavy'} value - Style variant
 */

/**
 * Configuration options for Underline
 * @typedef {Object} UnderlineOptions
 * @category Options
 * @property {Object} [htmlAttributes={}] - HTML attributes for underline elements
 */

/**
 * Attributes for underline marks
 * @typedef {Object} UnderlineAttributes
 * @category Attributes
 * @property {UnderlineConfig} [underlineType='single'] - Style of underline
 */
/**
 * @module Underline
 * @sidebarTitle Underline
 * @snippetPath /snippets/extensions/underline.mdx
 * @shortcut Mod-u | toggleUnderline | Toggle underline formatting
 * @shortcut Mod-U | toggleUnderline | Toggle underline formatting (uppercase)
 */
export const Underline = Mark.create({
  name: 'underline',

  addOptions() {
    return {
      htmlAttributes: {},
    };
  },

  parseDOM() {
    return [
      { tag: 'u' },
      { style: 'text-decoration=underline' },
      { style: 'text-decoration=auto', clearMark: (m) => m.type.name == 'u' },
    ];
  },

  renderDOM({ htmlAttributes }) {
    const merged = Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes);
    const type = merged?.underlineType;
    const color = merged?.underlineColor;
    const css = getUnderlineCssString({ type, color });

    // strip custom attribute and merge computed style
    const { style, ...rest } = merged || {};
    const styleString = [style, css].filter(Boolean).join('; ');

    if (type === 'none') {
      return ['span', { ...rest, ...(styleString ? { style: styleString } : {}) }, 0];
    }
    return ['u', { ...rest, ...(styleString ? { style: styleString } : {}) }, 0];
  },

  addAttributes() {
    return {
      /**
       * @category Attribute
       * @param {UnderlineConfig} [underlineType='single'] - Style of underline
       */
      underlineType: {
        default: 'single',
      },
      underlineColor: {
        default: null,
      },
      underlineThemeColor: {
        default: null,
      },
      underlineThemeTint: {
        default: null,
      },
      underlineThemeShade: {
        default: null,
      },
    };
  },

  addCommands() {
    const { setUnderline, unsetUnderline, toggleUnderline } = createCascadeToggleCommands({
      markName: this.name,
      negationAttrs: { underlineType: 'none' },
      isNegation: (attrs) => attrs?.underlineType === 'none',
    });

    return {
      /**
       * Apply underline formatting
       * @category Command
       * @returns {Function} Command
       * @example
       * setUnderline()
       */
      setUnderline,

      /**
       * Remove underline formatting
       * @category Command
       * @returns {Function} Command
       * @example
       * unsetUnderline()
       */
      unsetUnderline,

      /**
       * Toggle underline formatting
       * @category Command
       * @returns {Function} Command
       * @example
       * toggleUnderline()
       */
      toggleUnderline,
    };
  },

  addShortcuts() {
    return {
      'Mod-u': () => this.editor.commands.toggleUnderline(),
      'Mod-U': () => this.editor.commands.toggleUnderline(),
    };
  },
});
