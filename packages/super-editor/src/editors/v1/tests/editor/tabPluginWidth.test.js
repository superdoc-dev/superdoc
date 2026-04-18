import { describe, it, expect } from 'vitest';
import { initTestEditor } from '../helpers/helpers.js';
import { getIndentWidth } from '@extensions/tab/helpers/tabDecorations.js';
import { pixelsToTwips } from '@converter/helpers.js';

const makeText = (text) => ({
  type: 'run',
  content: [
    {
      type: 'text',
      text,
      marks: [{ type: 'textStyle', attrs: { fontFamily: 'Arial', fontSize: '10pt' } }],
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

describe('tab plugin width calculation', () => {
  it('logs width for sample text', () => {
    const paragraph = {
      type: 'paragraph',
      attrs: {
        tabStops: [
          { tab: { tabType: 'start', pos: 96, originalPos: '1440' } },
          { tab: { tabType: 'start', pos: 160, originalPos: '2400' } },
          { tab: { tabType: 'start', pos: 240, originalPos: '3600' } },
          { tab: { tabType: 'start', pos: 336, originalPos: '5040' } },
          { tab: { tabType: 'start', pos: 480, originalPos: '7200' } },
        ],
      },
      content: [
        makeText('At left margin (1")'),
        makeTab(),
        makeText('At 2.5"'),
        makeTab(),
        makeText('At 3" (custom)'),
        makeTab(),
        makeText('2x Tab (~5.8")'),
        makeTab(),
        makeText('Custom 5"'),
      ],
    };

    const doc = {
      type: 'doc',
      content: [paragraph],
    };

    const {
      editor: { view },
    } = initTestEditor({ loadFromSchema: true, content: doc });

    const decorations = view.state.plugins
      .map((plugin) => plugin.getState?.(view.state))
      .find((state) => state && state.decorations);

    const allDecos = decorations.decorations.find(0, view.state.doc.content.size);

    const widths = allDecos.map((deco) => {
      const match = deco.spec.style.match(/width:\s*([0-9.]+)px/);
      return match ? Number.parseFloat(match[1]) : null;
    });
    expect(decorations).toBeDefined();
  });
});

describe('getIndentWidth', () => {
  it('uses DOM coordinates when they provide a positive offset', () => {
    const view = {
      coordsAtPos: (pos) => ({ left: pos === 0 ? 5 : 35 }),
    };

    const width = getIndentWidth(view, 0, {});

    expect(width).toBe(30);
  });

  it('falls back to first line indent when DOM measurement is zero', () => {
    const view = {
      coordsAtPos: () => ({ left: 10 }),
    };

    const width = getIndentWidth(view, 0, { firstLine: pixelsToTwips(144) });

    expect(width).toBe(144);
  });

  it('combines left margin and hanging indent values during fallback', () => {
    const view = {
      coordsAtPos: () => ({ left: 0 }),
    };

    const width = getIndentWidth(view, 0, {
      left: pixelsToTwips(24),
      firstLine: pixelsToTwips(48),
      hanging: pixelsToTwips(12),
    });

    expect(width).toBe(60);
  });
});
