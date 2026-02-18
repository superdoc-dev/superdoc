// @ts-nocheck
/* global Element */
import { Extension } from '@core/Extension.js';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { shouldAllowNativeContextMenu } from '../../utils/contextmenu-helpers.js';

const DEFAULT_SELECTION_STATE = Object.freeze({
  focused: false,
  preservedSelection: null,
  showVisualSelection: false,
  skipFocusReset: false,
});

const normalizeSelectionState = (state = {}) => ({
  ...DEFAULT_SELECTION_STATE,
  ...state,
});

/**
 * Selection state
 * @typedef {Object} SelectionState
 * @property {boolean} focused - Whether editor is focused
 * @property {Object|null} preservedSelection - Stored selection
 * @property {boolean} showVisualSelection - Whether to show selection decoration
 * @property {boolean} skipFocusReset - Whether to skip clearing selection on next focus
 */

/**
 * Configuration options for CustomSelection
 * @typedef {Object} CustomSelectionOptions
 * @category Options
 * @example
 * // CustomSelection works automatically
 * new SuperDoc({
 *   selector: '#editor',
 *   document: 'document.docx'
 *   // Selection handling is built-in
 * });
 */

/**
 * Plugin key for custom selection management
 * @private
 */
export const CustomSelectionPluginKey = new PluginKey('CustomSelection');

/**
 * Handle clicks outside the editor
 * @private
 * @param {MouseEvent} event - Mouse event
 * @param {Object} editor - Editor instance
 */
const handleClickOutside = (event, editor) => {
  const editorElem = editor?.options?.element;
  if (!editorElem) return;

  const isInsideEditor = editorElem?.contains(event.target);

  if (!isInsideEditor) {
    editor.setOptions({
      focusTarget: event.target,
    });
  } else {
    editor.setOptions({
      focusTarget: null,
    });
  }
};

/**
 * Get focus metadata from transaction
 * @private
 * @param {Object} tr - Transaction
 * @returns {Object|undefined} Focus metadata
 */
function getFocusMeta(tr) {
  return tr.getMeta(CustomSelectionPluginKey);
}

/**
 * Set focus metadata on transaction
 * @private
 * @param {Object} tr - Transaction
 * @param {SelectionState} value - State to set
 * @returns {Object} Transaction with metadata
 */
function setFocusMeta(tr, value) {
  return tr.setMeta(CustomSelectionPluginKey, value);
}

/**
 * Get focus state from editor state
 * @private
 * @param {Object} state - Editor state
 * @returns {SelectionState} Current focus state
 */
function getFocusState(state) {
  return CustomSelectionPluginKey.getState(state);
}

/**
 * Check if target is a toolbar input
 * @private
 * @param {Element} target - DOM element
 * @returns {boolean} True if toolbar input
 */
const isToolbarInput = (target) => {
  return !!target?.closest('.button-text-input') || target?.classList?.contains('button-text-input');
};

/**
 * Check if target is a toolbar button
 * @private
 * @param {Element} target - DOM element
 * @returns {boolean} True if toolbar button
 */
const isToolbarButton = (target) => {
  return !!target?.closest('.toolbar-button') || target?.classList?.contains('toolbar-button');
};

/**
 * @module CustomSelection
 * @sidebarTitle Custom Selection
 * @snippetPath /snippets/extensions/custom-selection.mdx
 */
