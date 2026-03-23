import { Node } from '@core/Node.js';

/**
 * Configuration options for Text
 * @typedef {Object} TextOptions
 * @category Options
 */

/**
 * @module Text
 * @sidebarTitle Text
 * @snippetPath /snippets/extensions/text.mdx
 */
export const Text = Node.create({
  name: 'text',
  group: 'inline',
  inline: true,

  addOptions() {
    return {};
  },
});
