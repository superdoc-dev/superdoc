import { Node } from '@core/Node.js';

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  marks: '',
  draggable: false,
  selectable: true,

  parseDOM() {
    return [{ tag: 'sd-math-inline' }];
  },

  renderDOM() {
    return ['sd-math-inline', { style: 'display: inline;' }];
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
    };
  },
});
