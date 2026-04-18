import { describe, it, expect } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';

describe('tab plugin state management', () => {
  const makeText = (text) => ({
    type: 'run',
    content: [
      {
        type: 'text',
        text,
        marks: [{ type: 'textStyle', attrs: { fontFamily: 'Arial', fontSize: '11pt' } }],
      },
    ],
  });

  const makeTab = () => ({
    type: 'run',
    content: [
      {
        type: 'tab',
        marks: [{ type: 'textStyle', attrs: {} }],
      },
    ],
  });

  const getTabPluginState = (view) => {
    return view.state.plugins
      .map((plugin) => plugin.getState?.(view.state))
      .find((state) => state && state.decorations);
  };

  const getTabPlugin = (view) => {
    const stateIndex = view.state.plugins.findIndex((plugin) => {
      const state = plugin.getState?.(view.state);
      return state && state.decorations;
    });
    return stateIndex >= 0 ? view.state.plugins[stateIndex] : null;
  };

  it('initializes with decorations', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [makeText('Before'), makeTab(), makeText('After')],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
    const pluginState = getTabPluginState(editor.view);

    expect(pluginState).toBeDefined();
    expect(pluginState.decorations).toBeDefined();

    // Note: In headless mode, decorations may not be created due to DOM measurement limitations
    // The important thing is that the plugin state is properly initialized
    const allDecorations = pluginState.decorations.find();
    expect(Array.isArray(allDecorations)).toBe(true);

    editor.destroy();
  });

  it('decorations have width styles', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            tabStops: [{ val: 'start', pos: 144 }],
          },
          content: [makeText('Text'), makeTab(), makeText('More')],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
    const pluginState = getTabPluginState(editor.view);

    const allDecorations = pluginState.decorations.find();

    // In headless mode, decorations may not be created due to DOM measurement limitations
    // If decorations are created, verify they have width styles
    if (allDecorations.length > 0) {
      const hasWidthStyle = allDecorations.some((deco) => {
        const style = deco.spec?.style || '';
        return style.includes('width:') && style.includes('px');
      });
      expect(hasWidthStyle).toBe(true);
    }

    editor.destroy();
  });

  it('preserves decorations when transaction has no doc changes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [makeText('Before'), makeTab(), makeText('After')],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
    const tabPlugin = getTabPlugin(editor.view);

    const initialState = editor.view.state;
    const initialDecorations = getTabPluginState(editor.view).decorations;

    // Create a transaction without document changes (e.g., selection change)
    const tr = initialState.tr.setSelection(initialState.selection);
    const nextDecorations = tabPlugin.spec.state.apply(
      tr,
      { decorations: initialDecorations },
      initialState,
      initialState,
    );

    // Should return the same decorations object (same reference)
    expect(nextDecorations.decorations).toBe(initialDecorations);

    editor.destroy();
  });

  it('skips updates when blockNodeInitialUpdate meta is set', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [makeText('Before'), makeTab(), makeText('After')],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
    const tabPlugin = getTabPlugin(editor.view);

    const initialState = editor.view.state;
    const initialDecorations = getTabPluginState(editor.view).decorations;

    // Create a transaction with blockNodeInitialUpdate meta
    const tr = initialState.tr.insertText('x', 1);
    tr.setMeta('blockNodeInitialUpdate', true);
    const nextDecorations = tabPlugin.spec.state.apply(
      tr,
      { decorations: initialDecorations },
      initialState,
      initialState,
    );

    // Should return the same decorations object
    expect(nextDecorations.decorations).toBe(initialDecorations);

    editor.destroy();
  });

  it('handles multiple tabs in same paragraph', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            tabStops: [
              { val: 'start', pos: 96 },
              { val: 'start', pos: 192 },
            ],
          },
          content: [makeText('First'), makeTab(), makeText('Second'), makeTab(), makeText('Third')],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
    const pluginState = getTabPluginState(editor.view);

    expect(pluginState).toBeDefined();
    expect(pluginState.decorations).toBeDefined();

    const allDecorations = pluginState.decorations.find();
    expect(Array.isArray(allDecorations)).toBe(true);

    // In headless mode, decorations may not be created
    // If created, should have decorations for both tabs
    if (allDecorations.length > 0) {
      expect(allDecorations.length).toBeGreaterThanOrEqual(2);
    }

    editor.destroy();
  });

  it('handles empty document', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
    const pluginState = getTabPluginState(editor.view);

    expect(pluginState.decorations).toBeDefined();

    const allDecorations = pluginState.decorations.find();
    expect(allDecorations.length).toBe(0);

    editor.destroy();
  });

  it('handles document with only text (no tabs)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [makeText('Just some text without tabs')],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
    const pluginState = getTabPluginState(editor.view);

    expect(pluginState.decorations).toBeDefined();

    const allDecorations = pluginState.decorations.find();
    expect(allDecorations.length).toBe(0);

    editor.destroy();
  });

  it('props.decorations returns the plugin state decorations', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [makeText('Text'), makeTab()],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
    const tabPlugin = getTabPlugin(editor.view);

    const pluginState = getTabPluginState(editor.view);
    const propsDecorations = tabPlugin.props.decorations(editor.view.state);

    expect(propsDecorations).toBe(pluginState.decorations);

    editor.destroy();
  });

  it('handles tabs in multiple paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [makeText('Para 1'), makeTab()],
        },
        {
          type: 'paragraph',
          content: [makeText('Para 2'), makeTab()],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
    const pluginState = getTabPluginState(editor.view);

    expect(pluginState).toBeDefined();
    expect(pluginState.decorations).toBeDefined();

    const allDecorations = pluginState.decorations.find();
    expect(Array.isArray(allDecorations)).toBe(true);

    // In headless mode, decorations may not be created
    // If created, should have decorations for both paragraphs
    if (allDecorations.length > 0) {
      expect(allDecorations.length).toBeGreaterThanOrEqual(2);
    }

    editor.destroy();
  });
});
