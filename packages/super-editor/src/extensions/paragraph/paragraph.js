import { OxmlNode, Attribute } from '@core/index.js';
import { Plugin, TextSelection } from 'prosemirror-state';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { splitBlock } from '@core/commands/splitBlock.js';
import { removeNumberingProperties, isVisuallyEmptyParagraph } from '@core/commands/removeNumberingProperties.js';
import { isList } from '@core/commands/list-helpers';
import { findParentNode } from '@helpers/index.js';
import { InputRule } from '@core/InputRule.js';
import { toggleList } from '@core/commands/index.js';
import { restartNumbering } from '@core/commands/restartNumbering.js';
import { ParagraphNodeView } from './ParagraphNodeView.js';
import { createNumberingPlugin } from './numberingPlugin.js';
import { createLeadingCaretPlugin } from './leadingCaretPlugin.js';
import { createDropcapPlugin } from './dropcapPlugin.js';
import { shouldSkipNodeView } from '../../utils/headless-helpers.js';
import { parseAttrs } from './helpers/parseAttrs.js';

/**
 * Whether a paragraph's only inline leaf content is break placeholders
 * (lineBreak / hardBreak), with no visible text or other embedded objects.
 *
 * Distinct from `isVisuallyEmptyParagraph`, which returns false when any
 * break node is present. This predicate catches the complementary case:
 * paragraphs that *look* empty to the user but technically contain a break.
 *
 * Context: after splitting a list item that ends with a trailing `w:br`,
 * the new paragraph inherits that break. In WebKit the resulting DOM shape
 * causes native text insertion to land in the list-marker element
 * (`contenteditable="false"`) instead of the content area — and
 * `ParagraphNodeView.ignoreMutation` silently drops it. Detecting
 * this shape lets the `beforeinput` handler insert via ProseMirror
 * transaction instead of relying on native DOM insertion.
 *
 * @param {import('prosemirror-model').Node} node
 * @returns {boolean}
 */
export function hasOnlyBreakContent(node) {
  if (!node || node.type.name !== 'paragraph') return false;

  const text = (node.textContent || '').replace(/\u200b/g, '').trim();
  if (text.length > 0) return false;

  let hasBreak = false;
  let hasOtherContent = false;

  node.descendants((child) => {
    if (!child.isInline || !child.isLeaf) return true;

    if (child.type.name === 'lineBreak' || child.type.name === 'hardBreak') {
      hasBreak = true;
    } else {
      hasOtherContent = true;
    }
    return !hasOtherContent;
  });

  return hasBreak && !hasOtherContent;
}

/**
 * Input rule regex that matches a bullet list marker (-, +, or *)
 * @private
 */
const bulletInputRegex = /^\s*([-+*])\s$/;

/**
 * Input rule regex that matches an ordered list marker (e.g., "1. ")
 * @private
 */
const orderedInputRegex = /^(\d+)\.\s$/;

/**
 * Configuration options for Paragraph
 * @typedef {Object} ParagraphOptions
 * @category Options
 * @property {number[]} [headingLevels=[1,2,3,4,5,6]] - Supported heading levels
 * @property {Object} [htmlAttributes={}] - HTML attributes for paragraph elements
 */

/**
 * Attributes for paragraph nodes
 * @typedef {Object} ParagraphAttributes
 * @category Attributes
 * @property {Object} [extraAttrs={}] - Additional HTML attributes
 * @property {string} [class] - CSS class name
 * @property {string} [sdBlockId] @internal - Internal block tracking ID
 * @property {string} [paraId] @internal - Paragraph identifier
 * @property {string} [textId] @internal - Text identifier
 * @property {string} [rsidR] @internal - Revision save ID
 * @property {string} [rsidRDefault] @internal - Default revision save ID
 * @property {string} [rsidP] @internal - Paragraph revision save ID
 * @property {string} [rsidRPr] @internal - Run properties revision save ID
 * @property {string} [rsidDel] @internal - Deletion revision save ID
 * @property {Object} [attributes] @internal - Internal attributes storage
 * @property {string} [filename] @internal - Associated filename
 * @property {Object} [paragraphProperties] @internal - Internal paragraph properties
 * @property {Object} [dropcap] @internal - Drop cap configuration
 * @property {string} [pageBreakSource] @internal - Page break source
 * @property {Object} [sectionMargins] @internal - Section-specific header/footer margins in inches
 */

