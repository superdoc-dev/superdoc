// @ts-nocheck
import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

/**
 * Smart tag (OOXML `<w:smartTag>`): transparent inline wrapper that carries
 * semantic metadata around normal paragraph content (ECMA-376 §17.5.1.9).
 *
 * Renders its children transparently. Per the SD-3298 architectural rule, this
 * is a non-atomic inline container node with `content: 'inline*'`, NOT a mark:
 * OOXML allows smartTags to nest (e.g. `<w:smartTag element="place">` wrapping
 * `<w:smartTag element="country-region">` wrapping a run), and ProseMirror
 * marks of the same type don't stack on a single inline node. A container node
 * natively nests via the schema's content model.
 *
 * @module SmartTag
 * @sidebarTitle Smart Tag
 */
export const SmartTag = Node.create({
  name: 'smartTag',

  group: 'inline',

  content: 'inline*',

  inline: true,

  // Transparent metadata wrapper, never atomic.
  atom: false,

  // Cursor flows through smartTag boundaries freely; metadata only.
  isolating: false,

  draggable: false,

  selectable: false,

  addOptions() {
    return {
      htmlAttributes: {
        'data-sd-smart-tag': '',
        'aria-label': 'Smart tag',
      },
    };
  },

  addAttributes() {
    return {
      element: {
        default: null,
        parseDOM: (elem) => elem.getAttribute('data-element'),
        renderDOM: (attrs) => {
          if (!attrs.element) return {};
          return { 'data-element': attrs.element };
        },
      },

      uri: {
        default: null,
        parseDOM: (elem) => elem.getAttribute('data-uri'),
        renderDOM: (attrs) => {
          if (!attrs.uri) return {};
          return { 'data-uri': attrs.uri };
        },
      },

      // Raw OOXML <w:smartTagPr> stored for round-trip export. Never rendered.
      smartTagPr: {
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'span[data-sd-smart-tag]' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
