import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

export const Bibliography = Node.create({
  name: 'bibliography',

  group: 'block',

  content: 'paragraph+',

  addOptions() {
    return {
      htmlAttributes: {
        'data-id': 'bibliography',
      },
    };
  },

  addAttributes() {
    return {
      instruction: {
        default: '',
        rendered: false,
      },
      sdBlockId: {
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'div[data-id="bibliography"]' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['div', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
