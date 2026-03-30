import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

/**
 * Configuration options for ShapeTextbox
 * @typedef {Object} ShapeTextboxOptions
 * @category Options
 * @property {Object} [htmlAttributes] - HTML attributes for shape textbox elements
 */

/**
 * Attributes for shape textbox nodes
 * @typedef {Object} ShapeTextboxAttributes
 * @category Attributes
 * @property {string} [sdBlockId] @internal - Internal block tracking ID
 * @property {Object} [attributes] @internal - Internal attributes storage
 */

/**
 * @module ShapeTextbox
 * @sidebarTitle Shape Textbox
 * @snippetPath /snippets/extensions/shape-textbox.mdx
 */
export const ShapeTextbox = Node.create({
  name: 'shapeTextbox',

  group: 'block',

  content: 'paragraph* block*',

  isolating: true,

  addOptions() {
    return {
      htmlAttributes: {
        class: 'sd-editor-shape-textbox',
        'aria-label': 'Shape textbox node',
      },
    };
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
      attributes: {
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [
      {
        tag: `div[data-type="${this.name}"]`,
      },
    ];
  },

  renderDOM({ htmlAttributes }) {
    return [
      'div',
      Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes, { 'data-type': this.name }),
      0,
    ];
  },
});
