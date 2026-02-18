import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';

import { Extension } from '@core/Extension.js';
import { CustomSelection, CustomSelectionPluginKey } from './custom-selection.js';
import { shouldAllowNativeContextMenu } from '../../utils/contextmenu-helpers.js';

describe('shouldAllowNativeContextMenu', () => {
  it('returns false for standard right click', () => {
    const event = {
      type: 'contextmenu',
      ctrlKey: false,
      metaKey: false,
      detail: 1,
      button: 2,
      clientX: 120,
      clientY: 140,
    };

    expect(shouldAllowNativeContextMenu(event)).toBe(false);
  });

  it('returns true when modifier key is pressed', () => {
    const event = {
      type: 'contextmenu',
      ctrlKey: true,
      metaKey: false,
      detail: 1,
      button: 2,
      clientX: 120,
      clientY: 140,
    };

    expect(shouldAllowNativeContextMenu(event)).toBe(true);
  });

  it('returns true for keyboard invocation', () => {
    const event = {
      type: 'contextmenu',
      ctrlKey: false,
      metaKey: false,
      detail: 0,
      button: 0,
      clientX: 0,
      clientY: 0,
    };

    expect(shouldAllowNativeContextMenu(event)).toBe(true);
  });
});

const createEnvironment = () => {
  const nodes = {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
    text: { group: 'inline' },
  };

  const schema = new Schema({ nodes, marks: {} });
  const paragraph = schema.node('paragraph', null, [schema.text('Hello world')]);
  const doc = schema.node('doc', null, [paragraph]);
  const selection = TextSelection.create(doc, 1, 6);

  const element = document.createElement('div');
  document.body.appendChild(element);

  const editor = {
    schema,
    options: {
      element,
      focusTarget: null,
      lastSelection: null,
    },
    setOptions(updates) {
      Object.assign(this.options, updates);
    },
    emit: vi.fn(),
  };

  const extension = Extension.create(CustomSelection.config);
  extension.addPmPlugins = CustomSelection.config.addPmPlugins.bind(extension);
  extension.addCommands = CustomSelection.config.addCommands.bind(extension);
  extension.editor = editor;
  const plugin = extension.addPmPlugins()[0];

  let state = EditorState.create({ schema, doc, selection, plugins: [plugin] });

  const view = {
    state,
    dispatch: vi.fn((tr) => {
      state = state.apply(tr);
      view.state = state;
    }),
    focus: vi.fn(),
  };

  Object.defineProperty(editor, 'state', {
    get() {
      return view.state;
    },
  });
  editor.view = view;

  return { editor, plugin, view, schema };
};

