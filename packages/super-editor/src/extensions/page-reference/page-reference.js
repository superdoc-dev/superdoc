import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

export const PageReference = Node.create({
  name: 'pageReference',
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
        'data-id': 'auto-page-reference',
        'aria-label': 'Page reference node',
        class: 'sd-editor-page-reference',
      },
    };
  },

  addAttributes() {
    return {
      marksAsAttrs: {
        default: null,
        rendered: false,
      },
      instruction: {
        default: '',
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'span[data-id="auto-page-reference"]' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
