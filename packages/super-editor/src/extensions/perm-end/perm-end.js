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
const hiddenRender = () => ['span', { style: 'display: none;' }];

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

const createPermEndNode = ({ name, group, inline }) =>
  Node.create({
    name,
    group,
    ...(inline ? { inline: true } : {}),

    renderDOM: hiddenRender,

    addAttributes: sharedAttributes,
  });

export const PermEnd = createPermEndNode({ name: 'permEnd', group: 'inline', inline: true });
export const PermEndBlock = createPermEndNode({ name: 'permEndBlock', group: 'block', inline: false });
