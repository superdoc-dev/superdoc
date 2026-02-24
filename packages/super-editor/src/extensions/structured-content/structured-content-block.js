import { Node, Attribute } from '@core/index';
import { StructuredContentBlockView } from './StructuredContentBlockView';

export const structuredContentBlockClass = 'sd-structured-content-block';
export const structuredContentBlockInnerClass = 'sd-structured-content-block__content';

/**
 * Configuration options for StructuredContentBlock
 * @typedef {Object} StructuredContentBlockOptions
 * @category Options
 * @property {string} [structuredContentBlockClass='sd-structured-content-block-tag'] - CSS class for the block
 * @property {Object} [htmlAttributes] - HTML attributes for structured content blocks
 */

/**
 * Attributes for structured content block nodes
 * @typedef {Object} StructuredContentBlockAttributes
 * @category Attributes
 * @property {string} [id] Unique identifier for the structured content block
 * @property {string} [tag] Content control tag (e.g., 'block_table_sdt')
 * @property {string} [alias] Display name for the block (falls back to 'Structured content' when omitted)
 * @property {Object} [sdtPr] @internal Internal structured document tag properties
 * @example
 * // Get attributes from a structured content block
 * const attrs = editor.getAttributes('structuredContentBlock')
 * console.log(attrs.id, attrs.alias)
 */

export const StructuredContentBlock = Node.create({
  name: 'structuredContentBlock',

  group: 'block structuredContent',

  content: 'block*',

  isolating: true,

  atom: false, // false - has editable content.

  draggable: true,

  addOptions() {
    return {
      htmlAttributes: {
        class: structuredContentBlockClass,
        'aria-label': 'Structured content block node',
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
    return [{ tag: 'div[data-structured-content-block]' }];
  },

  renderDOM({ htmlAttributes }) {
    return [
      'div',
      Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes, {
        'data-structured-content-block': '',
      }),
      0,
    ];
  },

  addNodeView() {
    return (props) => {
      return new StructuredContentBlockView({ ...props });
    };
  },
});
