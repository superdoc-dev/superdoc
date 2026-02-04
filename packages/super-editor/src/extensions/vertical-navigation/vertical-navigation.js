import { Extension } from '@core/Extension.js';
import { Plugin, PluginKey, TextSelection, NodeSelection } from 'prosemirror-state';
import { DOM_CLASS_NAMES } from '@superdoc/painter-dom';
import { CellSelection } from 'prosemirror-tables';

export const VerticalNavigationPluginKey = new PluginKey('verticalNavigation');

/**
 * Creates the default plugin state for vertical navigation.
 * @returns {{ goalX: number | null }} State with no goal X position set.
 */
const createDefaultState = () => ({
  goalX: null,
});

/**
 * Enables vertical caret navigation in presentation mode by preserving a goal X
 * column and translating Up/Down arrow presses into layout-engine hit tests.
 * This keeps the caret aligned across wrapped lines, fragments, and pages while
 * respecting selection extension and avoiding non-text selections.
 */
export const VerticalNavigation = Extension.create({
  name: 'verticalNavigation',

  /**
   * Registers ProseMirror plugins used for vertical navigation.
   * @returns {import('prosemirror-state').Plugin[]} Plugin list, empty when disabled.
   */
  addPmPlugins() {
    if (this.editor.options?.isHeaderOrFooter) return [];
    if (this.editor.options?.isHeadless) return [];

    const editor = this.editor;
    const plugin = new Plugin({
      key: VerticalNavigationPluginKey,
      state: {
        /**
         * Initializes plugin state.
         * @returns {{ goalX: number | null }} Initial plugin state.
         */
        init: () => createDefaultState(),
        /**
         * Updates plugin state based on transaction metadata and selection changes.
         * @param {import('prosemirror-state').Transaction} tr
         * @param {{ goalX: number | null }} value
         * @returns {{ goalX: number | null }}
         */
        apply(tr, value) {
          const meta = tr.getMeta(VerticalNavigationPluginKey);
          if (meta?.type === 'vertical-move') {
            return {
              goalX: meta.goalX ?? value.goalX ?? null,
            };
          }
          if (meta?.type === 'set-goal-x') {
            return {
              ...value,
              goalX: meta.goalX ?? null,
            };
          }
          if (meta?.type === 'reset-goal-x') {
            return {
              ...value,
              goalX: null,
            };
          }
          if (tr.selectionSet) {
            return {
              ...value,
              goalX: null,
            };
          }
          return value;
        },
      },
      props: {
        /**
         * Handles vertical navigation key presses while presenting.
         * @param {import('prosemirror-view').EditorView} view
         * @param {KeyboardEvent} event
         * @returns {boolean} Whether the event was handled.
         */
        handleKeyDown(view, event) {
          // Guard clauses
          if (view.composing || !editor.isEditable) return false;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          }
          if (event.key === 'PageUp' || event.key === 'PageDown') {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          }
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;

          if (!isPresenting(editor)) {
            return false;
          }

          // Basic logic:
          // 1. On first vertical move, record goal X from current caret position (in layout space coordinates).
          // 2. Find adjacent line element in the desired direction.
          // 3. Perform hit test at (goal X, adjacent line center Y) to find target position.
          // 4. Move selection to target position, extending if Shift is held.

          // 1. Get or set goal X
          const pluginState = VerticalNavigationPluginKey.getState(view.state);
          let goalX = pluginState?.goalX;
          const coords = getCurrentCoords(editor, view.state.selection);
          if (!coords) return false;
          if (goalX == null) {
            goalX = coords?.x;
            if (!Number.isFinite(goalX)) return false;
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'set-goal-x', goalX }));
          }

          // 2. Find adjacent line
          const adjacent = getAdjacentLineClientTarget(editor, coords, event.key === 'ArrowUp' ? -1 : 1);
          if (!adjacent) return false;

          // 3. Hit test at (goal X, adjacent line center Y)
          const hit = getHitFromLayoutCoords(editor, goalX, adjacent.clientY, coords, adjacent.pageIndex);
          if (!hit || !Number.isFinite(hit.pos)) return false;

          // 4. Move selection
          const selection = buildSelection(view.state, hit.pos, event.shiftKey);
          if (!selection) return false;
          view.dispatch(
            view.state.tr
              .setMeta(VerticalNavigationPluginKey, { type: 'vertical-move', goalX })
              .setSelection(selection),
          );
          return true;
        },
        handleDOMEvents: {
          /**
           * Resets goal X on pointer-driven selection changes.
           * @param {import('prosemirror-view').EditorView} view
           * @returns {boolean}
           */
          mousedown: (view) => {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          },
          /**
           * Resets goal X on touch-driven selection changes.
           * @param {import('prosemirror-view').EditorView} view
           * @returns {boolean}
           */
          touchstart: (view) => {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          },
          /**
           * Resets goal X when IME composition starts.
           * @param {import('prosemirror-view').EditorView} view
           * @returns {boolean}
           */
          compositionstart: (view) => {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          },
        },
      },
    });

    return [plugin];
  },
});

