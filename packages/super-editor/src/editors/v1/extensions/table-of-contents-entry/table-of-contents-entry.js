import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

export const TableOfContentsEntry = Node.create({
  name: 'tableOfContentsEntry',

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
        'data-id': 'document-toc-entry',
        'aria-label': 'Table of contents entry',
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
      marksAsAttrs: {
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'span[data-id="document-toc-entry"]' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },

  addCommands() {
    return {
      insertTableOfContentsEntryAt:
        ({ pos, instruction, instructionTokens = null }) =>
        ({ tr, dispatch }) => {
          const nodeType = this.editor.schema.nodes.tableOfContentsEntry;
          if (!nodeType) return false;

          const node = nodeType.create({
            instruction,
            instructionTokens,
          });

          try {
            if (dispatch) {
              tr.insert(pos, node);
            }
            return true;
          } catch (error) {
            if (error instanceof RangeError) return false;
            throw error;
          }
        },

      updateTableOfContentsEntryAt:
        ({ pos, instruction }) =>
        ({ tr, dispatch, state }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || node.type.name !== 'tableOfContentsEntry') return false;

          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, instruction, instructionTokens: null });
          }
          return true;
        },

      deleteTableOfContentsEntryAt:
        ({ pos }) =>
        ({ tr, dispatch, state }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || node.type.name !== 'tableOfContentsEntry') return false;

          if (dispatch) {
            tr.delete(pos, pos + node.nodeSize);
          }
          return true;
        },
    };
  },
});
