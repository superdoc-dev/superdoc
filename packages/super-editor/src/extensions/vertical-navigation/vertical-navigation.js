import { Extension } from '@core/Extension.js';
import { Plugin, PluginKey } from 'prosemirror-state';
import { DOM_CLASS_NAMES } from '@superdoc/painter-dom';

export const VerticalNavigationPluginKey = new PluginKey('verticalNavigation');

const createDefaultState = () => ({
  goalX: null,
  isHandlingVerticalMove: false,
});

export const VerticalNavigation = Extension.create({
  name: 'verticalNavigation',

  addPmPlugins() {
    if (this.editor.options?.isHeaderOrFooter) return [];
    if (this.editor.options?.isHeadless) return [];

    const editor = this.editor;
    const plugin = new Plugin({
      key: VerticalNavigationPluginKey,
      state: {
        init: () => createDefaultState(),
        apply(tr, value) {
          const meta = tr.getMeta(VerticalNavigationPluginKey);
          if (meta?.type === 'vertical-move') {
            return {
              goalX: meta.goalX ?? value.goalX ?? null,
              isHandlingVerticalMove: false,
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
        handleKeyDown(view, event) {
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

          const pluginState = VerticalNavigationPluginKey.getState(view.state);
          let goalX = pluginState?.goalX;
          const coords = getCurrentCoords(editor, view.state.selection.head);
          if (goalX == null) {
            goalX = coords?.x;
            if (!Number.isFinite(goalX)) return false;
            view.dispatch(
              view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'set-goal-x', goalX }),
            );
          }
          const newY = getAdjacentLineClientY(editor, coords, event.key === 'ArrowUp' ? -1 : 1);
          if (!Number.isFinite(newY)) return false;
          return false;
        },
        handleDOMEvents: {
          mousedown: (view) => {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          },
          touchstart: (view) => {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          },
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

function isPresenting(editor) {
  const presentationCtx = editor?.presentationEditor;
  if (!presentationCtx) return false;
  const activeEditor = presentationCtx.getActiveEditor?.();
  return activeEditor === editor;
}

function getCurrentCoords(editor, pos) {
  const presentationEditor = editor.presentationEditor;
  const coords = presentationEditor.coordsAtPos(pos);
  if (!coords) return null;

  const layoutSpaceCoords = presentationEditor.normalizeClientPoint(coords.left, coords.top);
  if (!layoutSpaceCoords) return null;

  return {
    clientX: coords.left,
    clientY: coords.top,
    height: coords.height,
    x: layoutSpaceCoords.x,
    y: layoutSpaceCoords.y,
  };
}

function getAdjacentLineClientY(editor, coords, direction) {
  const presentationEditor = editor.presentationEditor;
  const doc = presentationEditor.visibleHost?.ownerDocument ?? document;
  const caretX = coords.clientX;
  const caretY = coords.clientY + coords.height / 2;
  const currentLine = findLineElementAtPoint(doc, caretX, caretY);
  if (!currentLine) return null;
  const adjacentLine = findAdjacentLineElement(currentLine, direction);
  if (!adjacentLine) return null;
  const rect = adjacentLine.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function findLineElementAtPoint(doc, x, y) {
  if (typeof doc?.elementsFromPoint !== 'function') return null;
  const chain = doc.elementsFromPoint(x, y) ?? [];
  for (const el of chain) {
    if (el?.classList?.contains?.(DOM_CLASS_NAMES.LINE)) return el;
  }
  return null;
}

function findAdjacentLineElement(currentLine, direction) {
  const lineClass = DOM_CLASS_NAMES.LINE;
  const fragmentClass = DOM_CLASS_NAMES.FRAGMENT;
  const pageClass = DOM_CLASS_NAMES.PAGE;
  const fragment = currentLine.closest?.(`.${fragmentClass}`);
  const page = currentLine.closest?.(`.${pageClass}`);
  if (!fragment || !page) return null;

  const lineEls = Array.from(fragment.querySelectorAll(`.${lineClass}`));
  const index = lineEls.indexOf(currentLine);
  if (index !== -1) {
    const nextInFragment = lineEls[index + direction];
    if (nextInFragment) return nextInFragment;
  }

  const fragments = Array.from(page.querySelectorAll(`.${fragmentClass}`));
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
  const pageFragments = Array.from(nextPage.querySelectorAll(`.${fragmentClass}`));
  if (direction > 0) {
    return getEdgeLineFromFragment(pageFragments[0], direction);
  }
  return getEdgeLineFromFragment(pageFragments[pageFragments.length - 1], direction);
}

function getEdgeLineFromFragment(fragment, direction) {
  if (!fragment) return null;
  const lineEls = Array.from(fragment.querySelectorAll(`.${DOM_CLASS_NAMES.LINE}`));
  if (lineEls.length === 0) return null;
  return direction > 0 ? lineEls[0] : lineEls[lineEls.length - 1];
}
