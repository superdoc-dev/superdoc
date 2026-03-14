import { afterEach, describe, expect, it, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';

import { Extension } from '@core/Extension.js';
import { DOM_CLASS_NAMES } from '@superdoc/painter-dom';
import { VerticalNavigation, VerticalNavigationPluginKey } from './vertical-navigation.js';

const createSchema = () => {
  const nodes = {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
    text: { group: 'inline' },
  };
  return new Schema({ nodes, marks: {} });
};

const createDomStructure = () => {
  const page = document.createElement('div');
  page.className = DOM_CLASS_NAMES.PAGE;
  page.dataset.pageIndex = '0';

  const fragment = document.createElement('div');
  fragment.className = DOM_CLASS_NAMES.FRAGMENT;
  page.appendChild(fragment);

  const line1 = document.createElement('div');
  line1.className = DOM_CLASS_NAMES.LINE;
  fragment.appendChild(line1);

  const line2 = document.createElement('div');
  line2.className = DOM_CLASS_NAMES.LINE;
  fragment.appendChild(line2);

  document.body.appendChild(page);

  return { line1, line2 };
};

const createEnvironment = ({ presenting = true, selection = null, overrides = {} } = {}) => {
  const schema = createSchema();
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('hello world')])]);
  const initialSelection = selection ?? TextSelection.create(doc, 1, 1);

  const visibleHost = document.createElement('div');
  document.body.appendChild(visibleHost);

  const editor = {
    options: { isHeaderOrFooter: false, isHeadless: false },
    isEditable: true,
    presentationEditor: null,
  };

  const presentationEditor = {
    visibleHost,
    getActiveEditor: vi.fn(() => (presenting ? editor : null)),
    computeCaretLayoutRect: vi.fn(() => ({ x: 75, y: 40, height: 10, pageIndex: 0 })),
    denormalizeClientPoint: vi.fn((x, y) => ({ x: x + 1, y: y + 2 })),
    hitTest: vi.fn(() => ({ pos: 5 })),
  };

  editor.presentationEditor = presentationEditor;

  const extension = Extension.create(VerticalNavigation.config);
  extension.editor = editor;
  extension.addPmPlugins = VerticalNavigation.config.addPmPlugins.bind(extension);

  const plugin = extension.addPmPlugins()[0];
  let state = EditorState.create({ schema, doc, selection: initialSelection, plugins: [plugin] });

  const view = {
    state,
    composing: false,
    dispatch: vi.fn((tr) => {
      state = state.apply(tr);
      view.state = state;
    }),
  };

  Object.defineProperty(editor, 'state', {
    get() {
      return view.state;
    },
  });
  editor.view = view;

  Object.assign(editor, overrides.editor ?? {});
  Object.assign(presentationEditor, overrides.presentationEditor ?? {});
  if (overrides.view) Object.assign(view, overrides.view);

  return { editor, plugin, view, presentationEditor };
};

afterEach(() => {
  vi.restoreAllMocks();
  delete document.elementsFromPoint;
  document.body.innerHTML = '';
});

describe('VerticalNavigation', () => {
  it('returns false when editor is not presenting', () => {
    const { plugin, view } = createEnvironment({ presenting: false });

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowDown', shiftKey: false });
    expect(handled).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('moves selection on ArrowDown and sets goalX on first move', () => {
    const { line1, line2 } = createDomStructure();
    vi.spyOn(line2, 'getBoundingClientRect').mockReturnValue({
      top: 200,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    document.elementsFromPoint = vi.fn(() => [line1]);

    const { plugin, view, presentationEditor } = createEnvironment();
    presentationEditor.hitTest.mockReturnValue({ pos: 4 });
    presentationEditor.denormalizeClientPoint.mockReturnValue({ x: 111, y: 0 });

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowDown', shiftKey: false });

    expect(handled).toBe(true);
    expect(presentationEditor.hitTest).toHaveBeenCalledWith(111, 210);
    expect(view.state.selection.head).toBe(4);

    const pluginState = VerticalNavigationPluginKey.getState(view.state);
    expect(pluginState.goalX).toBe(75);
  });

  it('extends selection when shift is held', () => {
    const { line1, line2 } = createDomStructure();
    vi.spyOn(line2, 'getBoundingClientRect').mockReturnValue({
      top: 300,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    document.elementsFromPoint = vi.fn(() => [line1]);

    const { plugin, view, presentationEditor } = createEnvironment();
    presentationEditor.hitTest.mockReturnValue({ pos: 6 });

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowDown', shiftKey: true });

    expect(handled).toBe(true);
    expect(view.state.selection.from).toBe(1);
    expect(view.state.selection.to).toBe(6);
  });

  it('resets goalX on pointer-driven selection changes', () => {
    const { plugin, view } = createEnvironment();

    plugin.props.handleDOMEvents.mousedown(view);
    expect(view.dispatch).toHaveBeenCalled();

    const dispatchedTr = view.dispatch.mock.calls[0][0];
    expect(dispatchedTr.getMeta(VerticalNavigationPluginKey)).toMatchObject({ type: 'reset-goal-x' });
  });
});
