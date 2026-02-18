// @ts-nocheck

import { Attribute, OxmlNode } from '@core/index.js';
import { splitRunToParagraph, splitRunAtCursor } from './commands/index.js';
import { cleanupEmptyRunsPlugin } from './cleanupEmptyRunsPlugin.js';
import { wrapTextInRunsPlugin } from './wrapTextInRunsPlugin.js';
import { calculateInlineRunPropertiesPlugin } from './calculateInlineRunPropertiesPlugin.js';

/**
 * Run node emulates OOXML w:r (run) boundaries while remaining transparent to layout.
 * It carries run-level metadata (runProperties, rsid attributes) without affecting visual style.
 */
export const Run = OxmlNode.create({
  name: 'run',
  oXmlName: 'w:r',
  group: 'inline',
  inline: true,
  content: 'inline*',
  selectable: false,
  childToAttributes: ['runProperties'],

  addOptions() {
    return {
      htmlAttributes: {
        'data-run': '1',
      },
    };
  },

  addAttributes() {
    return {
      runProperties: {
        default: null,
        rendered: false,
        keepOnSplit: true,
      },
      rsidR: {
        default: null,
        rendered: false,
        keepOnSplit: true,
      },
      rsidRPr: {
        default: null,
        rendered: false,
        keepOnSplit: true,
      },
      rsidDel: {
        default: null,
        rendered: false,
        keepOnSplit: true,
      },
    };
  },

  // @ts-expect-error - Command signatures will be fixed in TS migration
  addCommands() {
    return {
      splitRunToParagraph,
      splitRunAtCursor,
    };
  },

  parseDOM() {
    return [{ tag: 'span[data-run]' }];
  },

  renderDOM({ htmlAttributes }) {
    const base = Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes);
    return ['span', base, 0];
  },
  addPmPlugins() {
    return [wrapTextInRunsPlugin(this.editor), calculateInlineRunPropertiesPlugin(this.editor), cleanupEmptyRunsPlugin];
  },
});
