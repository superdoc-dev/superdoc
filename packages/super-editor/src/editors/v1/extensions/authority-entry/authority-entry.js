import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

export const AuthorityEntry = Node.create({
  name: 'authorityEntry',

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
        'data-id': 'authority-entry',
        'aria-label': 'Authority entry',
        style: 'display:none',
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
      longCitation: {
        default: '',
        rendered: false,
      },
      shortCitation: {
        default: '',
        rendered: false,
      },
      category: {
        default: 0,
        rendered: false,
      },
      bold: {
        default: false,
        rendered: false,
      },
      italic: {
        default: false,
        rendered: false,
      },
      marksAsAttrs: {
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'span[data-id="authority-entry"]' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
