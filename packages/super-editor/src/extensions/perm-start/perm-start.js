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
const hiddenRender = () => ['span', { style: 'display: none;' }];

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

const createPermStartNode = ({ name, group, inline }) =>
  Node.create({
    name,
    group,
    ...(inline ? { inline: true } : {}),

    renderDOM: hiddenRender,

    addAttributes: sharedAttributes,
  });

export const PermStart = createPermStartNode({ name: 'permStart', group: 'inline', inline: true });
export const PermStartBlock = createPermStartNode({ name: 'permStartBlock', group: 'block', inline: false });