/**
 * @module Paragraph
 * @sidebarTitle Paragraph
 * @snippetPath /snippets/extensions/paragraph.mdx
 */
export const Paragraph = OxmlNode.create({
  name: 'paragraph',

  oXmlName: 'w:p',

  priority: 1000,

  group: 'block',

  content: 'inline*',

  inline: false,

  summary: 'The paragraph node mirrors MS Word w:p paragraphs, and also represents lists in the schema.',

  addOptions() {
    return {
      headingLevels: [1, 2, 3, 4, 5, 6],
      htmlAttributes: {},
    };
  },

  addAttributes() {
    return {
      paraId: { rendered: false },
      textId: { rendered: false },
      rsidR: { rendered: false },
      rsidRDefault: { rendered: false },
      rsidP: { rendered: false },
      rsidRPr: { rendered: false },
      rsidDel: { rendered: false },
      extraAttrs: {
        default: {},
        parseDOM: (element) => {
          const extra = {};
          Array.from(element.attributes).forEach((attr) => {
            extra[attr.name] = attr.value;
          });
          return extra;
        },
        renderDOM: (attributes) => {
          return attributes.extraAttrs || {};
        },
      },
      sdBlockId: {
        default: null,
        keepOnSplit: false,
        parseDOM: (elem) => elem.getAttribute('data-sd-block-id'),
        renderDOM: (attrs) => {
          return attrs.sdBlockId ? { 'data-sd-block-id': attrs.sdBlockId } : {};
        },
      },
      sdBlockRev: {
        default: 0,
        rendered: false,
        keepOnSplit: false,
      },
      attributes: {
        rendered: false,
      },
      filename: { rendered: false },
      paragraphProperties: { rendered: false },
      pageBreakSource: { rendered: false },
      sectionMargins: { rendered: false },
      listRendering: {
        keepOnSplit: false,
        renderDOM: ({ listRendering }) => {
          return {
            'data-marker-type': listRendering?.markerText,
            'data-list-level': listRendering?.path ? JSON.stringify(listRendering.path) : null,
            'data-list-numbering-type': listRendering?.numberingType,
          };
        },
      },
    };
  },

  parseDOM() {
    return [
      {
        tag: 'p',
        getAttrs: parseAttrs,
      },
      {
        tag: 'div',
        getAttrs: (node) => {
          const extra = {};
          Array.from(node.attributes).forEach((attr) => {
            extra[attr.name] = attr.value;
          });
          return { extraAttrs: extra };
        },
      },
      {
        tag: 'blockquote',
        attrs: { paragraphProperties: { styleId: 'BlockQuote' } },
      },
      ...this.options.headingLevels.map((level) => ({
        tag: `h${level}`,
        getAttrs: (node) => {
          let attrs = parseAttrs(node);
          return {
            ...attrs,
            paragraphProperties: {
              ...attrs.paragraphProperties,
              styleId: `Heading${level}`,
            },
          };
        },
      })),
    ];
  },

  renderDOM({ htmlAttributes }) {
    return ['p', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },

  addNodeView() {
    // Skip custom node view when the editor isn't using the docx pipeline (e.g. SuperInput rich text)
    if (this.editor.options?.mode !== 'docx' || !this.editor.converter) return null;
    if (shouldSkipNodeView(this.editor)) return null;
    return ({ node, editor, getPos, decorations, extensionAttrs }) => {
      return new ParagraphNodeView(node, editor, getPos, decorations, extensionAttrs);
    };
  },

  addShortcuts() {
    return {
      'Mod-Shift-7': () => {
        return this.editor.commands.toggleOrderedList();
      },
      'Mod-Shift-8': () => {
        return this.editor.commands.toggleBulletList();
      },
      Enter: (params) => {
        return removeNumberingProperties({ checkType: 'empty' })({
          ...params,
          tr: this.editor.state.tr,
          state: this.editor.state,
          dispatch: this.editor.view.dispatch,
        });
      },

      'Shift-Enter': () => {
        return this.editor.commands.first(({ commands }) => [
          () => commands.createParagraphNear(),
          splitBlock({
            attrsToRemoveOverride: ['paragraphProperties.numberingProperties', 'listRendering', 'numberingProperties'],
          }),
        ]);
      },

      Tab: () => {
        return this.editor.commands.first(({ commands }) => [() => commands.increaseListIndent()]);
      },

      'Shift-Tab': () => {
        return this.editor.commands.first(({ commands }) => [() => commands.decreaseListIndent()]);
      },
    };
  },

  addInputRules() {
    return [
      { regex: orderedInputRegex, type: 'orderedList' },
      { regex: bulletInputRegex, type: 'bulletList' },
    ].map(
      ({ regex, type }) =>
        new InputRule({
          match: regex,
          handler: ({ state, range }) => {
            // Check if we're currently inside a list item
            const parentListItem = findParentNode(isList)(state.selection);
            if (parentListItem) {
              // Inside a list item, do not create a new list
              return null;
            }

            // Not inside a list item, proceed with creating new list
            const { tr } = state;
            tr.delete(range.from, range.to).setSelection(TextSelection.create(tr.doc, range.from));

            ListHelpers.createNewList({
              listType: type,
              tr,
              editor: this.editor,
            });
          },
        }),
    );
  },

  addCommands() {
    return {
      /**
       * Toggle ordered list formatting
       * @category Command
       * @example
       * editor.commands.toggleOrderedList()
       * @note Converts selection to ordered list or back to paragraphs
       */
      toggleOrderedList: () => (params) => {
        return toggleList('orderedList')(params);
      },

      /**
       * Toggle a bullet list at the current selection
       * @category Command
       * @example
       * // Toggle bullet list on selected text
       * editor.commands.toggleBulletList()
       * @note Converts selected paragraphs to list items or removes list formatting
       */
      toggleBulletList: () => (params) => {
        return toggleList('bulletList')(params);
      },

      /**
       * Restart numbering for the current list
       * @category Command
       * @example
       * // Restart numbering for the current list item
       * editor.commands.restartNumbering()
       * @note Resets list numbering for the current list item and following items
       */
      restartNumbering: () => restartNumbering,
    };
  },

  addPmPlugins() {
    const dropcapPlugin = createDropcapPlugin(this.editor);
    const numberingPlugin = createNumberingPlugin(this.editor);
    const listInputFallbackPlugin = new Plugin({
      props: {
        handleDOMEvents: {
          beforeinput: (view, event) => {
            if (!event || event.inputType !== 'insertText' || !event.data) {
              return false;
            }
            if (event.isComposing) return false;

            const { state } = view;
            const { selection } = state;
            if (!selection.empty) return false;

            // Find the enclosing paragraph directly from the resolved position.
            // We avoid `findParentNode(isList)` here because `isList` depends on
            // `getResolvedParagraphProperties`, a WeakMap cache keyed by node
            // identity. After the numbering plugin's `appendTransaction` sets
            // `listRendering`, the paragraph node object is replaced, leaving
            // the new node uncached — causing `isList` to return false.
            const { $from } = selection;
            let paragraph = null;
            for (let d = $from.depth; d >= 0; d--) {
              const node = $from.node(d);
              if (node.type.name === 'paragraph') {
                paragraph = node;
                break;
              }
            }
            if (!paragraph) return false;

            const isListParagraph =
              paragraph.attrs?.paragraphProperties?.numberingProperties && paragraph.attrs?.listRendering;
            if (!isListParagraph) return false;
            if (!isVisuallyEmptyParagraph(paragraph) && !hasOnlyBreakContent(paragraph)) return false;

            const tr = state.tr.insertText(event.data);
            view.dispatch(tr);
            event.preventDefault();
            return true;
          },
        },
      },
    });
    return [dropcapPlugin, numberingPlugin, listInputFallbackPlugin, createLeadingCaretPlugin()];
  },
});
