// @ts-nocheck
import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

export const DocumentPartObject = Node.create({
  name: 'documentPartObject',
  group: 'block',
  content: 'block*',
  isolating: true,
  excludeFromSummaryJSON: true,

  addOptions() {
    return {
      htmlAttributes: {
        class: 'sd-document-part-object-block',
        'aria-label': 'Structured document part block',
      },
    };
  },

  parseDOM() {
    return [
      {
        tag: 'div.sd-document-part-object-block',
        priority: 60,
      },
    ];
  },

  renderDOM({ htmlAttributes }) {
    return ['div', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },

  addAttributes() {
    return {
      sdBlockId: {
        default: null,
        keepOnSplit: false,
        parseDOM: (elem) => elem.getAttribute('data-sd-block-id'),
        renderDOM: (attrs) => {
          return attrs.sdBlockId ? { 'data-sd-block-id': attrs.sdBlockId } : {};
        },
      },
      id: {},
      docPartGallery: {},
      docPartUnique: {
        default: true,
      },
    };
  },
});
