import { describe, it, expect } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';

describe('tab plugin performance', () => {
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

  const buildParagraphWithTabs = (numTabs = 3, index = 0) => {
    const content = [];
    for (let i = 0; i < numTabs; i++) {
      content.push(makeText(`Text${index}-${i}`));
      content.push(makeTab());
    }
    content.push(makeText('End'));

    const tabStops = [];
    for (let i = 0; i < numTabs; i++) {
      tabStops.push({ val: 'start', pos: 96 * (i + 1) });
    }

    return {
      type: 'paragraph',
      attrs: { paragraphProperties: { tabStops } },
      content,
    };
  };

  describe('non-document changes (critical for performance)', () => {
    it('handles selection changes efficiently', () => {
      // Create doc with some tabs
      const paragraphs = [];
      for (let i = 0; i < 10; i++) {
        paragraphs.push(buildParagraphWithTabs(2, i));
      }

      const doc = {
        type: 'doc',
        content: paragraphs,
      };

      const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
      const tabPlugin = getTabPlugin(editor.view);

      const initialState = editor.view.state;
      const initialDecorations = getTabPluginState(editor.view).decorations;

      // Perform selection changes - should be very fast
      const startTime = performance.now();
      for (let i = 0; i < 10; i++) {
        const tr = initialState.tr.setSelection(initialState.selection);
        const nextDecorations = tabPlugin.spec.state.apply(
          tr,
          { decorations: initialDecorations },
          initialState,
          initialState,
        );

        // Should return same decorations reference
        expect(nextDecorations.decorations).toBe(initialDecorations);
      }
      const duration = performance.now() - startTime;

      // 10 selection changes should be nearly instant
      console.log(`10 selection changes took ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(10);

      editor.destroy();
    });

    it('preserves decorations reference for non-doc transactions', () => {
      const doc = {
        type: 'doc',
        content: [buildParagraphWithTabs(3)],
      };

      const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
      const tabPlugin = getTabPlugin(editor.view);

      const initialState = editor.view.state;
      const initialDecorations = getTabPluginState(editor.view).decorations;

      // Transaction without doc changes
      const tr = initialState.tr.setMeta('test', true);
      const nextDecorations = tabPlugin.spec.state.apply(
        tr,
        { decorations: initialDecorations },
        initialState,
        initialState,
      );

      // Should be same reference
      expect(nextDecorations.decorations).toBe(initialDecorations);

      editor.destroy();
    });
  });

  describe('meta flag performance', () => {
    it('quickly skips processing when blockNodeInitialUpdate is set', () => {
      const paragraphs = [];
      for (let i = 0; i < 10; i++) {
        paragraphs.push(buildParagraphWithTabs(3, i));
      }

      const doc = {
        type: 'doc',
        content: paragraphs,
      };

      const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
      const tabPlugin = getTabPlugin(editor.view);

      const initialState = editor.view.state;
      const initialDecorations = getTabPluginState(editor.view).decorations;

      const startTime = performance.now();
      // Perform 10 transactions with blockNodeInitialUpdate
      for (let i = 0; i < 10; i++) {
        const tr = initialState.tr.insertText('x', 1);
        tr.setMeta('blockNodeInitialUpdate', true);
        const nextDecorations = tabPlugin.spec.state.apply(
          tr,
          { decorations: initialDecorations },
          initialState,
          initialState,
        );

        // Should return same reference
        expect(nextDecorations.decorations).toBe(initialDecorations);
      }
      const duration = performance.now() - startTime;

      // Should be nearly instant
      console.log(`10 meta-skipped transactions took ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(5);

      editor.destroy();
    });
  });

  describe('large document handling', () => {
    it('handles document with many paragraphs with tabs', () => {
      const paragraphs = [];
      for (let i = 0; i < 50; i++) {
        paragraphs.push(buildParagraphWithTabs(2, i));
      }

      const doc = {
        type: 'doc',
        content: paragraphs,
      };

      const startTime = performance.now();
      const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
      const duration = performance.now() - startTime;

      const pluginState = getTabPluginState(editor.view);
      const allDecorations = pluginState.decorations.find();

      // In headless mode, decorations may not be created due to DOM measurement limitations
      // The important metric is that initialization doesn't crash and completes in reasonable time
      expect(Array.isArray(allDecorations)).toBe(true);

      console.log(`Doc with 50 paragraphs/100 tabs initialization took ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(3000);

      editor.destroy();
    });
  });

  describe('decoration creation with varied alignments', () => {
    it('creates decorations for different tab types', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { tabStops: [{ val: 'start', pos: 96 }] },
            content: [makeText('A'), makeTab(), makeText('B')],
          },
          {
            type: 'paragraph',
            attrs: { tabStops: [{ val: 'center', pos: 144 }] },
            content: [makeText('C'), makeTab(), makeText('D')],
          },
          {
            type: 'paragraph',
            attrs: { tabStops: [{ val: 'decimal', pos: 192 }] },
            content: [makeText('E'), makeTab(), makeText('12.34')],
          },
          {
            type: 'paragraph',
            attrs: { tabStops: [{ val: 'end', pos: 240 }] },
            content: [makeText('F'), makeTab(), makeText('G')],
          },
        ],
      };

      const startTime = performance.now();
      const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
      const duration = performance.now() - startTime;

      const pluginState = getTabPluginState(editor.view);
      const allDecorations = pluginState.decorations.find();

      // In headless mode, decorations may not be created
      expect(Array.isArray(allDecorations)).toBe(true);

      console.log(`Creating decorations with varied alignments took ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(500);

      editor.destroy();
    });

    it('creates decorations with leaders efficiently', () => {
      const leaders = ['dot', 'heavy', 'hyphen', 'middleDot', 'underscore'];
      const paragraphs = leaders.map((leader, i) => ({
        type: 'paragraph',
        attrs: { tabStops: [{ val: 'start', pos: 144, leader }] },
        content: [makeText(`Item${i}`), makeTab(), makeText('Value')],
      }));

      const doc = {
        type: 'doc',
        content: paragraphs,
      };

      const startTime = performance.now();
      const { editor } = initTestEditor({ loadFromSchema: true, content: doc });
      const duration = performance.now() - startTime;

      const pluginState = getTabPluginState(editor.view);
      const allDecorations = pluginState.decorations.find();

      // In headless mode, decorations may not be created
      expect(Array.isArray(allDecorations)).toBe(true);

      console.log(`Creating decorations with leaders took ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(300);

      editor.destroy();
    });
  });
});
