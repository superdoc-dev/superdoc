import { Node } from '@core/Node.js';

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  draggable: false,
  selectable: true,
  defining: true,

  parseDOM() {
    return [{ tag: 'sd-math-block' }];
  },

  renderDOM() {
    return ['sd-math-block', { style: 'display: block; text-align: center;' }];
  },

  addAttributes() {
    return {
      originalXml: {
        default: null,
        rendered: false,
      },
      textContent: {
        default: '',
        rendered: false,
      },
      justification: {
        default: 'centerGroup',
        rendered: false,
      },
      paragraphProperties: {
        default: null,
        rendered: false,
      },
    };
  },
});
