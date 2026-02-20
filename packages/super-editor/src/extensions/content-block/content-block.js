// @ts-nocheck

import { Node, Attribute } from '@core/index.js';

/**
 * Size configuration for content blocks
 * @typedef {Object} ContentBlockSize
 * @property {number} [top] - Top position in pixels
 * @property {number} [left] - Left position in pixels
 * @property {number|string} [width] - Width in pixels or percentage (e.g., "50%")
 * @property {number|string} [height] - Height in pixels or percentage
 */

/**
 * Content block configuration
 * @typedef {Object} ContentBlockConfig
 * @property {boolean} [horizontalRule] - Whether this is a horizontal rule
 * @property {ContentBlockSize} [size] - Size and position configuration
 * @property {string} [background] - Background color (hex, rgb, or named color)
 */

/**
 * Configuration options for ContentBlock
 * @typedef {Object} ContentBlockOptions
 * @category Options
 * @property {Object} [htmlAttributes] HTML attributes for the block element
 */

/**
 * Attributes for content blocks
 * @typedef {Object} ContentBlockAttributes
 * @category Attributes
 * @property {boolean} [horizontalRule=false] Whether this block is a horizontal rule
 * @property {ContentBlockSize} [size] Size and position of the content block
 * @property {string} [background] Background color for the block
 * @property {Object} [drawingContent] @internal Internal drawing data
 * @property {Object} [attributes] @internal Additional internal attributes
 * @example
 * // Insert a custom content block
 * editor.commands.insertContentBlock({
 *   size: { width: '100%', height: 2 },
 *   background: '#e5e7eb'
 * })
 */

/**
 * Default attributes for a horizontal rule content block.
 * Single source of truth shared by both `parseDOM` (for `<hr>` tags)
 * and the `insertHorizontalRule` command.
 * @returns {ContentBlockAttributes}
 */
export function createDefaultHorizontalRuleAttrs() {
  return {
    horizontalRule: true,
    size: { width: '100%', height: 2 },
    background: '#e5e7eb',
  };
}

/**
 * @module ContentBlock
 * @sidebarTitle Content Block
 * @snippetPath /snippets/extensions/content-block.mdx
 */
export const ContentBlock = Node.create({
  name: 'contentBlock',

  group: 'inline',

  content: '',

  isolating: true,
  atom: true,
  inline: true,

  addOptions() {
    return {
      htmlAttributes: {
        contenteditable: false,
      },
    };
  },

  addAttributes() {
    return {
      horizontalRule: {
        default: false,
        renderDOM: ({ horizontalRule }) => {
          if (!horizontalRule) return {};
          return { 'data-horizontal-rule': 'true' };
        },
      },

      size: {
        default: null,
        renderDOM: (attrs) => {
          if (!attrs.size) return {};

          let style = '';
          // @ts-expect-error - size is known to be an object with these properties at runtime
          if (attrs.size.top) style += `top: ${attrs.size.top}px; `;
          // @ts-expect-error - size is known to be an object with these properties at runtime
          if (attrs.size.left) style += `left: ${attrs.size.left}px; `;
          // @ts-expect-error - size is known to be an object with these properties at runtime
          if (attrs.size.width)
            style += `width: ${attrs.size.width.toString().endsWith('%') ? attrs.size.width : `${attrs.size.width}px`}; `;
          // @ts-expect-error - size is known to be an object with these properties at runtime
          if (attrs.size.height)
            style += `height: ${attrs.size.height.toString().endsWith('%') ? attrs.size.height : `${attrs.size.height}px`}; `;

          // Apply positioning and z-index for anchored content blocks
          if (attrs.marginOffset?.horizontal != null || attrs.marginOffset?.top != null) {
            style += 'position: absolute; ';

            // Use relativeHeight from OOXML for proper z-ordering of overlapping elements
            const relativeHeight = attrs.originalAttributes?.relativeHeight;
            if (relativeHeight != null) {
              // Scale down the relativeHeight value to a reasonable CSS z-index range
              // OOXML uses large numbers (e.g., 251659318), we normalize to a smaller range
              const zIndex = Math.floor(relativeHeight / 1000000);
              style += `z-index: ${zIndex}; `;
            } else {
              style += 'z-index: 1; ';
            }
          }

          return { style };
        },
      },

      background: {
        default: null,
        renderDOM: (attrs) => {
          if (!attrs.background) return {};
          return {
            style: `background-color: ${attrs.background}`,
          };
        },
      },

      drawingContent: {
        rendered: false,
      },

      attributes: {
        rendered: false,
      },

      originalAttributes: {
        rendered: false,
      },

      marginOffset: {
        default: null,
        rendered: false,
      },
    };
  },

  parseDOM() {
    return [
      {
        tag: `div[data-type="${this.name}"]`,
        // Paragraph registers a broad `tag: 'div'` rule at default priority 50.
        // Without explicit priority, PM's insertion-order tie-breaking lets
        // paragraph consume our div first. Priority 60 ensures contentBlock wins.
        priority: 60,
      },
      {
        tag: 'hr',
        getAttrs: () => createDefaultHorizontalRuleAttrs(),
      },
    ];
  },

  renderDOM({ htmlAttributes }) {
    return ['div', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes, { 'data-type': this.name })];
  },

  // @ts-expect-error - Command signatures will be fixed in TS migration
  addCommands() {
    return {
      /**
       * Insert a horizontal rule
       * @category Command
       * @example
       * editor.commands.insertHorizontalRule()
       * @note Creates a visual separator between content sections
       */
      insertHorizontalRule:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: createDefaultHorizontalRuleAttrs(),
          });
        },

      /**
       * Insert a content block
       * @category Command
       * @param {ContentBlockConfig} config - Block configuration
       * @example
       * // Insert a spacer block
       * editor.commands.insertContentBlock({ size: { height: 20 } })
       *
       * @example
       * // Insert a colored divider
       * editor.commands.insertContentBlock({
       *   size: { width: '50%', height: 3 },
       *   background: '#3b82f6'
       * })
       * @note Used for spacing, dividers, and special inline content
       */
      insertContentBlock:
        (config) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: config,
          });
        },
    };
  },
});
