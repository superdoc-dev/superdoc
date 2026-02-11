import { Node, Attribute } from '@core/index';
import { StructuredContentInlineView } from './StructuredContentInlineView';
import { createStructuredContentLockPlugin } from './structured-content-lock-plugin';
import { createStructuredContentSelectPlugin } from './structured-content-select-plugin';

export const structuredContentClass = 'sd-structured-content';
export const structuredContentInnerClass = 'sd-structured-content__content';

/**
 * Configuration options for StructuredContent
 * @typedef {Object} StructuredContentOptions
 * @category Options
 * @property {string} [structuredContentClass='sd-structured-content-tag'] - CSS class for the inline element
 * @property {Object} [htmlAttributes] - HTML attributes for structured content elements
 */

/**
 * Attributes for structured content nodes
 * @typedef {Object} StructuredContentAttributes
 * @category Attributes
 * @property {string} [id] Unique identifier for the structured content field
 * @property {string} [tag] Content control tag (e.g., 'inline_text_sdt')
 * @property {string} [alias] Display name for the field (falls back to 'Structured content' when omitted)
 * @property {Object} [sdtPr] @internal Internal structured document tag properties
 * @example
 * // Get attributes from a structured content field
 * const attrs = editor.getAttributes('structuredContent')
 * console.log(attrs.id, attrs.alias)
 */

/**
 * @module StructuredContent
 * @sidebarTitle Structured Content
 * @snippetPath /snippets/extensions/structured-content.mdx
 */
export const StructuredContent = Node.create({
  name: 'structuredContent',

  group: 'inline structuredContent',

  inline: true,

  content: 'inline*',

  isolating: true,

  atom: false, // false - has editable content.

  draggable: true,

  addOptions() {
    return {
      htmlAttributes: {
        class: structuredContentClass,
        'aria-label': 'Structured content node',
      },
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseDOM: (elem) => elem.getAttribute('data-id'),
        renderDOM: (attrs) => {
          if (!attrs.id) return {};
          return { 'data-id': attrs.id };
        },
      },

      tag: {
        default: null,
        parseDOM: (elem) => elem.getAttribute('data-tag'),
        renderDOM: (attrs) => {
          if (!attrs.tag) return {};
          return { 'data-tag': attrs.tag };
        },
      },

      alias: {
        default: null,
        parseDOM: (elem) => elem.getAttribute('data-alias'),
        renderDOM: (attrs) => {
          if (!attrs.alias) return {};
          return { 'data-alias': attrs.alias };
        },
      },

      lockMode: {
        default: 'unlocked',
        parseDOM: (elem) => elem.getAttribute('data-lock-mode') || 'unlocked',
        renderDOM: (attrs) => {
          if (!attrs.lockMode || attrs.lockMode === 'unlocked') return {};
          return { 'data-lock-mode': attrs.lockMode };
        },
      },

      sdtPr: {
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'span[data-structured-content]' }];
  },

  renderDOM({ htmlAttributes }) {
    return [
      'span',
      Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes, {
        'data-structured-content': '',
      }),
      0,
    ];
  },

  addPmPlugins() {
    return [createStructuredContentLockPlugin(), createStructuredContentSelectPlugin()];
  },

  addNodeView() {
    return (props) => {
      return new StructuredContentInlineView({ ...props });
    };
  },
});
