// @ts-nocheck
import { Extension } from '@core/Extension.js';
import { getMarksFromSelection } from '@core/helpers/getMarksFromSelection.js';
import { toggleMarkCascade } from '@core/commands/toggleMarkCascade.js';

const FORMAT_PAINTER_DOUBLE_CLICK_MS = 500;
const FORMAT_PAINTER_UI_SELECTOR =
  '[data-editor-ui-surface], .toolbar-dropdown-menu, .sd-toolbar-dropdown-menu, .sd-tooltip-content';

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
      sourceSelection: null,
      persistent: false,
      lastCopyFormatClickAt: 0,
      releaseCleanup: null,
      pointerSelecting: false,
      keyboardSelecting: false,
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
       * @note Works like format painter: click copies for one target selection; double-click keeps it active
       */
      copyFormat:
        () =>
        ({ chain }) => {
          const currentSelection = getSelectionRange(this.editor.state);

          if (!this.storage.storedStyle) {
            const marks = getMarksFromSelection(this.editor.state, this.editor);
            this.storage.storedStyle = marks;
            this.storage.sourceSelection = currentSelection;
            this.storage.persistent = false;
            this.storage.lastCopyFormatClickAt = Date.now();
            armFormatPainterRelease({ storage: this.storage, editor: this.editor });
            return true;
          }

          if (this.storage.persistent) {
            clearFormatPainterStorage(this.storage);
            return true;
          }

          const clickedSourceAgain = isSameSelection(currentSelection, this.storage.sourceSelection);
          const isDoubleClick =
            clickedSourceAgain && Date.now() - this.storage.lastCopyFormatClickAt <= FORMAT_PAINTER_DOUBLE_CLICK_MS;

          if (isDoubleClick && !this.storage.persistent) {
            this.storage.persistent = true;
            this.storage.lastCopyFormatClickAt = 0;
            return true;
          }

          if (clickedSourceAgain) {
            clearFormatPainterStorage(this.storage);
            return true;
          }

          return applyStoredFormat({ chain, storage: this.storage });
        },

      /**
       * Apply the stored format painter style to the current selection.
       * @category Command
       * @example
       * editor.commands.applyStoredFormat()
       */
      applyStoredFormat:
        () =>
        ({ chain }) => {
          return applyStoredFormat({ chain, storage: this.storage });
        },
    };
  },

  onSelectionUpdate({ editor }) {
    const { storedStyle, sourceSelection } = this.storage;
    if (!storedStyle) return;

    const currentSelection = getSelectionRange(editor.state);
    if (editor.state.selection.empty || isSameSelection(currentSelection, sourceSelection)) return;
    if (this.storage.pointerSelecting || this.storage.keyboardSelecting) return;

    editor.commands.applyStoredFormat();
  },

  onDestroy() {
    clearFormatPainterStorage(this.storage);
  },

  addShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.clearFormat(),
    };
  },
});

function getSelectionRange(state) {
  const { from, to } = state.selection;
  return { from, to };
}

function isSameSelection(selection, otherSelection) {
  if (!selection || !otherSelection) return false;
  return selection.from === otherSelection.from && selection.to === otherSelection.to;
}

function clearFormatPainterStorage(storage) {
  storage.releaseCleanup?.();
  storage.storedStyle = null;
  storage.sourceSelection = null;
  storage.persistent = false;
  storage.lastCopyFormatClickAt = 0;
  storage.releaseCleanup = null;
  storage.pointerSelecting = false;
  storage.keyboardSelecting = false;
}

function armFormatPainterRelease({ storage, editor }) {
  if (storage.releaseCleanup) return;
  if (typeof document === 'undefined' || !document?.addEventListener) return;

  const pointerDownEventName = typeof PointerEvent === 'undefined' ? 'mousedown' : 'pointerdown';
  const pointerUpEventName = typeof PointerEvent === 'undefined' ? 'mouseup' : 'pointerup';
  const isToolbarEvent = (event) => event?.target?.closest?.(FORMAT_PAINTER_UI_SELECTOR);

  const applyIfTargetSelected = () => {
    if (!storage.storedStyle) return;
    const selection = editor.state.selection;
    const currentSelection = getSelectionRange(editor.state);
    if (selection.empty || isSameSelection(currentSelection, storage.sourceSelection)) return;

    editor.commands.applyStoredFormat();
  };

  const handlePointerDown = (event) => {
    if (isToolbarEvent(event)) {
      storage.pointerSelecting = false;
      return;
    }
    storage.pointerSelecting = true;
  };

  const handleRelease = (event) => {
    if (isToolbarEvent(event)) {
      storage.pointerSelecting = false;
      return;
    }
    storage.pointerSelecting = false;
    applyIfTargetSelected();
  };

  const handleKeyDown = (event) => {
    if (isToolbarEvent(event)) return;
    if (isFormatPainterSelectionKey(event)) storage.keyboardSelecting = true;
  };

  const handleKeyUp = () => {
    if (!storage.keyboardSelecting) return;
    storage.keyboardSelecting = false;
    applyIfTargetSelected();
  };

  document.addEventListener(pointerDownEventName, handlePointerDown, true);
  document.addEventListener(pointerUpEventName, handleRelease, true);
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  storage.releaseCleanup = () => {
    document.removeEventListener(pointerDownEventName, handlePointerDown, true);
    document.removeEventListener(pointerUpEventName, handleRelease, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', handleKeyUp, true);
  };
}

function isFormatPainterSelectionKey(event) {
  if (!event?.shiftKey) return false;
  return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key);
}

function applyStoredFormat({ chain, storage }) {
  if (!storage.storedStyle) return false;

  const shouldStayActive = storage.persistent;
  try {
    if (!storage.storedStyle.length) {
      if (!shouldStayActive) clearFormatPainterStorage(storage);
      return chain().clearFormat().run();
    }

    const storedMarks = storage.storedStyle;
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

    return result;
  } finally {
    if (!shouldStayActive) clearFormatPainterStorage(storage);
  }
}
