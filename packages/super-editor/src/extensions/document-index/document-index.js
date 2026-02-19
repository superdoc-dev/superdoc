import { Node, Attribute } from '@core/index.js';

export const DocumentIndex = Node.create({
  name: 'index',

  group: 'block',

  content: 'paragraph+',

  inline: false,

  addOptions() {
    return {
      htmlAttributes: {
        'data-id': 'document-index',
        'aria-label': 'Index',
      },
    };
  },

  parseDOM() {
    return [
      {
        tag: 'div[data-id="document-index"]',
      },
    ];
  },

  renderDOM({ htmlAttributes }) {
    return ['div', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },

  addAttributes() {
    return {
      instruction: {
        default: null,
        rendered: false,
      },
      instructionTokens: {
        default: null,
        rendered: false,
      },
      /**
       * @private
       * @category Attribute
       * @param {string} [sdBlockId] - Internal block tracking ID (not user-configurable)
       */
      sdBlockId: {
        default: null,
        keepOnSplit: false,
        parseDOM: (elem) => elem.getAttribute('data-sd-block-id'),
        renderDOM: (attrs) => {
          return attrs.sdBlockId ? { 'data-sd-block-id': attrs.sdBlockId } : {};
        },
      },
    };
  },
});
