import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

export const CrossReference = Node.create({
  name: 'crossReference',

  group: 'inline',

  inline: true,

  atom: true,

  selectable: false,

  draggable: false,

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
        'data-id': 'cross-reference',
        'aria-label': 'Cross-reference',
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
      fieldType: {
        default: 'REF',
        rendered: false,
      },
      target: {
        default: '',
        rendered: false,
      },
      display: {
        default: 'content',
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
    return [{ tag: 'span[data-id="cross-reference"]' }];
  },

  renderDOM({ node, htmlAttributes }) {
    const text = node.attrs.resolvedText || node.attrs.target || '';
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), text];
  },
});