export const CustomSelection = Extension.create({
  name: 'customSelection',

  addPmPlugins() {
    const editor = this.editor;
    const customSelectionPlugin = new Plugin({
      key: CustomSelectionPluginKey,
      state: {
        init: () => ({ ...DEFAULT_SELECTION_STATE }),
        apply: (tr, value) => {
          const meta = getFocusMeta(tr);
          if (meta !== undefined) {
            return { ...value, ...meta };
          }
          return value;
        },
      },
      view: () => {
        const clickHandler = (event) => handleClickOutside(event, editor);
        document?.addEventListener('mousedown', clickHandler);

        return {
          destroy: () => {
            document?.removeEventListener('mousedown', clickHandler);
          },
        };
      },
      props: {
        handleDOMEvents: {
          contextmenu: (view, event) => {
            if (shouldAllowNativeContextMenu(event)) {
              return false;
            }

            // Prevent context menu from removing focus/selection
            event.preventDefault();
            const { selection } = view.state;
            if (!selection.empty) {
              view.dispatch(
                setFocusMeta(view.state.tr, {
                  focused: true,
                  preservedSelection: selection,
                  showVisualSelection: true,
                  skipFocusReset: true,
                }),
              );
            }

            // Re-focus the editor to maintain selection visibility
            setTimeout(() => {
              view.focus();
            }, 0);

            return false;
          },

          mousedown: (view, event) => {
            // Handle right clicks - prevent focus loss
            if (event.button === 2) {
              if (shouldAllowNativeContextMenu(event)) {
                return false;
              }

              // Note: Do NOT call event.preventDefault() here.
              // Firefox clears native selection when preventDefault is called on mousedown.
              // The contextmenu handler already prevents the native menu.
              const { selection } = view.state;
              if (!selection.empty) {
                // Ensure selection stays visible for right-click/context menu
                view.dispatch(
                  setFocusMeta(view.state.tr, {
                    focused: true,
                    preservedSelection: selection,
                    showVisualSelection: true,
                    skipFocusReset: true,
                  }),
                );

                // Store selection in editor options too
                this.editor.setOptions({
                  lastSelection: selection,
                  preservedSelection: selection,
                });
              }
              return false;
            }

            const { selection } = view.state;
            const target = event.target;
            const isElement = target instanceof Element;
            const isToolbarBtn = isElement && isToolbarButton(target);
            const isToolbarInp = isElement && isToolbarInput(target);

            // Store focus target for other components
            this.editor.setOptions({
              focusTarget: target,
            });

            // Handle toolbar input clicks - preserve selection
            if (isToolbarInp && !selection.empty) {
              // Store the selection and show visual selection
              view.dispatch(
                setFocusMeta(view.state.tr, {
                  focused: true,
                  preservedSelection: selection,
                  showVisualSelection: true,
                  skipFocusReset: false,
                }),
              );

              // Store in editor options as well for commands
              this.editor.setOptions({
                lastSelection: selection,
                preservedSelection: selection,
              });
              return false; // Don't prevent the input from getting focus
            }

            // Handle toolbar button clicks
            if (isToolbarBtn && !isToolbarInp) {
              if (!selection.empty) {
                this.editor.setOptions({
                  lastSelection: selection,
                });
                // Keep selection visible for toolbar buttons
                view.dispatch(
                  setFocusMeta(view.state.tr, {
                    focused: true,
                    preservedSelection: selection,
                    showVisualSelection: true,
                    skipFocusReset: false,
                  }),
                );
              }
              return false;
            }

            // Handle clicks outside toolbar
            if (!isToolbarBtn && !isToolbarInp) {
              // Clear preserved selection and visual selection
              view.dispatch(
                setFocusMeta(view.state.tr, {
                  focused: false,
                  preservedSelection: null,
                  showVisualSelection: false,
                  skipFocusReset: false,
                }),
              );

              // Clear selection if clicking outside editor
              if (!selection.empty && !this.editor.options.element?.contains(target)) {
                this.editor.setOptions({
                  lastSelection: selection,
                });
                const clearSelectionTr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 0));
                view.dispatch(clearSelectionTr);
              }
            }
          },

          focus: (view) => {
            const target = this.editor.options.focusTarget;
            const isElement = target instanceof Element;
            const isToolbarBtn = isElement && isToolbarButton(target);
            const isToolbarInp = isElement && isToolbarInput(target);
            const focusState = getFocusState(view.state);

            if (focusState?.skipFocusReset) {
              view.dispatch(
                setFocusMeta(view.state.tr, normalizeSelectionState({ ...focusState, skipFocusReset: false })),
              );
              return false;
            }

            // Don't change state if toolbar element caused the focus
            if (!isToolbarBtn && !isToolbarInp) {
              view.dispatch(
                setFocusMeta(view.state.tr, {
                  focused: false,
                  preservedSelection: null,
                  showVisualSelection: false,
                  skipFocusReset: false,
                }),
              );
            }
          },

          blur: (view) => {
            const target = this.editor.options.focusTarget;
            const isElement = target instanceof Element;
            const isToolbarBtn = isElement && isToolbarButton(target);
            const isToolbarInp = isElement && isToolbarInput(target);
            const state = getFocusState(view.state);

            if (state?.skipFocusReset) {
              return false;
            }

            if (isToolbarBtn || isToolbarInp) {
              // Maintain visual selection when toolbar elements are focused
              view.dispatch(
                setFocusMeta(view.state.tr, {
                  focused: true,
                  preservedSelection: state.preservedSelection || view.state.selection,
                  showVisualSelection: true,
                  skipFocusReset: false,
                }),
              );
            } else {
              // Clear everything when focus goes elsewhere
              view.dispatch(
                setFocusMeta(view.state.tr, {
                  focused: false,
                  preservedSelection: null,
                  showVisualSelection: false,
                  skipFocusReset: false,
                }),
              );
            }
          },
        },
        decorations: (state) => {
          const { selection, doc } = state;
          const focusState = getFocusState(state);

          // Show visual selection if we have a preserved selection or current selection with focus
          const shouldShowSelection =
            focusState.showVisualSelection &&
            (focusState.preservedSelection || (!selection.empty && focusState.focused));

          if (!shouldShowSelection) {
            return null;
          }

          // Use preserved selection if available, otherwise current selection
          const targetSelection = focusState.preservedSelection || selection;

          if (targetSelection.empty) {
            return null;
          }

          return DecorationSet.create(doc, [
            Decoration.inline(targetSelection.from, targetSelection.to, {
              class: 'sd-custom-selection',
            }),
          ]);
        },
      },
    });

    return [customSelectionPlugin];
  },

  addCommands() {
    return {
      /**
       * Restore the preserved selection
       * @category Command
       * @returns {Function} Command function
       * @example
       * // Restore selection after toolbar interaction
       * editor.commands.restorePreservedSelection()
       * @note Used internally to maintain selection when interacting with toolbar
       */
      restorePreservedSelection:
        () =>
        ({ tr, state }) => {
          const focusState = getFocusState(state);
          if (focusState.preservedSelection) {
            return tr.setSelection(focusState.preservedSelection);
          }

          const lastSelection = this.editor.options.lastSelection;
          if (lastSelection) {
            return tr.setSelection(lastSelection);
          }
          return tr;
        },
    };
  },
});
