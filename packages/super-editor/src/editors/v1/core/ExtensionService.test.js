import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('prosemirror-keymap', () => ({
  keymap: vi.fn((bindings) => ({ type: 'keymap', bindings })),
}));

vi.mock('./Schema.js', () => ({
  Schema: {
    createSchemaByExtensions: vi.fn(() => 'mock-schema'),
  },
}));

vi.mock('./Attribute.js', () => ({
  Attribute: {
    getAttributesFromExtensions: vi.fn(() => []),
    getAttributesToRender: vi.fn(() => ({})),
  },
}));

vi.mock('./helpers/getNodeType.js', () => ({
  getNodeType: vi.fn(() => 'node-type'),
}));

vi.mock('./helpers/getSchemaTypeByName.js', () => ({
  getSchemaTypeByName: vi.fn(() => 'schema-type'),
}));

vi.mock('./utilities/callOrGet.js', () => ({
  callOrGet: vi.fn((value) => {
    if (typeof value === 'function') return value();
    return value;
  }),
}));

vi.mock('./InputRule.js', () => ({
  inputRulesPlugin: vi.fn(({ rules }) => ({ type: 'input-rules', rules })),
}));

import { keymap } from 'prosemirror-keymap';
import { Schema } from './Schema.js';
import { Attribute } from './Attribute.js';
import { callOrGet } from './utilities/callOrGet.js';
import { inputRulesPlugin } from './InputRule.js';
import { ExtensionService } from './ExtensionService.js';

const createExtension = (name, overrides = {}) => {
  const { type = 'extension', storage = {}, options = {}, config = {} } = overrides;

  return {
    name,
    type,
    storage,
    options,
    config: {
      priority: 100,
      ...config,
    },
  };
};

const createEditor = () => ({
  options: { enableInputRules: true },
  extensionStorage: {},
  on: vi.fn(),
});

describe('ExtensionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('merges core and external extensions by priority', () => {
    const editor = createEditor();
    const low = createExtension('low', { config: { priority: 10 } });
    const high = createExtension('high', { config: { priority: 200 } });
    const external = createExtension('external', { config: { priority: 150 } });

    const service = new ExtensionService([low, high], [external], editor);

    expect(service.extensions.map((ext) => ext.name)).toEqual(['high', 'external', 'low']);
    expect(service.extensions.find((ext) => ext.name === 'external').isExternal).toBe(true);
    expect(Schema.createSchemaByExtensions).toHaveBeenCalledWith(service.extensions, editor);
  });

  it('aggregates commands with bound extension context', () => {
    const editor = createEditor();
    const commandFn = vi.fn();

    const extension = createExtension('commandExt', {
      config: {
        addCommands() {
          expect(this.name).toBe('commandExt');
          expect(this.editor).toBe(editor);
          expect(this.type).toBe('schema-type');
          return { doSomething: commandFn };
        },
      },
    });

    const service = new ExtensionService([extension], [], editor);

    expect(service.commands).toEqual({ doSomething: commandFn });
  });

  it('aggregates helpers per extension namespace', () => {
    const editor = createEditor();
    const helpersFn = { helper: vi.fn() };

    const extension = createExtension('helperExt', {
      config: {
        addHelpers() {
          expect(this.name).toBe('helperExt');
          expect(this.editor).toBe(editor);
          return helpersFn;
        },
      },
    });

    const service = new ExtensionService([extension], [], editor);

    expect(service.helpers).toEqual({ helperExt: helpersFn });
  });

  it('builds plugins with shortcuts, input rules, and pm plugins', () => {
    const editor = createEditor();
    const shortcutHandler = vi.fn(() => 'shortcut');
    const pmPlugin = { name: 'pmPlugin' };
    const inputRule = { name: 'rule' };

    const extension = createExtension('pluginExt', {
      config: {
        addShortcuts() {
          return {
            'Mod-b': shortcutHandler,
          };
        },
        addInputRules() {
          return [inputRule];
        },
        addPmPlugins() {
          return [pmPlugin];
        },
      },
    });

    const service = new ExtensionService([extension], [], editor);

    const plugins = service.plugins;

    expect(inputRulesPlugin).toHaveBeenCalledWith({ editor, rules: [inputRule] });
    expect(keymap).toHaveBeenCalledTimes(1);
    const shortcutBindings = keymap.mock.calls[0][0];
    expect(Object.keys(shortcutBindings)).toEqual(['Mod-b']);

    const boundShortcut = shortcutBindings['Mod-b'];
    expect(boundShortcut('arg')).toBe('shortcut');
    expect(shortcutHandler).toHaveBeenCalledWith({ editor, keymapArgs: ['arg'] });

    expect(plugins).toContainEqual({ type: 'input-rules', rules: [inputRule] });
    expect(plugins).toContainEqual({ type: 'keymap', bindings: shortcutBindings });
    expect(plugins).toContain(pmPlugin);
  });

  it('creates node views with rendered attributes', () => {
    const editor = createEditor();
    const renderNodeView = vi.fn(() => 'node-view-result');
    const addNodeView = vi.fn(() => renderNodeView);

    Attribute.getAttributesFromExtensions.mockReturnValue([{ type: 'nodeExt', attrs: 'attrs' }]);
    Attribute.getAttributesToRender.mockReturnValue({ 'data-test': 'value' });

    const extension = createExtension('nodeExt', {
      type: 'node',
      config: {
        addNodeView,
      },
    });

    const service = new ExtensionService([extension], [], editor);

    const nodeViews = service.nodeViews;
    const nodeView = nodeViews.nodeExt;

    const result = nodeView('node', 'pmView', 'getPos', 'decorations');

    expect(addNodeView).toHaveBeenCalledTimes(1);
    expect(renderNodeView).toHaveBeenCalledWith({
      editor,
      node: 'node',
      getPos: 'getPos',
      decorations: 'decorations',
      htmlAttributes: { 'data-test': 'value' },
      extensionAttrs: [
        {
          attrs: 'attrs',
          type: 'nodeExt',
        },
      ],
      extension,
    });
    expect(result).toBe('node-view-result');
  });

  it('stores extension storage, attaches events, and tracks splittable marks', () => {
    const editor = createEditor();
    const eventHandlers = {
      onBeforeCreate: vi.fn(),
      onCreate: vi.fn(),
      onUpdate: vi.fn(),
      onSelectionUpdate: vi.fn(),
      onTransaction: vi.fn(),
      onFocus: vi.fn(),
      onBlur: vi.fn(),
      onDestroy: vi.fn(),
    };

    const extension = createExtension('markExt', {
      type: 'mark',
      storage: { data: true },
      config: {
        keepOnSplit: () => true,
        ...eventHandlers,
      },
    });

    const service = new ExtensionService([extension], [], editor);

    expect(editor.extensionStorage.markExt).toEqual({ data: true });
    expect(service.splittableMarks).toContain('markExt');
    expect(callOrGet).toHaveBeenCalled();

    const eventNames = editor.on.mock.calls.map((call) => call[0]);
    expect(eventNames).toEqual([
      'beforeCreate',
      'create',
      'update',
      'selectionUpdate',
      'transaction',
      'focus',
      'blur',
      'destroy',
    ]);
  });
});
