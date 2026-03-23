// @ts-nocheck
import { Mark } from '@core/Mark.js';
import { Attribute } from '@core/Attribute.js';
import { createCascadeToggleCommands } from '@extensions/shared/cascade-toggle.js';

/**
 * Configuration options for Strike
 * @typedef {Object} StrikeOptions
 * @category Options
 * @property {Object} [htmlAttributes={}] - HTML attributes for strikethrough elements
 */

/**
 * @module Strike
 * @sidebarTitle Strike
 * @snippetPath /snippets/extensions/strike.mdx
 * @shortcut Mod-Shift-x | toggleStrike | Toggle strikethrough formatting
 */
export const Strike = Mark.create({
  name: 'strike',

  addOptions() {
    return {
      htmlAttributes: {},
    };
  },

  parseDOM() {
    return [
      { tag: 's' },
      { style: 'text-decoration=line-through' },
      { style: 'text-decoration=auto', clearMark: (m) => m.type.name == 's' },
    ];
  },

  renderDOM({ mark, htmlAttributes }) {
    const merged = Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes);
    const { value } = mark.attrs;
    const { ...rest } = merged || {};
    if (value === '0' || value === false) {
      return ['span', rest, 0];
    }
    return ['s', rest, 0];
  },

  addCommands() {
    const { setStrike, unsetStrike, toggleStrike } = createCascadeToggleCommands({
      markName: this.name,
      negationAttrs: { value: '0' },
    });

    return {
      /**
       * Apply strikethrough formatting
       * @category Command
       * @example
       * editor.commands.setStrike()
       */
      setStrike,

      /**
       * Remove strikethrough formatting
       * @category Command
       * @example
       * editor.commands.unsetStrike()
       */
      unsetStrike,

      /**
       * Toggle strikethrough formatting
       * @category Command
       * @example
       * editor.commands.toggleStrike()
       */
      toggleStrike,
    };
  },

  addAttributes() {
    return {
      /**
       * @category Attribute
       * @param {string} [value] - Strike toggle value ('0' renders as normal)
       */
      value: {
        default: null,
        renderDOM: (attrs) => {
          if (attrs.value == null) return {};
          if (attrs.value === '0' || !attrs.value) {
            return { style: 'text-decoration: none' };
          }
          return {};
        },
      },
    };
  },

  addShortcuts() {
    return {
      'Mod-Shift-x': () => this.editor.commands.toggleStrike(),
      'Mod-Shift-X': () => this.editor.commands.toggleStrike(),
    };
  },
});