/**
 * Determines whether the editor is the active presentation editor.
 * @param {Object} editor
 * @returns {boolean}
 */
function isPresenting(editor) {
  const presentationCtx = editor?.presentationEditor;
  if (!presentationCtx) return false;
  const activeEditor = presentationCtx.getActiveEditor?.();
  return activeEditor === editor;
}

/**
 * Gets the current caret coordinates in both layout and client space.
 * @param {Object} editor
 * @param {import('prosemirror-state').Selection} selection
 * @returns {{ clientX: number, clientY: number, height: number, x: number, y: number } | null}
 */
function getCurrentCoords(editor, selection) {
  const presentationEditor = editor.presentationEditor;
  const layoutSpaceCoords = presentationEditor.computeCaretLayoutRect(selection.head);
  if (!layoutSpaceCoords) return null;
  const clientCoords = presentationEditor.denormalizeClientPoint(
    layoutSpaceCoords.x,
    layoutSpaceCoords.y,
    layoutSpaceCoords.pageIndex,
    layoutSpaceCoords.height,
  );
  return {
    clientX: clientCoords.x,
    clientY: clientCoords.y,
    height: clientCoords.height,
    x: layoutSpaceCoords.x,
    y: layoutSpaceCoords.y,
  };
}

/**
 * Finds the adjacent line center Y in client space and associated page index.
 * @param {Object} editor
 * @param {{ clientX: number, clientY: number, height: number }} coords
 * @param {number} direction -1 for up, 1 for down.
 * @returns {{ clientY: number, pageIndex?: number } | null}
 */
function getAdjacentLineClientTarget(editor, coords, direction) {
  const presentationEditor = editor.presentationEditor;
  const doc = presentationEditor.visibleHost?.ownerDocument ?? document;
  const caretX = coords.clientX;
  const caretY = coords.clientY + coords.height / 2;
  const currentLine = findLineElementAtPoint(doc, caretX, caretY);
  if (!currentLine) return null;
  const adjacentLine = findAdjacentLineElement(currentLine, direction);
  if (!adjacentLine) return null;
  const pageEl = adjacentLine.closest?.(`.${DOM_CLASS_NAMES.PAGE}`);
  const pageIndex = pageEl ? Number(pageEl.dataset.pageIndex ?? 'NaN') : null;
  const rect = adjacentLine.getBoundingClientRect();
  const clientY = rect.top + rect.height / 2;
  if (!Number.isFinite(clientY)) return null;
  return {
    clientY,
    pageIndex: Number.isFinite(pageIndex) ? pageIndex : undefined,
  };
}

/**
 * Converts layout coords to client coords and performs a hit test.
 * @param {Object} editor
 * @param {number} goalX
 * @param {number} clientY
 * @param {{ y: number }} coords
 * @param {number | undefined} pageIndex
 * @returns {{ pos: number } | null}
 */
