// @ts-check
import { Extension } from '@core/Extension.js';
import { dropCursor } from 'prosemirror-dropcursor';

/**
 * Configuration options for DropCursor
 * @typedef {Object} DropCursorOptions
 * @category Options
 * @property {string} [color='currentColor'] CSS color for the drop cursor indicator
 * @property {number} [width=2] Width of the drop cursor line in pixels
 * @property {string} [class] Optional CSS class to apply to the drop cursor element
 * @example
 * // Customize drop cursor appearance
 * const ConfiguredDropCursor = DropCursor.configure({
 *   color: '#3b82f6',
 *   width: 3,
 *   class: 'custom-drop-cursor'
 * });
 *
 * // Use in SuperDoc
 * new SuperDoc({
 *   selector: '#editor',
 *   document: 'document.docx',
 *   editorExtensions: [ConfiguredDropCursor]
 * });
 */

/**
 * @module DropCursor
 * @sidebarTitle Drop Cursor
 * @snippetPath /snippets/extensions/dropcursor.mdx
 */
export const DropCursor = Extension.create({
  name: 'dropCursor',

  addOptions() {
    return {
      color: 'currentColor',
      width: 2,
      class: undefined,
    };
  },

  addPmPlugins() {
    return [dropCursor(this.options)];
  },
});
