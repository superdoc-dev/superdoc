import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

export const PageReference = Node.create({
  name: 'pageReference',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: false,
  selectable: false,

  content: 'inline*',

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
        'data-id': 'auto-page-reference',
        'aria-label': 'Page reference node',
        class: 'sd-editor-page-reference',
      },
    };
  },

  addAttributes() {
    return {
      marksAsAttrs: {
        default: null,
        rendered: false,
      },
      instruction: {
        default: '',
        rendered: false,
      },
      instructionTokens: {
        default: null,
        rendered: false,
      },
      bookmarkId: {
        default: '',
        rendered: false,
      },
      hasHyperlinkSwitch: {
        default: false,
        rendered: false,
      },
      hasRelativePositionSwitch: {
        default: false,
        rendered: false,
      },
      pageNumberFieldFormat: {
        default: null,
        rendered: false,
      },
      numericPictureFormat: {
        default: null,
        rendered: false,
      },
      fieldResultFormat: {
        default: null,
        rendered: false,
      },
      fieldRunProperties: {
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'span[data-id="auto-page-reference"]' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
