import { Node, Attribute } from '@core/index.js';
import { isHeadless } from '@utils/headless-helpers.js';
/**
 * Configuration options for PageNumber
 * @typedef {Object} PageNumberOptions
 * @category Options
 * @property {Object} [htmlAttributes] - HTML attributes for page number elements
 */

/**
 * Attributes for page number nodes
 * @typedef {Object} PageNumberAttributes
 * @category Attributes
 * @property {Array} [marksAsAttrs=null] @internal - Internal marks storage
 */

/**
 * @module PageNumber
 * @sidebarTitle Page Number
 * @snippetPath /snippets/extensions/page-number.mdx
 * @shortcut Mod-Shift-alt-p | addAutoPageNumber | Insert page number
 */
export const PageNumber = Node.create({
  name: 'page-number',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: false,
  selectable: false,
  defining: true,

  content: '',

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
        'data-id': 'auto-page-number',
        'aria-label': 'Page number node',
      },
    };
  },

  addAttributes() {
    return {
      marksAsAttrs: {
        default: null,
        rendered: false,
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos, decorations }) => {
      const htmlAttributes = this.options.htmlAttributes;
      return new AutoPageNumberNodeView(node, getPos, decorations, editor, htmlAttributes);
    };
  },

  parseDOM() {
    return [{ tag: 'span[data-id="auto-page-number"' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes)];
  },

  addCommands() {
    return {
      /**
       * Insert an automatic page number
       * @category Command
       * @returns {Function} Command function
       * @example
       * editor.commands.addAutoPageNumber()
       * @note Only works in header/footer contexts
       */
      addAutoPageNumber:
        () =>
        ({ tr, dispatch, state, editor }) => {
          const { options } = editor;
          if (!options.isHeaderOrFooter) return false;

          const { schema } = state;
          const pageNumberType = schema?.nodes?.['page-number'];
          if (!pageNumberType) return false;

          const pageNumberNodeJSON = { type: 'page-number' };
          const pageNumberNode = schema.nodeFromJSON(pageNumberNodeJSON);

          if (dispatch) {
            tr.replaceSelectionWith(pageNumberNode, false);
            // Only trigger pagination update if not in headless mode
            if (!isHeadless(editor)) {
              tr.setMeta('forceUpdatePagination', true);
            }
          }
          return true;
        },
    };
  },

  addShortcuts() {
    return {
      'Mod-Shift-alt-p': () => this.editor.commands.addAutoPageNumber(),
    };
  },
});

/**
 * Configuration options for TotalPageCount
 * @typedef {Object} TotalPageCountOptions
 * @category Options
 * @property {Object} [htmlAttributes] - HTML attributes for total page count elements
 */

/**
 * Attributes for total page count nodes
 * @typedef {Object} TotalPageCountAttributes
 * @category Attributes
 * @property {Array} [marksAsAttrs=null] @internal - Internal marks storage
 */

/**
 * @module TotalPageCount
 * @sidebarTitle Total Page Count
 * @snippetPath /snippets/extensions/total-page-count.mdx
 * @shortcut Mod-Shift-alt-c | addTotalPageCount | Insert total page count
 */
export const TotalPageCount = Node.create({
  name: 'total-page-number',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: false,
  selectable: false,

  content: 'text*',

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
        'data-id': 'auto-total-pages',
        'aria-label': 'Total page count node',
        class: 'sd-editor-auto-total-pages',
      },
    };
  },

  addAttributes() {
    return {
      marksAsAttrs: {
        default: null,
        rendered: false,
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos, decorations }) => {
      const htmlAttributes = this.options.htmlAttributes;
      return new AutoPageNumberNodeView(node, getPos, decorations, editor, htmlAttributes);
    };
  },

  parseDOM() {
    return [{ tag: 'span[data-id="auto-total-pages"' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },

  addCommands() {
    return {
      /**
       * Insert total page count
       * @category Command
       * @returns {Function} Command function
       * @example
       * editor.commands.addTotalPageCount()
       * @note Only works in header/footer contexts
       */
      addTotalPageCount:
        () =>
        ({ tr, dispatch, state, editor }) => {
          const { options } = editor;
          if (!options.isHeaderOrFooter) return false;

          const { schema } = state;
          const pageNumberType = schema.nodes?.['total-page-number'];
          if (!pageNumberType) return false;

          const currentPages = editor?.options?.parentEditor?.currentTotalPages || 1;
          const pageNumberNode = {
            type: 'total-page-number',
            content: [{ type: 'text', text: String(currentPages) }],
          };
          const pageNode = schema.nodeFromJSON(pageNumberNode);
          if (dispatch) {
            tr.replaceSelectionWith(pageNode, false);
          }
          return true;
        },
    };
  },

  addShortcuts() {
    return {
      'Mod-Shift-alt-c': () => this.editor.commands.addTotalPageCount(),
    };
  },
});

