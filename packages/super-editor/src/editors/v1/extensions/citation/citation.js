import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

const CITATION_PLACEHOLDER = '[Citation]';

export const Citation = Node.create({
  name: 'citation',

  group: 'inline',

  inline: true,

  atom: true,

  selectable: false,

  draggable: false,

  leafText: (node) => node.attrs.resolvedText || CITATION_PLACEHOLDER,

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
      fieldResultContent: {
        default: null,
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
    const text = node.attrs.resolvedText || CITATION_PLACEHOLDER;
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), text];
  },
});
