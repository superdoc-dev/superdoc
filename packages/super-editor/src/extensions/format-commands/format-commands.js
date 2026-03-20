// @ts-nocheck
import { Extension } from '@core/Extension.js';
import { getMarksFromSelection } from '@core/helpers/getMarksFromSelection.js';
import { toggleMarkCascade } from '@core/commands/toggleMarkCascade.js';

/**
 * Stored format style
 * @typedef {Object} StoredStyle
 * @property {string} name - Mark name
 * @property {Object} attrs - Mark attributes
 */

/**
 * Configuration options for FormatCommands
 * @typedef {Object} FormatCommandsOptions
 * @category Options
 */

/**
 * @module FormatCommands
 * @sidebarTitle Format Commands
 * @snippetPath /snippets/extensions/format-commands.mdx
 * @shortcut Mod-Alt-c | clearFormat | Clear all formatting
 */
export const FormatCommands = Extension.create({
  name: 'formatCommands',

  addOptions() {
    return {};
  },

  addStorage() {
    return {
      /**
       * @private
       * @type {StoredStyle[]|null}
       */
      storedStyle: null,
    };
  },

  addCommands() {
    return {
      toggleMarkCascade,
      /**
       * Clear all formatting (nodes and marks)
       * @category Command
       * @example
       * editor.commands.clearFormat()
       * @note Removes all marks and resets nodes to default paragraph
       */
      clearFormat:
        () =>
        ({ chain }) => {
          return chain().clearNodes().unsetAllMarks().run();
        },

      /**
       * Clear only mark formatting
       * @category Command
       * @example
       * editor.commands.clearMarksFormat()
       * @note Removes bold, italic, underline, colors, etc. but preserves block structure
       */
      clearMarksFormat:
        () =>
        ({ chain }) => {
          return chain().unsetAllMarks().run();
        },

      /**
       * Clear only node formatting
       * @category Command
       * @example
       * editor.commands.clearNodesFormat()
       * @note Converts headings, lists, etc. to paragraphs but preserves text marks
       */
      clearNodesFormat:
        () =>
        ({ chain }) => {
          return chain().clearNodes().run();
        },

      /**
       * Copy format from selection or apply copied format
       * @category Command
       * @example
       * editor.commands.copyFormat()
       * @note Works like format painter - first click copies, second click applies
       */
      copyFormat:
        () =>
        ({ chain }) => {
          // If we don't have a saved style, save the current one
          if (!this.storage.storedStyle) {
            const marks = getMarksFromSelection(this.editor.state, this.editor);
            this.storage.storedStyle = marks;
            return true;
          }

          // Special case: if there are no stored marks, but this is still an apply action
          // We just clear the format
          if (!this.storage.storedStyle.length) {
            this.storage.storedStyle = null;
            return chain().clearFormat().run();
          }

          // If we do have a stored style, apply it
          const storedMarks = this.storage.storedStyle;
          const processedMarks = [];
          storedMarks.forEach((mark) => {
            const { type, attrs } = mark;
            const { name } = type;

            if (name === 'textStyle') {
              Object.keys(attrs).forEach((key) => {
                if (!attrs[key]) return;
                const attributes = {};
                attributes[key] = attrs[key];
                processedMarks.push({ name: key, attrs: attributes });
              });
            } else {
              processedMarks.push({ name, attrs });
            }
          });

          const marksToCommands = {
            bold: ['setBold', 'unsetBold'],
            italic: ['setItalic', 'unsetItalic'],
            underline: ['setUnderline', 'unsetUnderline'],
            color: ['setColor', 'setColor', null],
            fontSize: ['setFontSize', 'unsetFontSize'],
            fontFamily: ['setFontFamily', 'unsetFontFamily'],
          };

          // Apply marks present, clear ones that are not, by chaining commands
          let result = chain();
          Object.keys(marksToCommands).forEach((key) => {
            const [setCommand, unsetCommand, defaultParam] = marksToCommands[key];
            const markToApply = processedMarks.find((mark) => mark.name === key);
            const hasEmptyAttrs = markToApply?.attrs && markToApply?.attrs[key];

            let cmd = {};
            if (!markToApply && !hasEmptyAttrs) cmd = { command: unsetCommand, argument: defaultParam };
            else cmd = { command: setCommand, argument: markToApply.attrs[key] || defaultParam };
            result = result[cmd.command](cmd.argument);
          });

          this.storage.storedStyle = null;
          return result;
        },
    };
  },

  addShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.clearFormat(),
    };
  },
});
