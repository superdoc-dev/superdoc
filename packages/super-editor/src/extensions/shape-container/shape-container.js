import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

/**
 * Configuration options for ShapeContainer
 * @typedef {Object} ShapeContainerOptions
 * @category Options
 * @property {Object} [htmlAttributes] - HTML attributes for shape container elements
 */

/**
 * Attributes for shape container nodes
 * @typedef {Object} ShapeContainerAttributes
 * @category Attributes
 * @property {string} [fillcolor] - Background color for the shape
 * @property {string} [style] - CSS style string
 * @property {string} [sdBlockId] @internal - Internal block tracking ID
 * @property {Object} [wrapAttributes] @internal - Internal wrapper attributes
 * @property {Object} [attributes] @internal - Internal attributes storage
 */

/**
 * @module ShapeContainer
 * @sidebarTitle Shape Container
 * @snippetPath /snippets/extensions/shape-container.mdx
 */
export const ShapeContainer = Node.create({
  name: 'shapeContainer',

  group: 'block',

  content: 'block+',

  isolating: true,

  addOptions() {
    return {
      htmlAttributes: {
        class: 'sd-editor-shape-container',
        'aria-label': 'Shape container node',
      },
    };
  },

  addAttributes() {
    return {
      fillcolor: {
        renderDOM: (attrs) => {
          if (!attrs.fillcolor) return {};
          return {
            style: `background-color: ${attrs.fillcolor}`,
          };
        },
      },
      sdBlockId: {
        default: null,
        keepOnSplit: false,
        parseDOM: (elem) => elem.getAttribute('data-sd-block-id'),
        renderDOM: (attrs) => {
          return attrs.sdBlockId ? { 'data-sd-block-id': attrs.sdBlockId } : {};
        },
      },
      style: {
        renderDOM: (attrs) => {
          if (!attrs.style) return {};
          return {
            style: attrs.style,
          };
        },
      },

      wrapAttributes: {
        rendered: false,
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
