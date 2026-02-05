import { Node, Attribute } from '@core/index';
import { VectorShapeView } from './VectorShapeView';
import { OOXML_Z_INDEX_BASE } from '@extensions/shared/constants.js';

export const VectorShape = Node.create({
  name: 'vectorShape',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      htmlAttributes: {},
    };
  },

  addAttributes() {
    return {
      kind: {
        default: 'rect',
        renderDOM: (attrs) => {
          if (!attrs.kind) return {};
          return { 'data-kind': attrs.kind };
        },
      },

      width: {
        default: 100,
        renderDOM: (attrs) => {
          if (attrs.width == null) return {};
          return { 'data-width': attrs.width };
        },
      },

      height: {
        default: 100,
        renderDOM: (attrs) => {
          if (attrs.height == null) return {};
          return { 'data-height': attrs.height };
        },
      },

      fillColor: {
        default: null,
        renderDOM: (attrs) => {
          if (!attrs.fillColor) return {};
          return { 'data-fill-color': attrs.fillColor };
        },
      },

      strokeColor: {
        default: null,
        renderDOM: (attrs) => {
          if (!attrs.strokeColor) return {};
          return { 'data-stroke-color': attrs.strokeColor };
        },
      },

      strokeWidth: {
        default: 1,
        renderDOM: (attrs) => {
          if (attrs.strokeWidth == null) return {};
          return { 'data-stroke-width': attrs.strokeWidth };
        },
      },

      lineEnds: {
        default: null,
        rendered: false,
      },

      hidden: {
        default: false,
        rendered: false,
      },

      effectExtent: {
        default: null,
        rendered: false,
      },

      rotation: {
        default: 0,
        renderDOM: (attrs) => {
          if (attrs.rotation == null) return {};
          return { 'data-rotation': attrs.rotation };
        },
      },

      flipH: {
        default: false,
        renderDOM: (attrs) => {
          if (!attrs.flipH) return {};
          return { 'data-flip-h': attrs.flipH };
        },
      },

      flipV: {
        default: false,
        renderDOM: (attrs) => {
          if (!attrs.flipV) return {};
          return { 'data-flip-v': attrs.flipV };
        },
      },

      wrap: {
        default: { type: 'Inline' },
        rendered: false,
      },

      anchorData: {
        default: null,
        renderDOM: ({ anchorData, originalAttributes }) => {
          const relativeHeight = originalAttributes?.relativeHeight;
          if (anchorData && relativeHeight) {
            const zIndex = Math.max(0, relativeHeight - OOXML_Z_INDEX_BASE);
            return { style: `z-index: ${zIndex}` };
          }
        },
      },

      isAnchor: {
        rendered: false,
      },

      marginOffset: {
        default: {},
        rendered: false,
      },

      drawingContent: {
        rendered: false,
      },

      originalAttributes: {
        rendered: false,
      },

      textContent: {
        default: null,
        rendered: false,
      },

      textAlign: {
        default: 'center',
        rendered: false,
      },

      textVerticalAlign: {
        default: 'top', // Per OOXML spec, text box defaults to top alignment
        rendered: false,
      },

      textInsets: {
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return false;
  },

  renderDOM({ htmlAttributes }) {
    return [
      'span',
      Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes, { 'data-vector-shape': '' }),
    ];
  },

  addNodeView() {
    return (props) => {
      return new VectorShapeView({ ...props });
    };
  },
});
