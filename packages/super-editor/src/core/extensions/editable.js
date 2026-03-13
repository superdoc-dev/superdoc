import { Plugin, PluginKey } from 'prosemirror-state';
import { Extension } from '../Extension.js';

const handleBackwardReplaceInsertText = (view, event) => {
  const isInsertTextInput = event?.inputType === 'insertText';
  const hasTextData = typeof event?.data === 'string' && event.data.length > 0;
  const hasNonEmptySelection = !view.state.selection.empty;

  if (!isInsertTextInput || !hasTextData || !hasNonEmptySelection) {
    return false;
  }

  const selection = view.state.selection;
  const anchor = selection.anchor ?? selection.from;
  const head = selection.head ?? selection.to;
  const isBackwardSelection = anchor > head;

  if (!isBackwardSelection) {
    return false;
  }

  const tr = view.state.tr.insertText(event.data, selection.from, selection.to);
  tr.setMeta('inputType', 'insertText');
  view.dispatch(tr);
  event.preventDefault();

  return true;
};

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
 * - Navigation keys (arrows, Home/End, PageUp/PageDown) are allowed
 * - Copy (Ctrl/Cmd+C) and Select All (Ctrl/Cmd+A) are allowed
 * - IME/composition input, text input, paste, and drop remain blocked
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
          beforeinput: (view, event) => {
            if (!editor.options.editable) {
              event.preventDefault();
              return true;
            }

            // Backward (right-to-left) replacement can be misinterpreted downstream as
            // deleteContentBackward. Handle this narrow case explicitly at beforeinput level.
            if (handleBackwardReplaceInsertText(view, event)) {
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
          // Block IME composition events when not editable.
          // The input bridge forwards composition events when view.editable is true
          // (e.g. allowSelectionInViewMode), but we must prevent document mutations.
          compositionstart: (_view, event) => {
            if (!editor.options.editable) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          compositionupdate: (_view, event) => {
            if (!editor.options.editable) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          compositionend: (_view, event) => {
            if (!editor.options.editable) {
              event.preventDefault();
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
            if (editor.options.allowSelectionInViewMode) {
              // Allow navigation keys for selection and cursor movement
              const isNavigationKey = [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
                'PageUp',
                'PageDown',
              ].includes(event.key);

              // Allow copy and select all
              const isCopyOrSelectAll =
                (event.ctrlKey || event.metaKey) && ['c', 'a'].includes(event.key.toLowerCase());

              if (isNavigationKey || isCopyOrSelectAll) return false;
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
