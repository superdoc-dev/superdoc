import { Node } from '@core/index.js';

/**
 * Configuration options for PermStart
 * @typedef {Object} PermStartOptions
 * @category Options
 */

/**
 * @module PermStart
 * @sidebarTitle PermStart
 * @snippetPath /snippets/extensions/perm-start.mdx
 */
export const PermStart = Node.create({
  name: 'permStart',
  group: 'inline',
  inline: true,

  renderDOM() {
    return ['span', { style: 'display: none;' }];
  },

  addAttributes() {
    return {
      id: {
        default: null,
      },
      edGrp: {
        default: null,
      },
      ed: {
        default: null,
      },
      colFirst: {
        default: null,
      },
      colLast: {
        default: null,
      },
    };
  },
});
