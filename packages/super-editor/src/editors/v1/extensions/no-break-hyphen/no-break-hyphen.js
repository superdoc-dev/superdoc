// @ts-nocheck

import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

const NON_BREAKING_HYPHEN = '‑';

/**
 * Configuration options for NoBreakHyphenNode
 * @typedef {Object} NoBreakHyphenNodeOptions
 * @category Options
 * @property {Object} [htmlAttributes] - HTML attributes for the rendered element
 */

/**
 * @module NoBreakHyphenNode
 * @sidebarTitle Non-breaking Hyphen
 */
export const NoBreakHyphenNode = Node.create({
  name: 'noBreakHyphen',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,

  // Tell PM the visible text representation of this leaf so flattening APIs —
  // search, get-text, diff, accessibility readers — see U+2011 instead of a
  // placeholder. Read by PM's built-in `Node.textBetween` and by SuperDoc's
  // `textBetweenWithTabs`.
  leafText: () => NON_BREAKING_HYPHEN,

  addOptions() {
    return {
      htmlAttributes: {
        class: 'sd-no-break-hyphen',
        style: 'white-space: nowrap;',
        contentEditable: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'span.sd-no-break-hyphen' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), NON_BREAKING_HYPHEN];
  },
});
