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

      // Host-paragraph properties preserved when an inline drawing is the sole
      // block content of a <w:p> and gets hoisted to the top level. Without this
      // the paragraph's alignment (e.g. centered) is lost and the layout adapter
      // cannot center the drawing. See legacy-handle-paragraph-node.js.
      wrapperParagraph: {
        default: null,
        rendered: false,
      },

      anchorData: {
        rendered: false,
      },

      marginOffset: {
        rendered: false,
      },

      attributes: {
        rendered: false,
      },

      // DrawingML shape geometry
      kind: {
        default: null,
        rendered: false,
      },
      width: {
        default: null,
        renderDOM: (attrs) => {
          if (attrs.width == null) return {};
          return { 'data-width': attrs.width };
        },
      },
      height: {
        default: null,
        renderDOM: (attrs) => {
          if (attrs.height == null) return {};
          return { 'data-height': attrs.height };
        },
      },
      fillColor: {
        default: null,
        rendered: false,
      },
      strokeColor: {
        default: null,
        rendered: false,
      },
      strokeWidth: {
        default: null,
        rendered: false,
      },
      rotation: {
        default: 0,
        rendered: false,
      },
      flipH: {
        default: false,
        rendered: false,
      },
      flipV: {
        default: false,
        rendered: false,
      },
      wrap: {
        default: null,
        rendered: false,
      },
      isAnchor: {
        default: false,
        rendered: false,
      },
      drawingContent: {
        default: null,
        rendered: false,
      },
      originalAttributes: {
        default: null,
        rendered: false,
      },
      effectExtent: {
        default: null,
        rendered: false,
      },
      effects: {
        default: null,
        rendered: false,
      },
      lineEnds: {
        default: null,
        rendered: false,
      },
      hidden: {
        default: false,
        rendered: false,
      },
      isTextBox: {
        default: false,
        rendered: false,
      },
      isWordArt: {
        default: false,
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
