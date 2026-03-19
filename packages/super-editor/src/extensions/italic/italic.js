// @ts-nocheck
import { Mark } from '@core/Mark.js';
import { Attribute } from '@core/Attribute.js';
import { createCascadeToggleCommands } from '@extensions/shared/cascade-toggle.js';

/**
 * Configuration options for Italic
 * @typedef {Object} ItalicOptions
 * @category Options
 * @property {Object} [htmlAttributes={}] - HTML attributes for italic elements
 */

/**
 * @module Italic
 * @sidebarTitle Italic
 * @snippetPath /snippets/extensions/italic.mdx
 * @shortcut Mod-i | toggleItalic | Toggle italic formatting
 * @shortcut Mod-I | toggleItalic | Toggle italic formatting (uppercase)
 */
export const Italic = Mark.create({
  name: 'italic',

  addOptions() {
    return {
      htmlAttributes: {},
    };
  },

  addAttributes() {
    return {
      /**
       * @category Attribute
       * @param {string} [value] - Italic toggle value ('0' renders as normal)
       */
      value: {
        default: null,
        renderDOM: (attrs) => {
          if (attrs.value == null) return {};
          if (attrs.value === '0' || !attrs.value) return { style: 'font-style: normal' };
          return {};
        },
      },
    };
  },

  parseDOM() {
    return [
      { tag: 'i' },
      { tag: 'em' },
      { style: 'font-style=italic' },
      { style: 'font-style=normal', clearMark: (m) => m.type.name == 'em' },
    ];
  },

  renderDOM({ htmlAttributes }) {
    const merged = Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes);
    const { value, ...rest } = merged || {};
    if (value === '0') {
      return ['span', rest, 0];
    }
    return ['em', rest, 0];
  },

  addCommands() {
    const { setItalic, unsetItalic, toggleItalic } = createCascadeToggleCommands({
      markName: this.name,
      negationAttrs: { value: '0' },
    });

    return {
      /**
       * Apply italic formatting
       * @category Command
       * @example
       * editor.commands.setItalic()
       */
      setItalic,

      /**
       * Remove italic formatting
       * @category Command
       * @example
       * editor.commands.unsetItalic()
       */
      unsetItalic,

      /**
       * Toggle italic formatting
       * @category Command
       * @example
       * editor.commands.toggleItalic()
       */
      toggleItalic,
    };
  },

  addShortcuts() {
    return {
      'Mod-i': () => this.editor.commands.toggleItalic(),
      'Mod-I': () => this.editor.commands.toggleItalic(),
    };
  },
});
