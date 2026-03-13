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

const NAVIGATION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

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

    /** True when all interaction should be blocked (not editable AND no selection-only override). */
    const isFullyBlocked = () => !editor.options.editable && !editor.options.allowSelectionInViewMode;

    /** Block an event when the editor is not editable (regardless of allowSelectionInViewMode). */
    const blockWhenNotEditable = (_view, event) => {
      if (!editor.options.editable) {
        event.preventDefault();
        return true;
      }
      return false;
    };

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
            if (isFullyBlocked()) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          focus: (view, event) => {
            if (isFullyBlocked()) {
              event.preventDefault();
              view.dom.blur();
              return true;
            }
            return false;
          },
          // Block IME composition events when not editable.
          // The input bridge forwards composition events when view.editable is true
          // (e.g. allowSelectionInViewMode), but we must prevent document mutations.
          compositionstart: blockWhenNotEditable,
          compositionupdate: blockWhenNotEditable,
          compositionend: blockWhenNotEditable,
        },
        handleClick: () => isFullyBlocked(),
        handleDoubleClick: () => isFullyBlocked(),
        handleTripleClick: () => isFullyBlocked(),
        handleKeyDown: (_view, event) => {
          if (!editor.options.editable) {
            if (editor.options.allowSelectionInViewMode) {
              if (NAVIGATION_KEYS.has(event.key)) return false;

              const isCopyOrSelectAll =
                (event.ctrlKey || event.metaKey) && ['c', 'a'].includes(event.key.toLowerCase());
              if (isCopyOrSelectAll) return false;
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
