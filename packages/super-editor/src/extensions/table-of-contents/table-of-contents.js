import { Node, Attribute } from '@core/index.js';

export const TableOfContents = Node.create({
  name: 'tableOfContents',

  group: 'block',

  content: 'paragraph*',

  inline: false,

  addStorage() {
    return {
      /**
       * Maps sdBlockId → page number. Set by PresentationEditor after each
       * layout cycle. Read by toc.update({ mode: 'pageNumbers' }) wrapper.
       * @type {Map<string, number> | null}
       */
      pageMap: null,
    };
  },

  addOptions() {
    return {
      htmlAttributes: {
        'data-id': 'table-of-contents',
        'aria-label': 'Table of Contents',
      },
    };
  },

  parseDOM() {
    return [
      {
        tag: 'div[data-id="table-of-contents"]',
      },
    ];
  },

  renderDOM({ htmlAttributes }) {
    return ['div', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },

  addCommands() {
    const normalizeTocContent = (content, schema) => {
      if (!Array.isArray(content)) return null;
      return content.map((entry) =>
        entry && typeof entry === 'object' && typeof entry.type === 'string' ? schema.nodeFromJSON(entry) : entry,
      );
    };

    return {
      /**
       * Insert a tableOfContents node at the given document position.
       * @param {{ pos: number, instruction?: string, sdBlockId?: string, content?: object[], rightAlignPageNumbers?: boolean }} options
       */
      insertTableOfContentsAt:
        (options) =>
        ({ tr, dispatch, state }) => {
          const { pos, instruction = '', sdBlockId = null, content, rightAlignPageNumbers } = options;
          const tocType = this.editor.schema.nodes.tableOfContents;
          if (!tocType) return false;

          const paragraphType = this.editor.schema.nodes.paragraph;
          const defaultContent = [
            paragraphType.create({}, this.editor.schema.text('Update table of contents to populate entries.')),
          ];
          const materializedContent = normalizeTocContent(content, state.schema) ?? defaultContent;
          const attrs = { instruction, sdBlockId };
          if (rightAlignPageNumbers !== undefined) attrs.rightAlignPageNumbers = rightAlignPageNumbers;
          const tocNode = tocType.create(attrs, materializedContent);

          try {
            if (dispatch) {
              tr.insert(pos, tocNode);
            }
            return true;
          } catch (error) {
            if (error instanceof RangeError) return false;
            throw error;
          }
        },

      /**
       * Update the instruction attribute of a tableOfContents node by sdBlockId.
       * Optionally replaces the materialized TOC content in the same transaction.
       * @param {{ sdBlockId: string, instruction: string, content?: object[], rightAlignPageNumbers?: boolean }} options
       */
      setTableOfContentsInstructionById:
        (options) =>
        ({ tr, dispatch, state }) => {
          const { sdBlockId, instruction, content, rightAlignPageNumbers } = options;
          let found = false;
          state.doc.descendants((node, pos) => {
            if (found) return false;
            if (node.type.name === 'tableOfContents' && node.attrs.sdBlockId === sdBlockId) {
              if (dispatch) {
                const nextAttrs = { ...node.attrs, instruction };
                if (rightAlignPageNumbers !== undefined) nextAttrs.rightAlignPageNumbers = rightAlignPageNumbers;
                tr.setNodeMarkup(pos, undefined, nextAttrs);
                const fragment = normalizeTocContent(content, state.schema);
                if (fragment) {
                  const from = pos + 1;
                  const to = pos + node.nodeSize - 1;
                  tr.replaceWith(from, to, fragment);
                }
              }
              found = true;
              return false;
            }
            return true;
          });
          return found;
        },

      /**
       * Replace the content of a tableOfContents node by sdBlockId.
       * @param {{ sdBlockId: string, content: object[] }} options
       */
      replaceTableOfContentsContentById:
        (options) =>
        ({ tr, dispatch, state }) => {
          const { sdBlockId, content } = options;
          let found = false;
          state.doc.descendants((node, pos) => {
            if (found) return false;
            if (node.type.name === 'tableOfContents' && node.attrs.sdBlockId === sdBlockId) {
              if (dispatch) {
                const from = pos + 1;
                const to = pos + node.nodeSize - 1;
                const fragment = normalizeTocContent(content, state.schema) ?? [];
                tr.replaceWith(from, to, fragment);
              }
              found = true;
              return false;
            }
            return true;
          });
          return found;
        },

      /**
       * Delete a tableOfContents node by sdBlockId.
       * @param {{ sdBlockId: string }} options
       */
      deleteTableOfContentsById:
        (options) =>
        ({ tr, dispatch, state }) => {
          const { sdBlockId } = options;
          let found = false;
          state.doc.descendants((node, pos) => {
            if (found) return false;
            if (node.type.name === 'tableOfContents' && node.attrs.sdBlockId === sdBlockId) {
              if (dispatch) {
                tr.delete(pos, pos + node.nodeSize);
              }
              found = true;
              return false;
            }
            return true;
          });
          return found;
        },
    };
  },

  addAttributes() {
    return {
      instruction: {
        default: null,
        rendered: false,
      },
      /**
       * @private
       * @category Attribute
       * @param {string} [sdBlockId] - Internal block tracking ID (not user-configurable)
       */
      sdBlockId: {
        default: null,
        keepOnSplit: false,
        parseDOM: (elem) => elem.getAttribute('data-sd-block-id'),
        renderDOM: (attrs) => {
          return attrs.sdBlockId ? { 'data-sd-block-id': attrs.sdBlockId } : {};
        },
      },
      /**
       * Whether TOC entry page numbers use right-aligned tab stops.
       * Persisted as a PM node attribute (no OOXML switch equivalent).
       * Derived on DOCX import from the first entry paragraph's tab stop properties.
       */
      rightAlignPageNumbers: {
        default: true,
        rendered: false,
      },
    };
  },
});
