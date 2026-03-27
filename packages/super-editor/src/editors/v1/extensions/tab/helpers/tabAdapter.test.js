import { describe, it, expect } from 'vitest';
import { applyLayoutResult, calculateTabLayout } from './tabAdapter.js';

const createNode = (name, children = [], extra = {}) => {
  const node = {
    type: { name },
    children,
    nodeSize: extra.nodeSize,
  };

  if (!node.nodeSize) {
    if (children.length) {
      node.nodeSize = children.reduce((sum, child) => sum + (child.nodeSize || 0), 0) + 2;
    } else if (name === 'text') {
      node.nodeSize = extra.text?.length || 1;
    } else {
      node.nodeSize = 1;
    }
  }

  node.forEach = (cb) => {
    let offset = 0;
    children.forEach((child) => {
      cb(child, offset);
      offset += child.nodeSize || 0;
    });
  };

  return node;
};

const makeSpan = (type, text, tabId, spanId) => {
  const base = { type, spanId };
  if (text != null) base.text = text;
  if (tabId) base.tabId = tabId;
  return base;
};

const measure = {
  measureText: (_id, text) => (text?.length || 0) * 10,
};

describe('calculateTabLayout', () => {
  it('resets currentX after line breaks', () => {
    const paragraphId = 'para-1';
    const spans = [
      makeSpan('text', 'Label', null, 's1'), // 50px
      makeSpan('tab', null, `${paragraphId}-tab-0`, 't1'),
      makeSpan('text', 'Tail', null, 's2'), // 40px
      makeSpan('lineBreak', null, null, 'br1'),
      makeSpan('text', 'Label', null, 's3'), // 50px
      makeSpan('tab', null, `${paragraphId}-tab-1`, 't2'),
      makeSpan('text', 'Tail', null, 's4'), // 40px
    ];

    const request = {
      spans,
      tabStops: [{ pos: 100, val: 'start', leader: 'none' }],
      paragraphWidth: 800,
      defaultTabDistance: 48,
      defaultLineLength: 816,
      paragraphId,
      revision: 1,
      indentWidth: 0,
      indents: { left: 0, right: 0, firstLine: 0, hanging: 0 },
    };

    const result = calculateTabLayout(request, measure);
    const firstWidth = result.tabs[`${paragraphId}-tab-0`].width;
    const secondWidth = result.tabs[`${paragraphId}-tab-1`].width;

    expect(firstWidth).toBe(50);
    expect(secondWidth).toBe(50);
  });

  it('resets currentX after hard breaks', () => {
    const paragraphId = 'para-1';
    const spans = [
      makeSpan('text', 'Label', null, 's1'), // 50px
      makeSpan('tab', null, `${paragraphId}-tab-0`, 't1'),
      makeSpan('hardBreak', null, null, 'br1'),
      makeSpan('text', 'Label', null, 's2'), // 50px
      makeSpan('tab', null, `${paragraphId}-tab-1`, 't2'),
    ];

    const request = {
      spans,
      tabStops: [{ pos: 100, val: 'start', leader: 'none' }],
      paragraphWidth: 800,
      defaultTabDistance: 48,
      defaultLineLength: 816,
      paragraphId,
      revision: 1,
      indentWidth: 0,
      indents: { left: 0, right: 0, firstLine: 0, hanging: 0 },
    };

    const result = calculateTabLayout(request, measure);
    const firstWidth = result.tabs[`${paragraphId}-tab-0`].width;
    const secondWidth = result.tabs[`${paragraphId}-tab-1`].width;

    expect(firstWidth).toBe(50);
    expect(secondWidth).toBe(50);
  });
});