function getHitFromLayoutCoords(editor, goalX, clientY, coords, pageIndex) {
  const presentationEditor = editor.presentationEditor;
  const clientPoint = presentationEditor.denormalizeClientPoint(goalX, coords.y, pageIndex);
  const clientX = clientPoint?.x;
  if (!Number.isFinite(clientX)) return null;
  return presentationEditor.hitTest(clientX, clientY);
}

/**
 * Builds a text selection for the target position, optionally extending.
 * @param {import('prosemirror-state').EditorState} state
 * @param {number} pos
 * @param {boolean} extend
 * @returns {import('prosemirror-state').Selection | null}
 */
function buildSelection(state, pos, extend) {
  const { doc, selection } = state;
  if (selection instanceof NodeSelection || selection instanceof CellSelection) {
    return null;
  }
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  if (extend) {
    const anchor = selection.anchor ?? selection.from;
    return TextSelection.create(doc, anchor, clamped);
  }
  return TextSelection.create(doc, clamped);
}

/**
 * Finds a line element at the given client point.
 * @param {Document} doc
 * @param {number} x
 * @param {number} y
 * @returns {Element | null}
 */
function findLineElementAtPoint(doc, x, y) {
  if (typeof doc?.elementsFromPoint !== 'function') return null;
  const chain = doc.elementsFromPoint(x, y) ?? [];
  for (const el of chain) {
    if (el?.classList?.contains?.(DOM_CLASS_NAMES.LINE)) return el;
  }
  return null;
}

/**
 * Locates the next or previous line element across fragments/pages.
 * @param {Element} currentLine
 * @param {number} direction -1 for up, 1 for down.
 * @returns {Element | null}
 */
function findAdjacentLineElement(currentLine, direction) {
  const lineClass = DOM_CLASS_NAMES.LINE;
  const fragmentClass = DOM_CLASS_NAMES.FRAGMENT;
  const pageClass = DOM_CLASS_NAMES.PAGE;
  const headerClass = 'superdoc-page-header';
  const footerClass = 'superdoc-page-footer';
  const fragment = currentLine.closest?.(`.${fragmentClass}`);
  const page = currentLine.closest?.(`.${pageClass}`);
  if (!fragment || !page) return null;

  const lineEls = Array.from(fragment.querySelectorAll(`.${lineClass}`));
  const index = lineEls.indexOf(currentLine);
  if (index !== -1) {
    const nextInFragment = lineEls[index + direction];
    if (nextInFragment) return nextInFragment;
  }

  const fragments = Array.from(page.querySelectorAll(`.${fragmentClass}`)).filter((frag) => {
    const parent = frag.closest?.(`.${headerClass}, .${footerClass}`);
    return !parent;
  });
  const fragmentIndex = fragments.indexOf(fragment);
  if (fragmentIndex !== -1) {
    const nextFragment = fragments[fragmentIndex + direction];
    const fallbackLine = getEdgeLineFromFragment(nextFragment, direction);
    if (fallbackLine) return fallbackLine;
  }

  const pages = Array.from(page.parentElement?.querySelectorAll?.(`.${pageClass}`) ?? []);
  const pageIndex = pages.indexOf(page);
  if (pageIndex === -1) return null;
  const nextPage = pages[pageIndex + direction];
  if (!nextPage) return null;
  const pageFragments = Array.from(nextPage.querySelectorAll(`.${fragmentClass}`)).filter((frag) => {
    const parent = frag.closest?.(`.${headerClass}, .${footerClass}`);
    return !parent;
  });
  if (direction > 0) {
    return getEdgeLineFromFragment(pageFragments[0], direction);
  }
  return getEdgeLineFromFragment(pageFragments[pageFragments.length - 1], direction);
}

/**
 * Returns the first or last line in a fragment, depending on direction.
 * @param {Element | null | undefined} fragment
 * @param {number} direction
 * @returns {Element | null}
 */
function getEdgeLineFromFragment(fragment, direction) {
  if (!fragment) return null;
  const lineEls = Array.from(fragment.querySelectorAll(`.${DOM_CLASS_NAMES.LINE}`));
  if (lineEls.length === 0) return null;
  return direction > 0 ? lineEls[0] : lineEls[lineEls.length - 1];
}
