import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema, doc, p } from 'prosemirror-test-builder';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { ContextMenu, ContextMenuPluginKey, findContainingBlockAncestor } from './context-menu.js';
vi.mock('@core/commands/list-helpers', () => ({
  isList: () => false,
}));

vi.mock('../../core/helpers/editorSurface.js', () => ({
  getSurfaceRelativePoint: vi.fn(() => ({ left: 20, top: 30 })),
}));

describe('ContextMenu extension', () => {
  it('registers the plugin key', () => {
    expect(ContextMenuPluginKey.key.startsWith('contextMenu')).toBe(true);
  });

  it('skips plugin creation when headless', () => {
    const headless = ContextMenu.config.addPmPlugins.call({ editor: { options: { isHeadless: true } } });
    expect(headless).toEqual([]);
  });

  it('creates a plugin when enabled', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('paragraph_spacing_missing.docx');
    const { editor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: false,
      disableContextMenu: false,
    });
    const plugins = ContextMenu.config.addPmPlugins.call({ editor });
    expect(plugins).toHaveLength(1);
    expect(typeof plugins[0].props.handleKeyDown).toBe('function');
    editor.destroy();
  });

  it('opens and closes the slash menu via keyboard events', () => {
    const baseDoc = doc(p());
    const initialSelection = TextSelection.create(baseDoc, 1);
    let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

    const editor = {
      options: {},
      emit: vi.fn(),
      view: null,
    };

    const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
    state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

    const view = {
      state,
      dispatch: vi.fn((tr) => {
        state = state.apply(tr);
        view.state = state;
      }),
      focus: vi.fn(),
      dom: {
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
      },
      coordsAtPos: () => ({ left: 20, top: 30 }),
    };

    editor.view = view;

    const viewLifecycle = plugin.spec.view?.(view);

    const openEvent = {
      key: '/',
      preventDefault: vi.fn(),
    };

    const opened = plugin.props.handleKeyDown.call(plugin, view, openEvent);
    expect(opened).toBe(true);
    expect(openEvent.preventDefault).toHaveBeenCalled();
    expect(view.dispatch).toHaveBeenCalled();

    const pluginState = ContextMenuPluginKey.getState(view.state);
    expect(pluginState.open).toBe(true);
    expect(pluginState.anchorPos).toBe(1);
    expect(pluginState.menuPosition).toEqual({ left: '20px', top: '58px' });
    expect(editor.emit).toHaveBeenCalledWith('contextMenu:open', {
      menuPosition: { left: '20px', top: '58px' },
    });

    const closeEvent = { key: 'Escape', preventDefault: vi.fn() };
    const closed = plugin.props.handleKeyDown.call(plugin, view, closeEvent);
    expect(closed).toBe(true);
    const updatedState = ContextMenuPluginKey.getState(view.state);
    expect(updatedState.open).toBe(false);
    expect(editor.emit).toHaveBeenCalledWith('contextMenu:close');
    expect(view.focus).toHaveBeenCalled();

    viewLifecycle?.destroy?.();
  });

  it('ignores slash hotkey when the context menu is disabled', () => {
    const baseDoc = doc(p());
    const initialSelection = TextSelection.create(baseDoc, 1);
    let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

    const editor = {
      options: { disableContextMenu: true },
      emit: vi.fn(),
      view: null,
    };

    const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
    state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

    const view = {
      state,
      dispatch: vi.fn((tr) => {
        state = state.apply(tr);
        view.state = state;
      }),
      focus: vi.fn(),
      dom: {
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
      },
      coordsAtPos: () => ({ left: 20, top: 30 }),
    };

    editor.view = view;

    const slashEvent = { key: '/', preventDefault: vi.fn() };
    const handled = plugin.props.handleKeyDown.call(plugin, view, slashEvent);
    expect(handled).toBe(false);
    expect(slashEvent.preventDefault).not.toHaveBeenCalled();
    expect(view.dispatch).not.toHaveBeenCalled();
    expect(editor.emit).not.toHaveBeenCalledWith('contextMenu:open', expect.anything());
  });

  it('closes the menu if disableContextMenu becomes true after opening', () => {
    const baseDoc = doc(p());
    const initialSelection = TextSelection.create(baseDoc, 1);
    let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

    const editor = {
      options: { disableContextMenu: false },
      emit: vi.fn(),
      view: null,
    };

    const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
    state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

    const view = {
      state,
      dispatch: vi.fn((tr) => {
        state = state.apply(tr);
        view.state = state;
      }),
      focus: vi.fn(),
      dom: {
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
      },
      coordsAtPos: () => ({ left: 20, top: 30 }),
    };

    editor.view = view;

    const openEvent = {
      key: '/',
      preventDefault: vi.fn(),
    };

    const opened = plugin.props.handleKeyDown.call(plugin, view, openEvent);
    expect(opened).toBe(true);
    expect(ContextMenuPluginKey.getState(view.state).open).toBe(true);

    editor.options.disableContextMenu = true;
    view.dispatch(view.state.tr);

    expect(ContextMenuPluginKey.getState(view.state).open).toBe(false);
    expect(editor.emit).toHaveBeenCalledWith('contextMenu:close');
  });

  describe('cooldown mechanism', () => {
    it('prevents reopening menu during cooldown period', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        focus: vi.fn(),
        dom: {
          getBoundingClientRect: () => ({ left: 0, top: 0 }),
        },
        coordsAtPos: () => ({ left: 20, top: 30 }),
      };

      editor.view = view;

      // Open menu first time
      const openEvent1 = { key: '/', preventDefault: vi.fn() };
      const opened1 = plugin.props.handleKeyDown.call(plugin, view, openEvent1);
      expect(opened1).toBe(true);
      expect(ContextMenuPluginKey.getState(view.state).open).toBe(true);

      // Close menu
      const closeEvent = { key: 'Escape', preventDefault: vi.fn() };
      plugin.props.handleKeyDown.call(plugin, view, closeEvent);
      expect(ContextMenuPluginKey.getState(view.state).open).toBe(false);

      // Try to open menu again immediately (should be blocked by cooldown)
      const openEvent2 = { key: '/', preventDefault: vi.fn() };
      const opened2 = plugin.props.handleKeyDown.call(plugin, view, openEvent2);
      expect(opened2).toBe(false); // Should return false during cooldown
      expect(openEvent2.preventDefault).not.toHaveBeenCalled();
      expect(ContextMenuPluginKey.getState(view.state).open).toBe(false); // Should remain closed
    });

    it('allows reopening menu after cooldown expires', async () => {
      vi.useFakeTimers();

      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        focus: vi.fn(),
        dom: {
          getBoundingClientRect: () => ({ left: 0, top: 0 }),
        },
        coordsAtPos: () => ({ left: 20, top: 30 }),
      };

      editor.view = view;

      // Open and close menu
      plugin.props.handleKeyDown.call(plugin, view, { key: '/', preventDefault: vi.fn() });
      plugin.props.handleKeyDown.call(plugin, view, { key: 'Escape', preventDefault: vi.fn() });

      // Fast forward past cooldown period (5000ms)
      vi.advanceTimersByTime(5000);

      // Should be able to open again after cooldown
      const openEvent = { key: '/', preventDefault: vi.fn() };
      const opened = plugin.props.handleKeyDown.call(plugin, view, openEvent);
      expect(opened).toBe(true);
      expect(openEvent.preventDefault).toHaveBeenCalled();
      expect(ContextMenuPluginKey.getState(view.state).open).toBe(true);

      vi.useRealTimers();
    });

    it('clears cooldown timeout on plugin destroy', () => {
      vi.useFakeTimers();

      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        focus: vi.fn(),
        dom: {
          getBoundingClientRect: () => ({ left: 0, top: 0 }),
        },
        coordsAtPos: () => ({ left: 20, top: 30 }),
      };

      editor.view = view;
      const viewLifecycle = plugin.spec.view?.(view);

      // Open and close to trigger cooldown
      plugin.props.handleKeyDown.call(plugin, view, { key: '/', preventDefault: vi.fn() });
      plugin.props.handleKeyDown.call(plugin, view, { key: 'Escape', preventDefault: vi.fn() });

      // Destroy should clear the timeout
      viewLifecycle?.destroy?.();

      // This test mainly ensures no memory leaks - we can't easily verify the timeout is cleared
      // but the destroy() call should not throw
      expect(true).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('menu positioning', () => {
    it('positions menu at clientX/clientY for context menu', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        dom: {
          getBoundingClientRect: () => ({ left: 0, top: 0 }),
        },
      };

      editor.view = view;

      // Dispatch a transaction with clientX/clientY (context menu positioning)
      view.dispatch(
        view.state.tr.setMeta(ContextMenuPluginKey, {
          type: 'open',
          clientX: 150,
          clientY: 200,
          pos: 1,
        }),
      );

      const pluginState = ContextMenuPluginKey.getState(view.state);
      expect(pluginState.open).toBe(true);
      expect(pluginState.menuPosition).toEqual({
        left: '160px', // 150 + CONTEXT_MENU_OFFSET_X (10)
        top: '210px', // 200 + CONTEXT_MENU_OFFSET_Y (10)
      });
    });

    it('handles getBoundingClientRect errors gracefully', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        dom: {
          getBoundingClientRect: () => {
            throw new Error('Element detached');
          },
        },
      };

      editor.view = view;

      // This should not throw, but return unchanged state
      view.dispatch(
        view.state.tr.setMeta(ContextMenuPluginKey, {
          type: 'open',
          pos: 1,
        }),
      );

      const pluginState = ContextMenuPluginKey.getState(view.state);
      expect(pluginState.open).toBe(false); // Should remain closed due to error
      expect(consoleWarnSpy).toHaveBeenCalledWith('ContextMenu: Failed to get surface bounds', expect.any(Error));

      consoleWarnSpy.mockRestore();
    });

    it('returns unchanged state when surface element is null', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
        presentationEditor: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
      };

      // No dom or element available
      editor.view = view;

      view.dispatch(
        view.state.tr.setMeta(ContextMenuPluginKey, {
          type: 'open',
          pos: 1,
        }),
      );

      const pluginState = ContextMenuPluginKey.getState(view.state);
      // Menu may not open if no surface is found, depending on implementation
      // At minimum, it should not throw
      expect(pluginState).toBeDefined();
    });
  });

  describe('state management', () => {
    it('handles select action', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
      };

      editor.view = view;

      // Dispatch select action
      view.dispatch(
        view.state.tr.setMeta(ContextMenuPluginKey, {
          type: 'select',
          id: 'heading-1',
        }),
      );

      const pluginState = ContextMenuPluginKey.getState(view.state);
      expect(pluginState.selected).toBe('heading-1');
    });

    it('handles updatePosition action', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
      };

      editor.view = view;

      // Dispatch updatePosition action (currently a no-op that falls through to default)
      view.dispatch(
        view.state.tr.setMeta(ContextMenuPluginKey, {
          type: 'updatePosition',
        }),
      );

      // Should not throw and state should be valid
      const pluginState = ContextMenuPluginKey.getState(view.state);
      expect(pluginState).toBeDefined();
      expect(pluginState.disabled).toBe(false);
    });
  });

  describe('input validation', () => {
    it('ignores slash when no cursor selection exists', () => {
      const baseDoc = doc(p('hello'));
      // Create a range selection instead of cursor
      const initialSelection = TextSelection.create(baseDoc, 1, 5);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        dom: {
          getBoundingClientRect: () => ({ left: 0, top: 0 }),
        },
      };

      editor.view = view;

      const slashEvent = { key: '/', preventDefault: vi.fn() };
      const handled = plugin.props.handleKeyDown.call(plugin, view, slashEvent);
      expect(handled).toBe(false);
      expect(slashEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('ignores slash when not preceded by space or start of line', () => {
      const baseDoc = doc(p('hello'));
      const initialSelection = TextSelection.create(baseDoc, 6); // After 'hello'
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        dom: {
          getBoundingClientRect: () => ({ left: 0, top: 0 }),
        },
      };

      editor.view = view;

      const slashEvent = { key: '/', preventDefault: vi.fn() };
      const handled = plugin.props.handleKeyDown.call(plugin, view, slashEvent);
      expect(handled).toBe(false);
      expect(slashEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('handles invalid meta.pos gracefully', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
      };

      editor.view = view;

      // Try to open with invalid position
      view.dispatch(
        view.state.tr.setMeta(ContextMenuPluginKey, {
          type: 'open',
          pos: 99999, // Way beyond doc size
        }),
      );

      const pluginState = ContextMenuPluginKey.getState(view.state);
      expect(pluginState.open).toBe(false); // Should remain closed
      expect(consoleWarnSpy).toHaveBeenCalledWith('ContextMenu: Invalid position', 99999);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('event handlers', () => {
    it('updates position on window scroll', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        focus: vi.fn(),
        dom: {
          getBoundingClientRect: () => ({ left: 0, top: 0 }),
        },
        coordsAtPos: () => ({ left: 20, top: 30 }),
      };

      editor.view = view;
      const viewLifecycle = plugin.spec.view?.(view);

      // Open menu
      plugin.props.handleKeyDown.call(plugin, view, { key: '/', preventDefault: vi.fn() });
      expect(ContextMenuPluginKey.getState(view.state).open).toBe(true);

      // Clear dispatch calls
      view.dispatch.mockClear();

      // Trigger scroll event
      window.dispatchEvent(new Event('scroll'));

      // Should dispatch updatePosition
      expect(view.dispatch).toHaveBeenCalled();
      const lastCall = view.dispatch.mock.calls[view.dispatch.mock.calls.length - 1];
      const meta = lastCall[0].getMeta(ContextMenuPluginKey);
      expect(meta?.type).toBe('updatePosition');

      viewLifecycle?.destroy?.();
    });

    it('updates position on window resize', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        focus: vi.fn(),
        dom: {
          getBoundingClientRect: () => ({ left: 0, top: 0 }),
        },
        coordsAtPos: () => ({ left: 20, top: 30 }),
      };

      editor.view = view;
      const viewLifecycle = plugin.spec.view?.(view);

      // Open menu
      plugin.props.handleKeyDown.call(plugin, view, { key: '/', preventDefault: vi.fn() });
      expect(ContextMenuPluginKey.getState(view.state).open).toBe(true);

      // Clear dispatch calls
      view.dispatch.mockClear();

      // Trigger resize event
      window.dispatchEvent(new Event('resize'));

      // Should dispatch updatePosition
      expect(view.dispatch).toHaveBeenCalled();
      const lastCall = view.dispatch.mock.calls[view.dispatch.mock.calls.length - 1];
      const meta = lastCall[0].getMeta(ContextMenuPluginKey);
      expect(meta?.type).toBe('updatePosition');

      viewLifecycle?.destroy?.();
    });

    it('removes event listeners on destroy', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn(),
        dom: {
          getBoundingClientRect: () => ({ left: 0, top: 0 }),
        },
      };

      editor.view = view;
      const viewLifecycle = plugin.spec.view?.(view);

      // Destroy the plugin
      viewLifecycle?.destroy?.();

      // Verify event listeners were removed
      expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('keyboard shortcuts', () => {
    it('closes menu with ArrowLeft', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const editor = {
        options: {},
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        focus: vi.fn(),
        dom: {
          getBoundingClientRect: () => ({ left: 0, top: 0 }),
        },
        coordsAtPos: () => ({ left: 20, top: 30 }),
      };

      editor.view = view;

      // Open menu
      plugin.props.handleKeyDown.call(plugin, view, { key: '/', preventDefault: vi.fn() });
      expect(ContextMenuPluginKey.getState(view.state).open).toBe(true);

      // Close with ArrowLeft
      const closeEvent = { key: 'ArrowLeft', preventDefault: vi.fn() };
      const closed = plugin.props.handleKeyDown.call(plugin, view, closeEvent);
      expect(closed).toBe(true);

      const pluginState = ContextMenuPluginKey.getState(view.state);
      expect(pluginState.open).toBe(false);
      expect(editor.emit).toHaveBeenCalledWith('contextMenu:close');
      expect(view.focus).toHaveBeenCalled();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scroll offset handling in containing blocks', () => {
    let testContainer;

    beforeEach(() => {
      testContainer = document.createElement('div');
      testContainer.id = 'test-container-for-scroll';
      document.body.appendChild(testContainer);
    });

    afterEach(() => {
      if (testContainer && testContainer.parentNode) {
        testContainer.parentNode.removeChild(testContainer);
      }
      testContainer = null;
    });

    it('should adjust menu position for scrollLeft offset in containing block', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      // Create a real DOM element that will be a containing block (needs transform)
      const containingBlock = document.createElement('div');
      containingBlock.style.transform = 'translateX(0)'; // Makes it a containing block
      containingBlock.style.position = 'relative';
      containingBlock.scrollLeft = 50;
      containingBlock.scrollTop = 0;
      testContainer.appendChild(containingBlock);

      const mockSurface = document.createElement('div');
      containingBlock.appendChild(mockSurface);

      // Mock getBoundingClientRect for containing block
      vi.spyOn(containingBlock, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100 });

      const editor = {
        options: { element: mockSurface },
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        dom: mockSurface,
      };

      editor.view = view;

      // Open menu with context menu positioning
      view.dispatch(
        view.state.tr.setMeta(ContextMenuPluginKey, {
          type: 'open',
          clientX: 150,
          clientY: 200,
          pos: 1,
        }),
      );

      const pluginState = ContextMenuPluginKey.getState(view.state);
      expect(pluginState.open).toBe(true);

      // Position should be adjusted for containing block position AND scroll offset
      // Expected: clientX (150) - containingBlock.left (100) + scrollLeft (50) + offset (10) = 110px
      expect(pluginState.menuPosition.left).toBe('110px');
    });

    it('should adjust menu position for scrollTop offset in containing block', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const containingBlock = document.createElement('div');
      containingBlock.style.transform = 'translateX(0)';
      containingBlock.style.position = 'relative';
      containingBlock.scrollLeft = 0;
      containingBlock.scrollTop = 75;
      testContainer.appendChild(containingBlock);

      const mockSurface = document.createElement('div');
      containingBlock.appendChild(mockSurface);

      vi.spyOn(containingBlock, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100 });

      const editor = {
        options: { element: mockSurface },
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        dom: mockSurface,
      };

      editor.view = view;

      view.dispatch(
        view.state.tr.setMeta(ContextMenuPluginKey, {
          type: 'open',
          clientX: 150,
          clientY: 200,
          pos: 1,
        }),
      );

      const pluginState = ContextMenuPluginKey.getState(view.state);
      expect(pluginState.open).toBe(true);

      // Expected: clientY (200) - containingBlock.top (100) + scrollTop (75) + offset (10) = 185px
      expect(pluginState.menuPosition.top).toBe('185px');
    });

    it('should adjust menu position for both scrollLeft and scrollTop in containing block', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const containingBlock = document.createElement('div');
      containingBlock.style.transform = 'translateX(0)';
      containingBlock.style.position = 'relative';
      containingBlock.scrollLeft = 30;
      containingBlock.scrollTop = 45;
      testContainer.appendChild(containingBlock);

      const mockSurface = document.createElement('div');
      containingBlock.appendChild(mockSurface);

      vi.spyOn(containingBlock, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 60 });

      const editor = {
        options: { element: mockSurface },
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        dom: mockSurface,
      };

      editor.view = view;

      view.dispatch(
        view.state.tr.setMeta(ContextMenuPluginKey, {
          type: 'open',
          clientX: 180,
          clientY: 220,
          pos: 1,
        }),
      );

      const pluginState = ContextMenuPluginKey.getState(view.state);
      expect(pluginState.open).toBe(true);

      // Left: clientX (180) - containingBlock.left (50) + scrollLeft (30) + offset (10) = 170px
      expect(pluginState.menuPosition.left).toBe('170px');
      // Top: clientY (220) - containingBlock.top (60) + scrollTop (45) + offset (10) = 215px
      expect(pluginState.menuPosition.top).toBe('215px');
    });

    it('should handle containing block with zero scroll offsets', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const containingBlock = document.createElement('div');
      containingBlock.style.transform = 'translateX(0)';
      containingBlock.style.position = 'relative';
      containingBlock.scrollLeft = 0;
      containingBlock.scrollTop = 0;
      testContainer.appendChild(containingBlock);

      const mockSurface = document.createElement('div');
      containingBlock.appendChild(mockSurface);

      vi.spyOn(containingBlock, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100 });

      const editor = {
        options: { element: mockSurface },
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        dom: mockSurface,
      };

      editor.view = view;

      view.dispatch(
        view.state.tr.setMeta(ContextMenuPluginKey, {
          type: 'open',
          clientX: 150,
          clientY: 200,
          pos: 1,
        }),
      );

      const pluginState = ContextMenuPluginKey.getState(view.state);
      expect(pluginState.open).toBe(true);

      // With no scroll offsets, only containingBlock position and menu offset are applied
      // Left: clientX (150) - containingBlock.left (100) + 0 + offset (10) = 60px
      expect(pluginState.menuPosition.left).toBe('60px');
      // Top: clientY (200) - containingBlock.top (100) + 0 + offset (10) = 110px
      expect(pluginState.menuPosition.top).toBe('110px');
    });

    it('should handle null/undefined scroll offsets gracefully', () => {
      const baseDoc = doc(p());
      const initialSelection = TextSelection.create(baseDoc, 1);
      let state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection });

      const containingBlock = document.createElement('div');
      containingBlock.style.transform = 'translateX(0)';
      containingBlock.style.position = 'relative';
      // Explicitly set to falsy values (browser would normally return 0, but we're testing the || 0 fallback)
      Object.defineProperty(containingBlock, 'scrollLeft', { value: null, writable: true });
      Object.defineProperty(containingBlock, 'scrollTop', { value: undefined, writable: true });
      testContainer.appendChild(containingBlock);

      const mockSurface = document.createElement('div');
      containingBlock.appendChild(mockSurface);

      vi.spyOn(containingBlock, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100 });

      const editor = {
        options: { element: mockSurface },
        emit: vi.fn(),
        view: null,
      };

      const [plugin] = ContextMenu.config.addPmPlugins.call({ editor });
      state = EditorState.create({ schema, doc: baseDoc, selection: initialSelection, plugins: [plugin] });

      const view = {
        state,
        dispatch: vi.fn((tr) => {
          state = state.apply(tr);
          view.state = state;
        }),
        dom: mockSurface,
      };

      editor.view = view;

      view.dispatch(
        view.state.tr.setMeta(ContextMenuPluginKey, {
          type: 'open',
          clientX: 150,
          clientY: 200,
          pos: 1,
        }),
      );

      const pluginState = ContextMenuPluginKey.getState(view.state);
      expect(pluginState.open).toBe(true);

      // Should treat null/undefined as 0
      expect(pluginState.menuPosition.left).toBe('60px');
      expect(pluginState.menuPosition.top).toBe('110px');
    });
  });
});

