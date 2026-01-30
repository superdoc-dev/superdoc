import { Plugin, PluginKey } from 'prosemirror-state';
import { Extension } from '../Extension.js';

/**
 * Editable extension controls whether the editor accepts user input.
 *
 * When editable is false, all user interactions are blocked:
 * - Text input via beforeinput events
 * - Mouse interactions via mousedown (unless allowSelectionInViewMode is true)
 * - Focus via automatic blur (unless allowSelectionInViewMode is true)
 * - Click, double-click, and triple-click events (unless allowSelectionInViewMode is true)
 * - Keyboard shortcuts via handleKeyDown
 * - Paste and drop events
 *
 * When allowSelectionInViewMode is true and editable is false:
 * - Mouse interactions are allowed for text selection
 * - Focus is allowed
 * - Click events are allowed for selection
 * - But text input, keyboard shortcuts, paste, and drop remain blocked
 */
export const Editable = Extension.create({
  name: 'editable',

  addPmPlugins() {
    const editor = this.editor;
    const editablePlugin = new Plugin({
      key: new PluginKey('editable'),
      props: {
        editable: () => editor.options.editable,
        handleDOMEvents: {
          beforeinput: (_view, event) => {
            if (!editor.options.editable) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          mousedown: (_view, event) => {
            // Allow mousedown for selection when allowSelectionInViewMode is enabled
            if (!editor.options.editable && !editor.options.allowSelectionInViewMode) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          focus: (view, event) => {
            // Allow focus when allowSelectionInViewMode is enabled
            if (!editor.options.editable && !editor.options.allowSelectionInViewMode) {
              event.preventDefault();
              view.dom.blur();
              return true;
            }
            return false;
          },
        },
        // Allow click events for selection when allowSelectionInViewMode is enabled
        handleClick: () => !editor.options.editable && !editor.options.allowSelectionInViewMode,
        handleDoubleClick: () => !editor.options.editable && !editor.options.allowSelectionInViewMode,
        handleTripleClick: () => !editor.options.editable && !editor.options.allowSelectionInViewMode,
        // Always block keyboard input, paste, and drop when not editable
        handleKeyDown: (_view, event) => {
          if (!editor.options.editable) {
            // Allow Ctrl+C / Cmd+C for copy when allowSelectionInViewMode is enabled
            if (editor.options.allowSelectionInViewMode) {
              const isCopy = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c';
              if (isCopy) return false;
            }
            return true;
          }
          return false;
        },
        handlePaste: () => !editor.options.editable,
        handleDrop: () => !editor.options.editable,
      },
    });

    return [editablePlugin];
  },
});
