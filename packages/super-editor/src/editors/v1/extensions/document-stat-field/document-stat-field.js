import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

/**
 * Inline atom node representing a Word document-statistic field (NUMWORDS, NUMCHARS).
 *
 * The field type is derived at runtime from the first token of `instruction`.
 * `resolvedText` holds the cached display value — seeded from the imported
 * OOXML cached result and later updated in place by `fields.rebuild`.
 */
export const DocumentStatField = Node.create({
  name: 'documentStatField',

  group: 'inline',

  inline: true,

  atom: true,

  selectable: false,

  draggable: false,

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
        'data-id': 'document-stat-field',
        'aria-label': 'Document statistic field',
      },
    };
  },

  addAttributes() {
    return {
      instruction: {
        default: '',
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
    return [{ tag: 'span[data-id="document-stat-field"]' }];
  },

  renderDOM({ node, htmlAttributes }) {
    const text = node.attrs.resolvedText || '0';
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), text];
  },
});
