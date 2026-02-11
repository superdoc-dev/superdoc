import { Node } from '@core/index.js';
import { createPermissionBlockMarkerNode } from '../shared/permission-block-marker-factory.js';

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
  atom: true,

  renderDOM() {
    return ['span', { style: 'display: none;' }];
  },

  addAttributes() {
    return sharedAttributes();
  },
});

export const PermStartBlock = createPermissionBlockMarkerNode({
  name: 'permStartBlock',
  attributes: sharedAttributes,
});
