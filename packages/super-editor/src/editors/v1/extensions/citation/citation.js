import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

export const Citation = Node.create({
  name: 'citation',

  group: 'inline',

  inline: true,

  atom: true,

  selectable: false,

  draggable: false,

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
        'data-id': 'citation',
        'aria-label': 'Citation',
      },
    };
  },

  addAttributes() {
    return {
      instruction: {
        default: '',
        rendered: false,
      },
      instructionTokens: {
        default: null,
        rendered: false,
      },
      sourceIds: {
        default: [],
        rendered: false,
      },
      resolvedText: {
        default: '',
        rendered: false,
      },
      sdBlockId: {
        default: null,
        rendered: false,
      },
      marksAsAttrs: {
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'span[data-id="citation"]' }];
  },

  renderDOM({ node, htmlAttributes }) {
    const text = node.attrs.resolvedText || '[Citation]';
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), text];
  },
});
