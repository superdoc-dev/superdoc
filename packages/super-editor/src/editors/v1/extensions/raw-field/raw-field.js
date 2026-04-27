import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

/**
 * Generic carrier for unknown / unsupported Word fields.
 *
 * Holds the canonical FieldInstance payload as an attribute and renders the
 * field's result content as inline children, so formatted result runs (bold,
 * color, font) survive end-to-end without being flattened to plain text.
 *
 * Recognized field families continue to lower to their existing typed nodes
 * (sequenceField, documentStatField, etc.); rawField is reached only via
 * the unknown-instruction fallback in preProcessNodesForFldChar.
 */
export const RawField = Node.create({
  name: 'rawField',

  group: 'inline',

  inline: true,

  content: 'inline*',

  selectable: true,

  draggable: false,

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
        'data-id': 'raw-field',
        'aria-label': 'Field',
      },
    };
  },

  addAttributes() {
    return {
      /**
       * Canonical durable payload describing the field. Set at import time;
       * read by the rawField translator on export to choose between
       * passthrough and rebuild.
       */
      fieldInstance: {
        default: null,
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
    return [{ tag: 'span[data-id="raw-field"]' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
