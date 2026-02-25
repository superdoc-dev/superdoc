import { Node } from '@core/index.js';

export const createPermissionBlockMarkerNode = ({ name, attributes }) =>
  Node.create({
    name,
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
      return attributes();
    },
  });