describe('applyLayoutResult', () => {
  it('decorates tab nodes nested inside run nodes', () => {
    const tabNode = createNode('tab', [], { nodeSize: 1 });
    const runNode = createNode('run', [
      createNode('text', [], { nodeSize: 1 }),
      tabNode,
      createNode('text', [], { nodeSize: 1 }),
    ]);
    const paragraph = createNode('paragraph', [runNode]);

    const result = {
      paragraphId: 'para-0',
      revision: 0,
      tabs: {
        'para-0-tab-0': { width: 24, height: '10px', leader: 'dot' },
      },
    };

    const decorations = applyLayoutResult(result, paragraph, 0);

    expect(decorations).toHaveLength(1);
    expect(decorations[0].from).toBe(3);
    expect(decorations[0].to).toBe(4);

    const style = decorations[0].type.attrs.style;
    expect(style).toContain('width: 24px;');
    expect(style).toContain('height: 10px;');
    expect(style).toContain('border-bottom: 1px dotted black;');
  });

  it('returns empty decorations array for paragraph with no tabs', () => {
    const runNode = createNode('run', [createNode('text', [], { nodeSize: 5, text: 'Hello' })]);
    const paragraph = createNode('paragraph', [runNode]);

    const result = {
      paragraphId: 'para-0',
      revision: 0,
      tabs: {},
    };

    const decorations = applyLayoutResult(result, paragraph, 0);

    expect(decorations).toHaveLength(0);
    expect(decorations).toEqual([]);
  });

  it('handles multiple sequential tabs with correct indexing', () => {
    const tab1 = createNode('tab', [], { nodeSize: 1 });
    const tab2 = createNode('tab', [], { nodeSize: 1 });
    const tab3 = createNode('tab', [], { nodeSize: 1 });
    const runNode = createNode('run', [
      createNode('text', [], { nodeSize: 2, text: 'Hi' }),
      tab1,
      createNode('text', [], { nodeSize: 1, text: 'A' }),
      tab2,
      createNode('text', [], { nodeSize: 1, text: 'B' }),
      tab3,
    ]);
    const paragraph = createNode('paragraph', [runNode]);

    const result = {
      paragraphId: 'para-0',
      revision: 0,
      tabs: {
        'para-0-tab-0': { width: 10, height: '12px', leader: 'none' },
        'para-0-tab-1': { width: 20, height: '12px', leader: 'dot' },
        'para-0-tab-2': { width: 30, height: '12px', leader: 'hyphen' },
      },
    };

    const decorations = applyLayoutResult(result, paragraph, 0);

    expect(decorations).toHaveLength(3);

    // First tab
    expect(decorations[0].from).toBe(4);
    expect(decorations[0].to).toBe(5);
    expect(decorations[0].type.attrs.style).toContain('width: 10px;');

    // Second tab
    expect(decorations[1].from).toBe(6);
    expect(decorations[1].to).toBe(7);
    expect(decorations[1].type.attrs.style).toContain('width: 20px;');
    expect(decorations[1].type.attrs.style).toContain('border-bottom: 1px dotted black;');

    // Third tab
    expect(decorations[2].from).toBe(8);
    expect(decorations[2].to).toBe(9);
    expect(decorations[2].type.attrs.style).toContain('width: 30px;');
    expect(decorations[2].type.attrs.style).toContain('border-bottom: 1px solid black;');
  });

  it('gracefully skips tabs with missing layout data', () => {
    const tab1 = createNode('tab', [], { nodeSize: 1 });
    const tab2 = createNode('tab', [], { nodeSize: 1 });
    const runNode = createNode('run', [tab1, createNode('text', [], { nodeSize: 2, text: 'Hi' }), tab2]);
    const paragraph = createNode('paragraph', [runNode]);

    const result = {
      paragraphId: 'para-0',
      revision: 0,
      tabs: {
        'para-0-tab-0': { width: 15, height: '12px' },
        // Missing 'para-0-tab-1'
      },
    };

    const decorations = applyLayoutResult(result, paragraph, 0);

    // Should only decorate the first tab, skip the second
    expect(decorations).toHaveLength(1);
    expect(decorations[0].from).toBe(2);
    expect(decorations[0].to).toBe(3);
    expect(decorations[0].type.attrs.style).toContain('width: 15px;');
  });

  it('handles deeply nested run structures with recursion', () => {
    const tabNode = createNode('tab', [], { nodeSize: 1 });
    const innerRun = createNode('run', [createNode('text', [], { nodeSize: 1, text: 'A' }), tabNode]);
    const outerRun = createNode('run', [createNode('text', [], { nodeSize: 1, text: 'B' }), innerRun]);
    const paragraph = createNode('paragraph', [outerRun]);

    const result = {
      paragraphId: 'para-0',
      revision: 0,
      tabs: {
        'para-0-tab-0': { width: 50, height: '14px', leader: 'heavy' },
      },
    };

    const decorations = applyLayoutResult(result, paragraph, 0);

    expect(decorations).toHaveLength(1);
    expect(decorations[0].from).toBe(5);
    expect(decorations[0].to).toBe(6);
    expect(decorations[0].type.attrs.style).toContain('width: 50px;');
    expect(decorations[0].type.attrs.style).toContain('border-bottom: 2px solid black;');
  });

  it('handles tabs without height property', () => {
    const tabNode = createNode('tab', [], { nodeSize: 1 });
    const runNode = createNode('run', [tabNode]);
    const paragraph = createNode('paragraph', [runNode]);

    const result = {
      paragraphId: 'para-0',
      revision: 0,
      tabs: {
        'para-0-tab-0': { width: 25 },
      },
    };

    const decorations = applyLayoutResult(result, paragraph, 0);

    expect(decorations).toHaveLength(1);
    const style = decorations[0].type.attrs.style;
    expect(style).toContain('width: 25px;');
    expect(style).not.toContain('height:');
  });

  it('handles tabs without leader property', () => {
    const tabNode = createNode('tab', [], { nodeSize: 1 });
    const runNode = createNode('run', [tabNode]);
    const paragraph = createNode('paragraph', [runNode]);

    const result = {
      paragraphId: 'para-0',
      revision: 0,
      tabs: {
        'para-0-tab-0': { width: 25, height: '10px' },
      },
    };

    const decorations = applyLayoutResult(result, paragraph, 0);

    expect(decorations).toHaveLength(1);
    const style = decorations[0].type.attrs.style;
    expect(style).toContain('width: 25px;');
    expect(style).toContain('height: 10px;');
    expect(style).not.toContain('border-bottom:');
  });

  it('handles all leader styles correctly', () => {
    const leaderTests = [
      { leader: 'dot', expected: 'border-bottom: 1px dotted black;' },
      { leader: 'heavy', expected: 'border-bottom: 2px solid black;' },
      { leader: 'hyphen', expected: 'border-bottom: 1px solid black;' },
      { leader: 'middleDot', expected: 'border-bottom: 1px dotted black; margin-bottom: 2px;' },
      { leader: 'underscore', expected: 'border-bottom: 1px solid black;' },
    ];

    leaderTests.forEach(({ leader, expected }) => {
      const tabNode = createNode('tab', [], { nodeSize: 1 });
      const runNode = createNode('run', [tabNode]);
      const paragraph = createNode('paragraph', [runNode]);

      const result = {
        paragraphId: 'para-0',
        revision: 0,
        tabs: {
          'para-0-tab-0': { width: 20, height: '10px', leader },
        },
      };

      const decorations = applyLayoutResult(result, paragraph, 0);

      expect(decorations).toHaveLength(1);
      expect(decorations[0].type.attrs.style).toContain(expected);
    });
  });
});
