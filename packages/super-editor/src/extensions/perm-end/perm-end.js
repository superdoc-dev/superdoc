import { Node } from '@core/index.js';

/**
 * Configuration options for PermEnd
 * @typedef {Object} PermEndOptions
 * @category Options
 */

/**
 * @module PermEnd
 * @sidebarTitle PermEnd
 * @snippetPath /snippets/extensions/perm-end.mdx
 */
export const PermEnd = Node.create({
  name: 'permEnd',
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
      displacedByCustomXml: {
        default: null,
      },
    };
  },
});

/**
 * Configuration options for PermEndBlock
 * @typedef {Object} PermEndOptions
 * @category Options
 */

/**
 * @module PermEndBlock
 * @sidebarTitle PermEndBlock
 * @snippetPath /snippets/extensions/perm-end-block.mdx
 */
export const PermEndBlock = Node.create({
  name: 'permEndBlock',
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
      displacedByCustomXml: {
        default: null,
      },
    };
  },
});
