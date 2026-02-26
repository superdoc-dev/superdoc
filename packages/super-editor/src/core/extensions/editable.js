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
 * - Mouse interactions via mousedown
 * - Focus via automatic blur
 * - Click, double-click, and triple-click events
 * - Keyboard shortcuts via handleKeyDown
 * - Paste and drop events
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
            if (!editor.options.editable) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          focus: (view, event) => {
            if (!editor.options.editable) {
              event.preventDefault();
              view.dom.blur();
              return true;
            }
            return false;
          },
        },
        handleClick: () => !editor.options.editable,
        handleDoubleClick: () => !editor.options.editable,
        handleTripleClick: () => !editor.options.editable,
        handleKeyDown: () => !editor.options.editable,
        handlePaste: () => !editor.options.editable,
        handleDrop: () => !editor.options.editable,
      },
    });

    return [editablePlugin];
  },
});
