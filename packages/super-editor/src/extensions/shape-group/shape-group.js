import { Node, Attribute } from '@core/index';
import { ShapeGroupView } from './ShapeGroupView';

export const ShapeGroup = Node.create({
  name: 'shapeGroup',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
      },
    };
  },

  addAttributes() {
    return {
      groupTransform: {
        default: {},
        renderDOM: () => ({}),
      },

      shapes: {
        default: [],
        renderDOM: () => ({}),
      },

      size: {
        default: null,
        renderDOM: (attrs) => {
          if (!attrs.size) return {};
          const sizeData = {};
          if (attrs.size.width) sizeData['data-width'] = attrs.size.width;
          if (attrs.size.height) sizeData['data-height'] = attrs.size.height;
          return sizeData;
        },
      },

      padding: {
        default: null,
        renderDOM: (attrs) => {
          if (!attrs.padding) return {};
          const paddingData = {};
          if (attrs.padding.top != null) paddingData['data-padding-top'] = attrs.padding.top;
          if (attrs.padding.right != null) paddingData['data-padding-right'] = attrs.padding.right;
          if (attrs.padding.bottom != null) paddingData['data-padding-bottom'] = attrs.padding.bottom;
          if (attrs.padding.left != null) paddingData['data-padding-left'] = attrs.padding.left;
          return paddingData;
        },
      },

      marginOffset: {
        default: null,
        renderDOM: (attrs) => {
          if (!attrs.marginOffset) return {};
          const offsetData = {};
          if (attrs.marginOffset.horizontal != null) offsetData['data-offset-x'] = attrs.marginOffset.horizontal;
          if (attrs.marginOffset.top != null) offsetData['data-offset-y'] = attrs.marginOffset.top;
          return offsetData;
        },
      },

      hidden: {
        default: false,
        rendered: false,
      },

      drawingContent: {
        rendered: false,
      },

      wrap: {
        default: { type: 'Inline' },
        rendered: false,
      },

      anchorData: {
        default: null,
        rendered: false,
      },

      originalAttributes: {
        rendered: false,
      },
    };
  },

  parseDOM() {
    return false;
  },

  renderDOM({ htmlAttributes }) {
    return ['div', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes, { 'data-shape-group': '' })];
  },

  addNodeView() {
    return (props) => {
      return new ShapeGroupView({ ...props });
    };
  },
});
