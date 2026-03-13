import { Node, Attribute } from '@core/index';
import { createChartImmutabilityPlugin } from './chart-immutability-plugin.js';

/**
 * Chart node extension for OOXML chart drawings.
 *
 * Represents an embedded chart (bar, line, pie, etc.) imported from a DOCX file.
 * The node is atomic and inline, matching the pattern used by image and vectorShape nodes.
 *
 * Key attributes:
 * - `chartData`: Normalized ChartModel parsed from chart XML
 * - `chartRelId`: Relationship ID for the chart part
 * - `chartPartPath`: Path to chart XML in the docx package
 * - `width`/`height`: Dimensions from wp:extent
 * - `originalXml`: Raw drawing XML for lossless round-trip export
 */
export const Chart = Node.create({
  name: 'chart',

  group: 'inline',

  inline: true,

  atom: true,

  draggable: false,

  selectable: true,

  addOptions() {
    return {
      htmlAttributes: {},
    };
  },

  addAttributes() {
    return {
      width: {
        default: 400,
        renderDOM: (attrs) => {
          if (attrs.width == null) return {};
          return { 'data-width': attrs.width };
        },
      },

      height: {
        default: 300,
        renderDOM: (attrs) => {
          if (attrs.height == null) return {};
          return { 'data-height': attrs.height };
        },
      },

      chartData: {
        default: null,
        rendered: false,
      },

      chartRelId: {
        default: null,
        rendered: false,
      },

      chartPartPath: {
        default: null,
        rendered: false,
      },

      isAnchor: {
        default: false,
        rendered: false,
      },

      anchorData: {
        default: null,
        rendered: false,
      },

      wrap: {
        default: null,
        rendered: false,
      },

      padding: {
        default: null,
        rendered: false,
      },

      marginOffset: {
        default: null,
        rendered: false,
      },

      originalAttributes: {
        default: null,
        rendered: false,
      },

      originalChildren: {
        default: null,
        rendered: false,
      },

      originalChildOrder: {
        default: null,
        rendered: false,
      },

      originalXml: {
        default: null,
        rendered: false,
      },

      drawingContent: {
        ...Attribute.json,
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'sd-chart' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['sd-chart', { ...htmlAttributes, style: 'display: inline-block;' }];
  },

  addPmPlugins() {
    return [createChartImmutabilityPlugin()];
  },
});
