// @ts-nocheck
import { Mark } from '@core/Mark.js';
import { Attribute } from '@core/Attribute.js';
import { createCascadeToggleCommands } from '@extensions/shared/cascade-toggle.js';

/**
 * Configuration options for Bold
 * @typedef {Object} BoldOptions
 * @category Options
 * @property {Object} [htmlAttributes] HTML attributes for the strong element
 */

/**
 * Attributes for bold marks
 * @typedef {Object} BoldAttributes
 * @category Attributes
 * @property {string} [value] Bold weight value ('0' renders as normal)
 */

/**
 * @module Bold
 * @sidebarTitle Bold
 * @snippetPath /snippets/extensions/bold.mdx
 * @shortcut Mod-b | toggleBold | Toggle bold formatting
 * @shortcut Mod-B | toggleBold | Toggle bold formatting (uppercase)
 */
export const Bold = Mark.create({
  name: 'bold',

  addOptions() {
    return {
      htmlAttributes: {},
    };
  },

  addAttributes() {
    return {
      value: {
        default: null,
        renderDOM: (attrs) => {
          if (attrs.value == null) return {};
          if (attrs.value === '0' || !attrs.value) {
            return { style: 'font-weight: normal' };
          }
          return {};
        },
      },
    };
  },

  parseDOM() {
    return [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (node) => node.style.fontWeight != 'normal' && null },
      { style: 'font-weight=400', clearMark: (m) => m.type.name == 'strong' },
      { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null },
    ];
  },

  renderDOM({ htmlAttributes }) {
    const merged = Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes);
    const { value, ...rest } = merged || {};
    if (value === '0') {
      return ['span', rest, 0];
    }
    return ['strong', rest, 0];
  },

  addCommands() {
    const { setBold, unsetBold, toggleBold } = createCascadeToggleCommands({
      markName: this.name,
      negationAttrs: { value: '0' },
    });

    return {
      /**
       * Apply bold formatting
       * @category Command
       * @example
       * editor.commands.setBold()
       * @note '0' renders as normal weight
       */
      setBold,

      /**
       * Remove bold formatting
       * @category Command
       * @example
       * editor.commands.unsetBold()
       */
      unsetBold,

      /**
       * Toggle bold formatting
       * @category Command
       * @example
       * editor.commands.toggleBold()
       */
      toggleBold,
    };
  },

  addShortcuts() {
    return {
      'Mod-b': () => this.editor.commands.toggleBold(),
      'Mod-B': () => this.editor.commands.toggleBold(),
    };
  },
});