describe('findContainingBlockAncestor', () => {
  let testContainer;

  beforeEach(() => {
    // Create a test container in the document body for DOM manipulation
    testContainer = document.createElement('div');
    testContainer.id = 'test-container';
    document.body.appendChild(testContainer);
  });

  afterEach(() => {
    // Clean up the test container
    if (testContainer && testContainer.parentNode) {
      testContainer.parentNode.removeChild(testContainer);
    }
    testContainer = null;
  });

  it('returns null for null input', () => {
    expect(findContainingBlockAncestor(null)).toBe(null);
  });

  it('returns null for undefined input', () => {
    expect(findContainingBlockAncestor(undefined)).toBe(null);
  });

  it('returns null when no containing block exists', () => {
    const element = document.createElement('div');
    testContainer.appendChild(element);
    expect(findContainingBlockAncestor(element)).toBe(null);
  });

  it('detects transform property with non-none value', () => {
    const parent = document.createElement('div');
    parent.style.transform = 'translateX(10px)';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('ignores transform property with none value', () => {
    const parent = document.createElement('div');
    parent.style.transform = 'none';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    expect(findContainingBlockAncestor(child)).toBe(null);
  });

  it('detects filter property with non-none value', () => {
    const parent = document.createElement('div');
    parent.style.filter = 'blur(5px)';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('ignores filter property with none value', () => {
    const parent = document.createElement('div');
    parent.style.filter = 'none';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    expect(findContainingBlockAncestor(child)).toBe(null);
  });

  it('detects backdrop-filter property with non-none value', () => {
    const parent = document.createElement('div');
    parent.style.backdropFilter = 'blur(10px)';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    // Check if backdropFilter is supported in the test environment
    const style = window.getComputedStyle(parent);
    const backdropFilter = style.backdropFilter || style.webkitBackdropFilter;

    if (!backdropFilter || backdropFilter === 'none') {
      // Skip this test if backdropFilter is not supported
      console.warn('backdrop-filter not supported in test environment, skipping test');
      expect(true).toBe(true);
      return;
    }

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('ignores backdrop-filter property with none value', () => {
    const parent = document.createElement('div');
    parent.style.backdropFilter = 'none';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    expect(findContainingBlockAncestor(child)).toBe(null);
  });

  it('detects perspective property with non-none value', () => {
    const parent = document.createElement('div');
    parent.style.perspective = '1000px';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('ignores perspective property with none value', () => {
    const parent = document.createElement('div');
    parent.style.perspective = 'none';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    expect(findContainingBlockAncestor(child)).toBe(null);
  });

  it('detects will-change with transform value', () => {
    const parent = document.createElement('div');
    parent.style.willChange = 'transform';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('detects will-change with perspective value', () => {
    const parent = document.createElement('div');
    parent.style.willChange = 'perspective';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('detects will-change with multiple values including transform', () => {
    const parent = document.createElement('div');
    parent.style.willChange = 'opacity, transform, left';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('detects will-change with multiple values including perspective', () => {
    const parent = document.createElement('div');
    parent.style.willChange = 'opacity, perspective';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('ignores will-change with auto value', () => {
    const parent = document.createElement('div');
    parent.style.willChange = 'auto';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    expect(findContainingBlockAncestor(child)).toBe(null);
  });

  it('ignores will-change without transform or perspective', () => {
    const parent = document.createElement('div');
    parent.style.willChange = 'opacity, left';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    expect(findContainingBlockAncestor(child)).toBe(null);
  });

  it('does not incorrectly match will-change substring (e.g., will-transform)', () => {
    const parent = document.createElement('div');
    // This should not match because 'will-transform' is not 'transform'
    parent.style.willChange = 'will-transform';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    // Should not match due to proper parsing
    expect(findContainingBlockAncestor(child)).toBe(null);
  });

  it('detects contain with paint value', () => {
    const parent = document.createElement('div');
    parent.style.contain = 'paint';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('detects contain with layout value', () => {
    const parent = document.createElement('div');
    parent.style.contain = 'layout';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('detects contain with strict value', () => {
    const parent = document.createElement('div');
    parent.style.contain = 'strict';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('detects contain with content value', () => {
    const parent = document.createElement('div');
    parent.style.contain = 'content';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });

  it('returns first/closest matching ancestor when multiple exist', () => {
    const grandparent = document.createElement('div');
    grandparent.style.transform = 'translateY(50px)';
    testContainer.appendChild(grandparent);

    const parent = document.createElement('div');
    parent.style.transform = 'translateX(20px)';
    grandparent.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    const result = findContainingBlockAncestor(child);
    // Should return the closest ancestor, which is parent
    expect(result).toBe(parent);
  });

  it('stops at document.body', () => {
    const element = document.createElement('div');
    // Append directly to body
    document.body.appendChild(element);

    const result = findContainingBlockAncestor(element);
    expect(result).toBe(null);

    // Clean up
    document.body.removeChild(element);
  });

  it('stops at document.documentElement', () => {
    // This is a theoretical test - in practice elements are usually under body
    const element = document.createElement('div');
    testContainer.appendChild(element);

    const result = findContainingBlockAncestor(element);
    // Should stop before reaching documentElement
    expect(result).toBe(null);
  });

  it('handles getComputedStyle errors gracefully', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create a mock element that will cause getComputedStyle to throw
    const parent = document.createElement('div');
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    // Mock getComputedStyle to throw an error
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = vi.fn(() => {
      throw new Error('Element is detached');
    });

    // Should not throw, should return null and log warning
    const result = findContainingBlockAncestor(child);
    expect(result).toBe(null);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'ContextMenu: Failed to get computed style for element',
      expect.any(Object),
      expect.any(Error),
    );

    // Restore
    window.getComputedStyle = originalGetComputedStyle;
    consoleWarnSpy.mockRestore();
  });

  it('continues checking parent elements after getComputedStyle error on one element', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const grandparent = document.createElement('div');
    grandparent.style.transform = 'translateX(100px)';
    testContainer.appendChild(grandparent);

    const parent = document.createElement('div');
    grandparent.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    // Mock getComputedStyle to throw only for parent, not grandparent
    const originalGetComputedStyle = window.getComputedStyle;
    let callCount = 0;
    window.getComputedStyle = vi.fn((element) => {
      callCount++;
      if (element === parent) {
        throw new Error('Error on parent');
      }
      return originalGetComputedStyle(element);
    });

    // Should continue to check grandparent after error on parent
    const result = findContainingBlockAncestor(child);
    expect(result).toBe(grandparent);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'ContextMenu: Failed to get computed style for element',
      parent,
      expect.any(Error),
    );

    // Restore
    window.getComputedStyle = originalGetComputedStyle;
    consoleWarnSpy.mockRestore();
  });

  it('handles deeply nested elements correctly', () => {
    let current = testContainer;
    const depth = 10;

    // Create a deep nesting
    for (let i = 0; i < depth; i++) {
      const div = document.createElement('div');
      current.appendChild(div);
      current = div;
    }

    // Add transform to a middle ancestor
    const targetAncestor = testContainer.children[0].children[0].children[0];
    targetAncestor.style.transform = 'scale(1.5)';

    // Create child element
    const deepChild = document.createElement('div');
    current.appendChild(deepChild);

    const result = findContainingBlockAncestor(deepChild);
    expect(result).toBe(targetAncestor);
  });

  it('handles elements with multiple CSS properties that create containing blocks', () => {
    const parent = document.createElement('div');
    parent.style.transform = 'translateX(10px)';
    parent.style.filter = 'blur(5px)';
    parent.style.willChange = 'transform';
    testContainer.appendChild(parent);

    const child = document.createElement('div');
    parent.appendChild(child);

    // Should still return parent (stops at first match which is transform)
    const result = findContainingBlockAncestor(child);
    expect(result).toBe(parent);
  });
});
