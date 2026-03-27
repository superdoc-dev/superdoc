import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

export const SequenceField = Node.create({
  name: 'sequenceField',

  group: 'inline',

  inline: true,

  atom: true,

  selectable: false,

  draggable: false,

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
        'data-id': 'sequence-field',
        'aria-label': 'Sequence field',
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
      identifier: {
        default: '',
        rendered: false,
      },
      format: {
        default: 'ARABIC',
        rendered: false,
      },
      restartLevel: {
        default: null,
        rendered: false,
      },
      resolvedNumber: {
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
    return [{ tag: 'span[data-id="sequence-field"]' }];
  },

  renderDOM({ node, htmlAttributes }) {
    const text = node.attrs.resolvedNumber || '0';
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), text];
  },
});
