import { Node, Attribute } from '@core/index.js';

export const TableOfAuthorities = Node.create({
  name: 'tableOfAuthorities',

  group: 'block',

  content: 'paragraph+',

  addOptions() {
    return {
      htmlAttributes: {
        'data-id': 'table-of-authorities',
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
      sdBlockId: {
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'div[data-id="table-of-authorities"]' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['div', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
