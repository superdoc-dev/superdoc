import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';

/**
 * Configuration options for Mention
 * @typedef {Object} MentionOptions
 * @category Options
 * @property {Object} [htmlAttributes] - HTML attributes for mention elements
 */

/**
 * Attributes for mention nodes
 * @typedef {Object} MentionAttributes
 * @category Attributes
 * @property {string} [name=null] - Display name of the mentioned person
 * @property {string} [email=null] - Email address of the mentioned person
 */

/**
 * @module Mention
 * @sidebarTitle Mention
 * @snippetPath /snippets/extensions/mention.mdx
 */
export const Mention = Node.create({
  name: 'mention',

  group: 'inline',

  inline: true,

  selectable: false,

  excludeFromSummaryJSON: true,

  atom: true,

  addOptions() {
    return {
      htmlAttributes: {
        class: 'sd-editor-mention',
        'aria-label': 'Mention node',
      },
    };
  },

  parseDOM() {
    return [
      {
        tag: `span[data-type="${this.name || this.email}"]`,
        getAttrs: (node) => ({
          name: node.getAttribute('name') || null,
          email: node.getAttribute('email') || null,
        }),
      },
    ];
  },

  renderDOM({ node, htmlAttributes }) {
    const { name, email } = node.attrs;

    return [
      'span',
      Attribute.mergeAttributes({ 'data-type': this.name || this.email }, this.options.htmlAttributes, htmlAttributes),
      `@${name ? name : email}`,
    ];
  },

  addAttributes() {
    return {
      name: { default: null },
      email: { default: null },
    };
  },
});
