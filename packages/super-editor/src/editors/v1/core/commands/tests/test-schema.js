import { Schema } from 'prosemirror-model';

const nodes = {
  doc: { content: 'block+' },
  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM() {
      return ['p', 0];
    },
  },
  text: { group: 'inline' },
  tab: {
    inline: true,
    group: 'inline',
    selectable: false,
    atom: true,
    parseDOM: [{ tag: 'span[data-tab]' }],
    toDOM() {
      return ['span', { 'data-tab': 'true' }, '\t'];
    },
  },
  orderedList: {
    group: 'block',
    content: 'listItem+',
    parseDOM: [{ tag: 'ol' }],
    toDOM() {
      return ['ol', 0];
    },
  },
  bulletList: {
    group: 'block',
    content: 'listItem+',
    parseDOM: [{ tag: 'ul' }],
    toDOM() {
      return ['ul', 0];
    },
  },
  listItem: {
    group: 'block',
    content: 'paragraph+',
    parseDOM: [{ tag: 'li' }],
    toDOM() {
      return ['li', 0];
    },
  },
};

const marks = {};

export const testSchema = new Schema({ nodes, marks });
