import { Node, Attribute } from '@core/index.js';

export const IndexEntry = Node.create({
  name: 'indexEntry',

  group: 'inline',

  inline: true,

  atom: true,

  draggable: false,

  selectable: false,

  content: 'inline*',

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
        'data-id': 'document-index-entry',
        'aria-label': 'Index entry',
        style: 'display:none',
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
      marksAsAttrs: {
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'span[data-id="document-index-entry"]' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