describe('CustomSelection plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('preserves selection on context menu interactions', () => {
    const { plugin, view } = createEnvironment();

    const event = {
      preventDefault: vi.fn(),
      detail: 0,
      button: 2,
      clientX: 120,
      clientY: 140,
      type: 'contextmenu',
    };
    const handled = plugin.props.handleDOMEvents.contextmenu(view, event);

    expect(handled).toBe(false);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(view.dispatch).toHaveBeenCalled();

    const dispatchedTr = view.dispatch.mock.calls[0][0];
    expect(dispatchedTr.getMeta(CustomSelectionPluginKey)).toMatchObject({
      focused: true,
      showVisualSelection: true,
    });

    vi.runAllTimers();
    expect(view.focus).toHaveBeenCalled();
  });

  it('retains preserved selection after focus triggered by context menu refocus', () => {
    const { plugin, view } = createEnvironment();

    const contextEvent = {
      preventDefault: vi.fn(),
      detail: 0,
      button: 2,
      clientX: 120,
      clientY: 140,
      type: 'contextmenu',
    };

    plugin.props.handleDOMEvents.contextmenu(view, contextEvent);
    view.dispatch.mockClear();

    plugin.props.handleDOMEvents.focus(view);

    expect(view.dispatch).toHaveBeenCalledTimes(1);
    const dispatchedTr = view.dispatch.mock.calls[0][0];
    expect(dispatchedTr.getMeta(CustomSelectionPluginKey)).toMatchObject({
      skipFocusReset: false,
    });

    const focusState = CustomSelectionPluginKey.getState(view.state);
    expect(focusState.showVisualSelection).toBe(true);
    expect(focusState.preservedSelection).not.toBeNull();
  });

  it('ignores blur clearing when selection preserved for context menu', () => {
    const { plugin, view } = createEnvironment();

    const contextEvent = {
      preventDefault: vi.fn(),
      detail: 0,
      button: 2,
      clientX: 120,
      clientY: 140,
      type: 'contextmenu',
    };

    plugin.props.handleDOMEvents.contextmenu(view, contextEvent);
    view.dispatch.mockClear();

    const handled = plugin.props.handleDOMEvents.blur(view);

    expect(handled).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();

    const focusState = CustomSelectionPluginKey.getState(view.state);
    expect(focusState.showVisualSelection).toBe(true);
    expect(focusState.preservedSelection).not.toBeNull();
  });

  it('allows native context menu when modifier pressed', () => {
    const { plugin, view } = createEnvironment();

    const contextEvent = {
      preventDefault: vi.fn(),
      ctrlKey: true,
      detail: 0,
      button: 2,
      clientX: 160,
      clientY: 180,
      type: 'contextmenu',
    };

    const handled = plugin.props.handleDOMEvents.contextmenu(view, contextEvent);

    expect(handled).toBe(false);
    expect(contextEvent.preventDefault).not.toHaveBeenCalled();
    expect(view.dispatch).not.toHaveBeenCalled();

    const mouseDownEvent = {
      button: 2,
      ctrlKey: true,
      preventDefault: vi.fn(),
      clientX: 160,
      clientY: 180,
      type: 'mousedown',
    };

    const mouseHandled = plugin.props.handleDOMEvents.mousedown(view, mouseDownEvent);

    expect(mouseHandled).toBe(false);
    expect(mouseDownEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('allows native context menu for keyboard invocation', () => {
    const { plugin, view } = createEnvironment();

    const keyboardEvent = {
      preventDefault: vi.fn(),
      detail: 0,
      button: 0,
      clientX: 0,
      clientY: 0,
      type: 'contextmenu',
    };

    const handled = plugin.props.handleDOMEvents.contextmenu(view, keyboardEvent);

    expect(handled).toBe(false);
    expect(keyboardEvent.preventDefault).not.toHaveBeenCalled();
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('returns decorations for preserved selections', () => {
    const { plugin, view } = createEnvironment();

    // Simulate stored selection via metadata
    const tr = view.state.tr.setMeta(CustomSelectionPluginKey, {
      focused: true,
      preservedSelection: view.state.selection,
      showVisualSelection: true,
    });
    view.dispatch(tr);

    const decorations = plugin.props.decorations(view.state);
    expect(decorations).toBeInstanceOf(DecorationSet);
    const [firstDeco] = decorations.find();
    expect(firstDeco?.from).toBe(1);
    expect(firstDeco?.to).toBe(6);
  });

  it('does not call preventDefault on right-click mousedown to preserve Firefox selection', () => {
    const { plugin, view, editor } = createEnvironment();

    const mouseDownEvent = {
      button: 2,
      preventDefault: vi.fn(),
      target: editor.options.element,
      type: 'mousedown',
    };

    plugin.props.handleDOMEvents.mousedown(view, mouseDownEvent);

    // preventDefault should NOT be called for right-click mousedown
    // because Firefox clears native selection when preventDefault is called
    expect(mouseDownEvent.preventDefault).not.toHaveBeenCalled();

    // But selection should still be preserved in plugin state
    expect(view.dispatch).toHaveBeenCalled();
    const dispatchedTr = view.dispatch.mock.calls[0][0];
    expect(dispatchedTr.getMeta(CustomSelectionPluginKey)).toMatchObject({
      focused: true,
      preservedSelection: expect.any(Object),
      showVisualSelection: true,
    });
  });

  it('keeps selection visible when toolbar elements retain focus', () => {
    const { plugin, view, editor } = createEnvironment();

    const tr = view.state.tr.setMeta(CustomSelectionPluginKey, {
      focused: true,
      preservedSelection: view.state.selection,
      showVisualSelection: true,
    });
    view.dispatch(tr);

    const toolbarInput = document.createElement('input');
    toolbarInput.classList.add('button-text-input');
    editor.options.focusTarget = toolbarInput;

    view.dispatch.mockClear();
    plugin.props.handleDOMEvents.blur(view);

    expect(view.dispatch).toHaveBeenCalled();
    const dispatchedTr = view.dispatch.mock.calls[0][0];
    expect(dispatchedTr.getMeta(CustomSelectionPluginKey)).toMatchObject({
      focused: true,
      showVisualSelection: true,
    });
  });
});
