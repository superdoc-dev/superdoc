// @ts-nocheck

import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

/**
 * Configuration options for LineBreak
 * @typedef {Object} LineBreakOptions
 * @category Options
 */

/**
 * Attributes for line break nodes
 * @typedef {Object} LineBreakAttributes
 * @category Attributes
 * @property {string} [lineBreakType] @internal Type of line break - passthrough in this node
 * @property {string} [clear] @internal Clear attribute - passthrough in this node
 */

/**
 * @module LineBreak
 * @sidebarTitle Line Break
 * @snippetPath /snippets/extensions/line-break.mdx
 */
export const LineBreak = Node.create({
  name: 'lineBreak',
  group: 'inline',
  inline: true,
  marks: '',
  defining: true,
  selectable: false,
  content: '',
  atom: true,

  addOptions() {
    return {};
  },

  parseDOM() {
    return [{ tag: 'br' }];
  },

  renderDOM() {
    return ['br', {}];
  },

  addAttributes() {
    return {
      lineBreakType: { rendered: false },
      clear: { rendered: false },
    };
  },

  // @ts-expect-error - Command signatures will be fixed in TS migration
  addCommands() {
    return {
      /**
       * Insert a line break
       * @category Command
       * @example
       * editor.commands.insertLineBreak()
       * @note Creates a soft break within the same paragraph
       */
      insertLineBreak:
        () =>
        ({ commands }) => {
          return commands.insertContent({ type: 'lineBreak' });
        },
    };
  },
});

/**
 * Configuration options for HardBreak
 * @typedef {Object} HardBreakOptions
 * @category Options
 * @property {Object} [htmlAttributes] - HTML attributes for the break element
 */

/**
 * Attributes for hard break nodes
 * @typedef {Object} HardBreakAttributes
 * @category Attributes
 * @property {string} [pageBreakSource] @internal Source of the page break
 * @property {string} [pageBreakType] @internal Type of page break
 * @property {string} [lineBreakType] @internal Type of line break - passthrough in this node
 * @property {string} [clear] @internal Clear attribute - passthrough in this node
 */

/**
 * @module HardBreak
 * @sidebarTitle Hard Break
 * @snippetPath /snippets/extensions/hard-break.mdx
 */
export const HardBreak = Node.create({
  name: 'hardBreak',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,

  addOptions() {
    return {
      htmlAttributes: {
        contentEditable: 'false',
        lineBreakType: 'page',
        'aria-hidden': 'true',
        'aria-label': 'Hard break node',
      },
    };
  },

  addAttributes() {
    return {
      pageBreakSource: {
        rendered: false,
        default: null,
      },

      pageBreakType: {
        default: null,
        rendered: false,
      },

      lineBreakType: { rendered: false },

      clear: { rendered: false },
    };
  },

  parseDOM() {
    return [
      {
        tag: 'span[linebreaktype="page"]',
        getAttrs: (dom) => {
          if (!(dom instanceof HTMLElement)) return false;
          return {
            pageBreakSource: dom.getAttribute('pagebreaksource') || null,
            pageBreakType: dom.getAttribute('linebreaktype') || null,
          };
        },
      },
    ];
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes)];
  },

  // @ts-expect-error - Command signatures will be fixed in TS migration
  addCommands() {
    return {
      /**
       * Insert a page break
       * @category Command
       * @example
       * editor.commands.insertPageBreak()
       * @note Forces content to start on a new page when printed
       */
      insertPageBreak:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: 'hardBreak',
            attrs: { pageBreakType: 'page' },
          });
        },
    };
  },
});
