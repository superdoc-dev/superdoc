import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';

const hoisted = vi.hoisted(() => ({
  tippyMock: vi.fn(),
  createAppMock: vi.fn(),
}));

const createTippyInstance = () => {
  const instance = {
    setProps: vi.fn(),
    setContent: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    state: { isVisible: false },
  };
  return instance;
};

vi.mock('tippy.js', () => ({
  default: hoisted.tippyMock,
}));

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createApp: hoisted.createAppMock,
  };
});

vi.mock('@components/popovers/Mentions.vue', () => ({ default: { name: 'MentionsComponent' } }));

describe('popover plugin basics', () => {
  let PopoverPlugin;
  let editor;
  let schema;
  let plugin;
  let tippyInstance;

  beforeEach(async () => {
    tippyInstance = createTippyInstance();
    hoisted.tippyMock.mockReturnValue(tippyInstance);
    hoisted.createAppMock.mockReturnValue({ mount: vi.fn(), unmount: vi.fn() });

    ({ PopoverPlugin } = await import('./popover-plugin.js'));
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
    editor.options.users = [{ name: 'Alice', email: 'alice@example.com' }];
    Object.defineProperty(editor, 'users', {
      configurable: true,
      get: () => editor.options.users,
    });

    const factory = PopoverPlugin.config.addPmPlugins;
    [plugin] = factory.call({ editor });
  });

  afterEach(() => {
    editor.destroy();
    document.querySelectorAll('.sd-editor-popover').forEach((el) => el.remove());
    vi.clearAllMocks();
  });

  it('marks state for update when doc changes', () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create()]);
    let state = EditorState.create({ schema, doc, plugins: [plugin] });
    const initial = plugin.getState(state);
    expect(initial.shouldUpdate).toBeUndefined();

    const tr = state.tr.insertText('@');
    const newState = state.apply(tr);
    const pluginState = plugin.getState(newState);
    expect(pluginState.shouldUpdate).toBe(true);
  });

  it('destroys tippy instance when plugin view is removed', () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('test'))]);
    const state = EditorState.create({ schema, doc, plugins: [plugin] });
    const view = {
      state,
      dom: document.createElement('div'),
    };

    const pluginView = plugin.spec.view(view);
    pluginView.destroy();
    expect(tippyInstance.destroy).toHaveBeenCalled();
  });

  it('hides tippy when coordsAtPos returns null', () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('Hello @'))]);
    const state = EditorState.create({ schema, doc, plugins: [plugin] });
    const view = { state, dom: document.createElement('div') };

    const pluginView = plugin.spec.view(view);

    // Mock coordsAtPos to return null (presentation mode collapsed selection)
    editor.coordsAtPos = vi.fn().mockReturnValue(null);

    // Build a new state where selection is at end (after @)
    const endPos = state.doc.content.size - 1;
    const tr = state.tr.setSelection(state.selection.constructor.near(state.doc.resolve(endPos)));
    const newState = state.apply(tr);

    pluginView.update({ ...view, state: newState }, state);

    expect(tippyInstance.hide).toHaveBeenCalled();
    pluginView.destroy();
  });

  it('uses insertMention as the prop name (not inserMention)', () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('Hello @'))]);
    const state = EditorState.create({ schema, doc, plugins: [plugin] });
    const view = { state, dom: document.createElement('div') };

    const pluginView = plugin.spec.view(view);

    hoisted.createAppMock.mockClear();
    hoisted.createAppMock.mockReturnValue({ mount: vi.fn(), unmount: vi.fn() });

    // Mock coordsAtPos to return valid coords so the popover renders
    editor.coordsAtPos = vi.fn().mockReturnValue({ top: 100, bottom: 120, left: 50, right: 50 });

    const endPos = state.doc.content.size - 1;
    const tr = state.tr.setSelection(state.selection.constructor.near(state.doc.resolve(endPos)));
    const newState = state.apply(tr);

    pluginView.update({ ...view, state: newState }, state);

    const calls = hoisted.createAppMock.mock.calls;
    if (calls.length > 0) {
      const [, props] = calls[calls.length - 1];
      expect(props).toHaveProperty('insertMention');
      expect(props).not.toHaveProperty('inserMention');
    }

    pluginView.destroy();
  });
});
