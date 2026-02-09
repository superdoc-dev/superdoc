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
const sharedAttributes = () => ({
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
});

export const PermStart = Node.create({
  name: 'permStart',
  group: 'inline',
  inline: true,

  renderDOM() {
    return ['span', { style: 'display: none;' }];
  },

  addAttributes() {
    return sharedAttributes();
  },
});

export const PermStartBlock = Node.create({
  name: 'permStartBlock',
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