const getNodeAttributes = (nodeName, editor) => {
  switch (nodeName) {
    case 'page-number':
      return {
        text: editor.options.currentPageNumber || '1',
        className: 'sd-editor-auto-page-number',
        dataId: 'auto-page-number',
        ariaLabel: 'Page number node',
      };
    case 'total-page-number':
      return {
        text: editor.options.parentEditor?.currentTotalPages || '1',
        className: 'sd-editor-auto-total-pages',
        dataId: 'auto-total-pages',
        ariaLabel: 'Total page count node',
      };
    default:
      return {};
  }
};

export class AutoPageNumberNodeView {
  constructor(node, getPos, decorations, editor, htmlAttributes = {}) {
    this.node = node;
    this.editor = editor;
    this.view = editor.view;
    this.getPos = getPos;
    this.editor = editor;

    this.dom = this.#renderDom(node, htmlAttributes);
  }

  #renderDom(node, htmlAttributes) {
    const attrs = getNodeAttributes(this.node.type.name, this.editor);
    const content = document.createTextNode(String(attrs.text));

    const nodeContent = document.createElement('span');
    nodeContent.className = attrs.className;
    nodeContent.setAttribute('data-id', attrs.dataId);
    nodeContent.setAttribute('aria-label', attrs.ariaLabel);

    const currentPos = this.getPos();
    const { styles, marks } = getMarksFromNeighbors(currentPos, this.view);
    this.#scheduleUpdateNodeStyle(currentPos, marks);
    Object.assign(nodeContent.style, styles);

    nodeContent.appendChild(content);

    Object.entries(htmlAttributes).forEach(([key, value]) => {
      if (value) nodeContent.setAttribute(key, value);
    });

    return nodeContent;
  }

  #scheduleUpdateNodeStyle(pos, marks) {
    setTimeout(() => {
      const { state } = this.editor;
      const { dispatch } = this.view;

      const node = state.doc.nodeAt(pos);
      if (!node || node.isText) return;

      const currentMarks = node.attrs.marksAsAttrs || [];
      const newMarks = marks.map((m) => ({ type: m.type.name, attrs: m.attrs }));

      // Avoid infinite loop: only update if marks actually changed
      const isEqual = JSON.stringify(currentMarks) === JSON.stringify(newMarks);
      if (isEqual) return;

      const newAttrs = {
        ...node.attrs,
        marksAsAttrs: newMarks,
      };

      const tr = state.tr.setNodeMarkup(pos, undefined, newAttrs);
      dispatch(tr);
    }, 0);
  }

  update(node) {
    const incomingType = node?.type?.name;
    const currentType = this.node?.type?.name;
    if (!incomingType || incomingType !== currentType) return false;
    this.node = node;
    return true;
  }
}

/**
 * Get styles from the marks of the node before and after the current position.
 * @param {Number} currentPos The current position in the document.
 * @param {Object} view The ProseMirror view instance.
 * @returns {Object} An object containing CSS styles derived from the marks of the neighboring nodes.
 */
const getMarksFromNeighbors = (currentPos, view) => {
  const $pos = view.state.doc.resolve(currentPos);
  const styles = {};
  const marks = [];

  const before = $pos.nodeBefore;
  if (before) {
    Object.assign(styles, processMarks(before.marks));
    marks.push(...before.marks);
  }

  const after = $pos.nodeAfter;
  if (after) {
    Object.assign(styles, { ...styles, ...processMarks(after.marks) });
    marks.push(...after.marks);
  }

  return {
    styles,
    marks,
  };
};

/**
 * Process marks to extract styles.
 * @param {Object[]} marks The marks to process.
 * @returns {Object} An object containing CSS styles derived from the marks.
 */
const processMarks = (marks) => {
  const styles = {};

  marks.forEach((mark) => {
    const { type, attrs } = mark;

    switch (type.name) {
      case 'textStyle':
        if (attrs.fontFamily) styles['font-family'] = attrs.fontFamily;
        if (attrs.fontSize) styles['font-size'] = attrs.fontSize;
        if (attrs.color) styles['color'] = attrs.color;
        if (attrs.backgroundColor) styles['background-color'] = attrs.backgroundColor;
        break;

      case 'bold':
        styles['font-weight'] = 'bold';
        break;

      case 'italic':
        styles['font-style'] = 'italic';
        break;

      case 'underline':
        styles['text-decoration'] = (styles['text-decoration'] || '') + ' underline';
        break;

      case 'strike':
        styles['text-decoration'] = (styles['text-decoration'] || '') + ' line-through';
        break;

      default:
        // Handle unknown/custom marks gracefully
        if (attrs?.style) {
          Object.entries(attrs.style).forEach(([key, value]) => {
            styles[key] = value;
          });
        }
        break;
    }
  });

  return styles;
};
