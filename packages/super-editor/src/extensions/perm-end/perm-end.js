import { Node } from '@core/index.js';
import { createPermissionBlockMarkerNode } from '../shared/permission-block-marker-factory.js';

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
  atom: true,

  renderDOM() {
    return ['span', { style: 'display: none;' }];
  },

  addAttributes() {
    return sharedAttributes();
  },
});

export const PermEndBlock = createPermissionBlockMarkerNode({
  name: 'permEndBlock',
  attributes: sharedAttributes,
});
