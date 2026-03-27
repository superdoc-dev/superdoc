// @ts-nocheck

import { Attribute } from '@core/Attribute.js';
import { OxmlNode } from '@core/OxmlNode.js';
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
      /** Keys of runProperties that were in the run's w:rPr (or set by user). Export outputs only these to avoid duplicating style-inherited props in styles.xml. */
      runPropertiesInlineKeys: {
        default: null,
        rendered: false,
        keepOnSplit: true,
      },
      /** Keys from the run's style (w:rStyle/styleId) in styles.xml. Export omits these so we don't duplicate run-style props. */
      runPropertiesStyleKeys: {
        default: null,
        rendered: false,
        keepOnSplit: true,
      },
      /** Keys that override the run's style (in w:rPr at import, or changed by user). Export includes these so user overrides are preserved. */
      runPropertiesOverrideKeys: {
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
