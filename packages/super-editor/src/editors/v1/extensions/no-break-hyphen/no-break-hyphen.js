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
