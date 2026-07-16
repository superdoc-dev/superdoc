import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

export const CrossReference = Node.create({
  name: 'crossReference',

  group: 'inline',

  inline: true,

  atom: true,

  selectable: false,

  draggable: false,

  // The visible text representation of this leaf. The resolved field result
  // (e.g. "9.1") lives only in the `resolvedText` attribute — the node has no
  // text children — so without this, flattening APIs (getText via
  // `textBetweenWithTabs`, `node.textContent`, SearchIndex, the rewrite
  // char-diff via `charOffsetToDocPos`) drop the reference entirely while the
  // rendered document shows it. Mirrors `renderDOM` below and the `lineBreak` /
  // `noBreakHyphen` leaves.
  leafText: (node) => node.attrs.resolvedText || node.attrs.target || '',

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
        'data-id': 'cross-reference',
        'aria-label': 'Cross-reference',
      },
    };
  },

  addAttributes() {
    return {
      instruction: {
        default: '',
        rendered: false,
      },
      instructionTokens: {
        default: null,
        rendered: false,
      },
      fieldType: {
        default: 'REF',
        rendered: false,
      },
      target: {
        default: '',
        rendered: false,
      },
      display: {
        default: 'content',
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
    return [{ tag: 'span[data-id="cross-reference"]' }];
  },

  renderDOM({ node, htmlAttributes }) {
    const text = node.attrs.resolvedText || node.attrs.target || '';
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), text];
  },
});
