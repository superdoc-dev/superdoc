import { Extension } from '@core/Extension.js';
import { Plugin, PluginKey } from 'prosemirror-state';

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

  return { clientX: coords.left, clientY: coords.top, x: layoutSpaceCoords.x, y: layoutSpaceCoords.y };
}

}
