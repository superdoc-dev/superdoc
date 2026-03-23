// @ts-check
import { gapCursor } from 'prosemirror-gapcursor';
import { Extension } from '@core/Extension.js';
import { callOrGet } from '@core/utilities/callOrGet.js';
import { getExtensionConfigField } from '@core/helpers/getExtensionConfigField.js';

/**
 * Configuration options for Gapcursor
 * @typedef {Object} GapcursorOptions
 * @category Options
 */

/**
 * @module Gapcursor
 * @sidebarTitle Gap Cursor
 * @snippetPath /snippets/extensions/gapcursor.mdx
 */
export const Gapcursor = Extension.create({
  name: 'gapCursor',

  addOptions() {
    return {};
  },

  addPmPlugins() {
    return [gapCursor()];
  },

  /**
   * Extend node schema to allow gap cursor positioning
   * @returns {Object} Schema extension with allowGapCursor property
   */
  extendNodeSchema(extension) {
    return {
      /**
       * Whether to allow gap cursor before/after this node
       * Set to false on nodes where gap cursor shouldn't appear
       * @type {boolean|null}
       */
      allowGapCursor:
        callOrGet(
          getExtensionConfigField(extension, 'allowGapCursor', {
            name: extension.name,
            options: extension.options,
            storage: extension.storage,
          }),
        ) ?? null,
    };
  },
});
