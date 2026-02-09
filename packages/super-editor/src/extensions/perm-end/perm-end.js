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
const sharedAttributes = () => ({
  id: {
    default: null,
  },
  edGrp: {
    default: null,
  },
  displacedByCustomXml: {
    default: null,
  },
});

export const PermEnd = Node.create({
  name: 'permEnd',
  group: 'inline',
  inline: true,

  renderDOM() {
    return ['span', { style: 'display: none;' }];
  },

  addAttributes() {
    return sharedAttributes();
  },
});

export const PermEndBlock = Node.create({
  name: 'permEndBlock',
  group: 'block',
  inline: false,
  atom: true,
  draggable: false,
  selectable: false,
  defining: true,

  renderDOM() {
    return ['div', { style: 'display: none;' }];
  },

  addAttributes() {
    return sharedAttributes();
  },
});
