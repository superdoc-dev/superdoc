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

/**
 * Configuration options for PermStartBlock
 * @typedef {Object} PermStartOptions
 * @category Options
 */

/**
 * @module PermStartBlock
 * @sidebarTitle PermStartBlock
 * @snippetPath /snippets/extensions/perm-start-block.mdx
 */
export const PermStartBlock = Node.create({
  name: 'permStartBlock',
  group: 'block',
  inline: false,

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
