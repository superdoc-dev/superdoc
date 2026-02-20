// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getResolvedParagraphPropertiesMock = vi.hoisted(() => vi.fn((node) => node.attrs.paragraphProperties || {}));

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  getResolvedParagraphProperties: getResolvedParagraphPropertiesMock,
}));

beforeEach(() => {
  getResolvedParagraphPropertiesMock.mockReset();
  getResolvedParagraphPropertiesMock.mockImplementation((node) => node.attrs.paragraphProperties || {});
});

import {
  findParagraphContext,
  flattenParagraph,
  findNextTabIndex,
  findDecimalBreakPos,
  calculateIndentFallback,
  getTabDecorations,
} from './tabDecorations.js';
import { pixelsToTwips } from '@converter/helpers';

describe('findParagraphContext', () => {
  const mockHelpers = {
    linkedStyles: {
      getStyleById: vi.fn(),
    },
  };

  it('should get tabStops from node attributes', () => {
    const tabStops = [{ tab: { tabType: 'left', pos: pixelsToTwips(720) } }];
    const node = { type: { name: 'paragraph' }, attrs: { paragraphProperties: { tabStops } }, forEach: () => {} };
    const $pos = { node: () => node, start: () => 0, depth: 1 };
    const cache = new Map();

    const context = findParagraphContext($pos, cache, mockHelpers);

    expect(context.tabStops).toEqual([{ val: 'start', pos: 720, leader: undefined }]);
    expect(mockHelpers.linkedStyles.getStyleById).not.toHaveBeenCalled();
  });

  it('retrieves tab stops from resolved paragraph properties', () => {
    const node = {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties: {}, styleId: 'MyStyle' },
      forEach: () => {},
    };
    getResolvedParagraphPropertiesMock.mockReturnValue({
      tabStops: [{ tab: { tabType: 'center', pos: pixelsToTwips(1440) } }],
    });
    const $pos = { node: () => node, start: () => 0, depth: 1 };
    const cache = new Map();

    const context = findParagraphContext($pos, cache, mockHelpers);

    expect(context.tabStops).toEqual([{ val: 'center', pos: 1440 }]);
    expect(mockHelpers.linkedStyles.getStyleById).not.toHaveBeenCalled();
  });

  it('should return empty tabStops if not found', () => {
    mockHelpers.linkedStyles.getStyleById.mockReturnValue(null);
    const node = { type: { name: 'paragraph' }, attrs: {}, forEach: () => {} };
    const $pos = { node: () => node, start: () => 0, depth: 1 };
    const cache = new Map();

    const context = findParagraphContext($pos, cache, mockHelpers);

    expect(context.tabStops).toEqual([]);
  });
});

describe('flattenParagraph', () => {
  it('should flatten a paragraph node', () => {
    const para = {
      forEach: (callback) => {
        callback({ type: { name: 'text' }, text: 'Hello ' }, 0);
        callback({ type: { name: 'tab' } }, 6);
        callback({ type: { name: 'text' }, text: 'World' }, 7);
      },
    };

    const { entries, positionMap } = flattenParagraph(para, 0);

    expect(entries).toHaveLength(3);
    expect(entries[0].node.text).toBe('Hello ');
    expect(entries[1].node.type.name).toBe('tab');
    expect(entries[2].node.text).toBe('World');

    // Verify position map is created correctly
    expect(positionMap.size).toBe(3);
    expect(positionMap.get(entries[0].pos)).toBe(0);
    expect(positionMap.get(entries[1].pos)).toBe(1);
    expect(positionMap.get(entries[2].pos)).toBe(2);
  });
});

describe('findNextTabIndex', () => {
  const flattened = [
    { node: { type: { name: 'text' } } },
    { node: { type: { name: 'tab' } } },
    { node: { type: { name: 'text' } } },
    { node: { type: { name: 'tab' } } },
  ];

  it('should find the next tab index', () => {
    expect(findNextTabIndex(flattened, 0)).toBe(1);
    expect(findNextTabIndex(flattened, 2)).toBe(3);
  });

  it('should return -1 if no more tabs are found', () => {
    expect(findNextTabIndex(flattened, 4)).toBe(-1);
  });
});

describe('findDecimalBreakPos', () => {
  it('should find the position of the decimal break', () => {
    const flattened = [
      { node: { type: { name: 'text' }, text: '1' }, pos: 0 },
      { node: { type: { name: 'text' }, text: '.' }, pos: 1 },
      { node: { type: { name: 'text' }, text: '2' }, pos: 2 },
    ];
    expect(findDecimalBreakPos(flattened, 0, '.')).toBe(2);
  });

  it('should return null if no decimal break is found', () => {
    const flattened = [{ node: { type: { name: 'text' }, text: '12' }, pos: 0 }];
    expect(findDecimalBreakPos(flattened, 0, '.')).toBeNull();
  });
});

describe('calculateIndentFallback', () => {
  it('should calculate indent correctly', () => {
    expect(calculateIndentFallback({ left: pixelsToTwips(10), firstLine: pixelsToTwips(20) })).toBe(30);
    expect(calculateIndentFallback({ left: pixelsToTwips(10), hanging: pixelsToTwips(20) })).toBe(-10);
    expect(calculateIndentFallback({ firstLine: pixelsToTwips(20), hanging: pixelsToTwips(10) })).toBe(10);
  });
});

describe('getTabDecorations', () => {
  // Helper to create a mock view with DOM measurement capabilities
  const createMockView = (measurements = {}) => {
    const getMeasurement = (pos, key) => measurements[pos]?.[key];

    return {
      coordsAtPos: vi.fn((pos) => {
        const coords = getMeasurement(pos, 'coords');
        if (coords) return coords;
        return { left: pos * 10, top: 0, right: pos * 10, bottom: 20 };
      }),
      domAtPos: vi.fn((pos) => {
        const dom = getMeasurement(pos, 'dom');
        if (dom) return dom;
        return { node: document.createTextNode(''), offset: 0 };
      }),
      nodeDOM: vi.fn((pos) => {
        const nodeDom = getMeasurement(pos, 'nodeDOM');
        if (nodeDom) return nodeDom;
        return {};
      }),
    };
  };

  // Helper to create a mock paragraph node
  const createParagraphNode = (children = [], paragraphProperties = {}) => {
    const firstChild = children[0] || { marks: [], type: { name: 'text' }, text: '' };
    // Ensure firstChild has marks array
    if (!firstChild.marks) {
      firstChild.marks = [];
    }

    return {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties },
      nodeSize: children.reduce((sum, child) => sum + (child.nodeSize || 1), 2),
      firstChild,
      forEach: (callback) => {
        let offset = 0;
        children.forEach((child) => {
          callback(child, offset);
          offset += child.nodeSize || 1;
        });
      },
    };
  };

  // Helper to create a mock tab node
  const createTabNode = () => ({
    type: { name: 'tab' },
    nodeSize: 1,
  });

  // Helper to create a mock text node
  const createTextNode = (text, marks = []) => ({
    type: { name: 'text' },
    text,
    marks,
    nodeSize: text.length,
  });

  // Helper to create a mock $pos
  const createResolvedPos = (paragraph, startPos = 0, depth = 1) => ({
    depth,
    node: (d) => {
      if (d === depth) return paragraph;
      if (d === 1) return paragraph; // For calcTabHeight which uses node(1)
      return null;
    },
    start: (d) => (d === depth ? startPos : 0),
  });

  // Helper to create a mock document
  const createMockDoc = (nodes = []) => {
    const nodeMap = new Map();
    nodes.forEach(({ pos, node }) => {
      nodeMap.set(pos, node);
    });

    return {
      content: { size: 100 },
      resolve: (pos) => {
        const entry = nodes.find((n) => pos >= n.pos && pos < n.pos + n.node.nodeSize);
        if (entry?.paragraph) {
          return createResolvedPos(entry.paragraph, entry.paragraphStart || entry.pos);
        }
        return createResolvedPos(createParagraphNode(), 0);
      },
      nodesBetween: (from, to, callback) => {
        nodes.forEach(({ pos, node }) => {
          if (pos >= from && pos < to) {
            callback(node, pos);
          }
        });
      },
    };
  };

  const mockHelpers = {
    linkedStyles: {
      getStyleById: vi.fn(),
    },
  };

  it('should return an empty array if no tabs are found', () => {
    const doc = {
      content: { size: 10 },
      nodesBetween: () => {},
    };
    const decorations = getTabDecorations(doc, null, null);
    expect(decorations).toEqual([]);
  });

  describe('Tab Stop Types', () => {
    it('should apply left tab stop correctly', () => {
      const textNode = createTextNode('Hello');
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([textNode, tabNode], {
        tabStops: [{ val: 'left', pos: pixelsToTwips(100) }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 5, node: tabNode, paragraph, paragraphStart: 0 }, // Flattened pos is offset, not document pos
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        5: { coords: { left: 50 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      // Tab width should be: tabStop.pos (100) - currentWidth (50) = 50
      expect(decorations[0].type.attrs.style).toContain('width: 50px');
    });

    it('should apply right tab stop with segment width adjustment', () => {
      const textNode1 = createTextNode('Hello');
      const tabNode = createTabNode();
      const textNode2 = createTextNode('World');
      const paragraph = createParagraphNode([textNode1, tabNode, textNode2], {
        tabStops: [{ val: 'right', pos: pixelsToTwips(200) }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 6, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        6: { coords: { left: 50 } },
        7: { coords: { left: 50 } },
        12: { coords: { left: 100 } }, // End of "World"
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      // Tab width should be: tabStop.pos (200) - currentWidth (50) - segmentWidth (50) = 100
      expect(decorations[0].type.attrs.style).toContain('width: 100px');
    });

    it('should apply center tab stop with half segment width', () => {
      const textNode1 = createTextNode('Hello');
      const tabNode = createTabNode();
      const textNode2 = createTextNode('World');
      const paragraph = createParagraphNode([textNode1, tabNode, textNode2], {
        tabStops: [{ val: 'center', pos: pixelsToTwips(200) }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 6, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        6: { coords: { left: 50 } },
        7: { coords: { left: 50 } },
        12: { coords: { left: 100 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      // Tab width should be: tabStop.pos (200) - currentWidth (50) - (segmentWidth (50) / 2) = 125
      expect(decorations[0].type.attrs.style).toContain('width: 125px');
    });

    it('should apply decimal tab stop with decimal char found', () => {
      const textNode1 = createTextNode('Price');
      const tabNode = createTabNode();
      const textNode2 = createTextNode('12.99');
      const paragraph = createParagraphNode([textNode1, tabNode, textNode2], {
        tabStops: [{ val: 'decimal', pos: pixelsToTwips(200), decimalChar: '.' }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 5, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        5: { coords: { left: 40 } },
        6: { coords: { left: 40 } },
        8: { coords: { left: 60 } }, // Position of decimal (after "12")
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      // Should apply decimal tab stop logic and calculate width
      expect(decorations[0].type.attrs.style).toMatch(/width: \d+px/);
      // Verify it's using decimal stop logic (width should account for integral part)
      const widthMatch = decorations[0].type.attrs.style.match(/width: (\d+)px/);
      expect(widthMatch).toBeTruthy();
      expect(parseInt(widthMatch[1])).toBeGreaterThan(0);
    });

    it('should apply decimal tab stop without decimal char in text', () => {
      const textNode1 = createTextNode('Price');
      const tabNode = createTabNode();
      const textNode2 = createTextNode('15');
      const paragraph = createParagraphNode([textNode1, tabNode, textNode2], {
        tabStops: [{ val: 'decimal', pos: pixelsToTwips(200), decimalChar: '.' }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 6, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        6: { coords: { left: 50 } },
        7: { coords: { left: 50 } },
        8: { coords: { left: 70 } }, // End of paragraph - 1
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      // Should measure to paragraph end when no decimal found
      expect(decorations[0].type.attrs.style).toContain('width:');
    });

    it('should use custom decimal char (comma)', () => {
      const textNode1 = createTextNode('Price');
      const tabNode = createTabNode();
      const textNode2 = createTextNode('12,99');
      const paragraph = createParagraphNode([textNode1, tabNode, textNode2], {
        tabStops: [{ val: 'decimal', pos: pixelsToTwips(200), decimalChar: ',' }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 5, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        5: { coords: { left: 40 } },
        6: { coords: { left: 40 } },
        8: { coords: { left: 60 } }, // Position of comma (after "12")
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      // Should apply decimal tab stop logic with custom char
      expect(decorations[0].type.attrs.style).toMatch(/width: \d+px/);
      const widthMatch = decorations[0].type.attrs.style.match(/width: (\d+)px/);
      expect(widthMatch).toBeTruthy();
      expect(parseInt(widthMatch[1])).toBeGreaterThan(0);
    });

    it('should skip clear tab stops and use default', () => {
      const textNode = createTextNode('Hello');
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([textNode, tabNode], {
        tabStops: [{ val: 'clear', pos: pixelsToTwips(100) }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 5, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        5: { coords: { left: 50 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      // Should use default tab distance calculation
      // defaultTabDistance (48) - ((50 % 816) % 48) = 48 - 2 = 46
      expect(decorations[0].type.attrs.style).toContain('width: 46px');
    });

    it('should use default tab distance when no tab stops defined', () => {
      const textNode = createTextNode('Hello');
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([textNode, tabNode], {
        tabStops: [],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 5, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        5: { coords: { left: 50 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      // Should use default tab distance: 48 - (50 % 48) = 48 - 2 = 46
      expect(decorations[0].type.attrs.style).toContain('width: 46px');
    });
  });

  describe('Tab Leaders', () => {
    it('should apply dot leader style', () => {
      const textNode = createTextNode('Chapter 1');
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([textNode, tabNode], {
        tabStops: [{ val: 'left', pos: pixelsToTwips(200), leader: 'dot' }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 9, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        9: { coords: { left: 90 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      expect(decorations[0].type.attrs.style).toContain('border-bottom: 1px dotted black');
    });

    it('should apply heavy leader style', () => {
      const textNode = createTextNode('Chapter 1');
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([textNode, tabNode], {
        tabStops: [{ val: 'left', pos: pixelsToTwips(200), leader: 'heavy' }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 9, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        9: { coords: { left: 90 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      expect(decorations[0].type.attrs.style).toContain('border-bottom: 2px solid black');
    });

    it('should apply hyphen leader style', () => {
      const textNode = createTextNode('Chapter 1');
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([textNode, tabNode], {
        tabStops: [{ val: 'left', pos: pixelsToTwips(200), leader: 'hyphen' }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 9, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        9: { coords: { left: 90 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      expect(decorations[0].type.attrs.style).toContain('border-bottom: 1px solid black');
    });

    it('should apply middleDot leader style', () => {
      const textNode = createTextNode('Chapter 1');
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([textNode, tabNode], {
        tabStops: [{ val: 'left', pos: pixelsToTwips(200), leader: 'middleDot' }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 9, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        9: { coords: { left: 90 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      expect(decorations[0].type.attrs.style).toContain('border-bottom: 1px dotted black');
      expect(decorations[0].type.attrs.style).toContain('margin-bottom: 2px');
    });

    it('should apply underscore leader style', () => {
      const textNode = createTextNode('Chapter 1');
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([textNode, tabNode], {
        tabStops: [{ val: 'left', pos: pixelsToTwips(200), leader: 'underscore' }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 9, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        9: { coords: { left: 90 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      expect(decorations[0].type.attrs.style).toContain('border-bottom: 1px solid black');
    });

    it('should handle unknown leader type gracefully', () => {
      const textNode = createTextNode('Chapter 1');
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([textNode, tabNode], {
        tabStops: [{ val: 'left', pos: pixelsToTwips(200), leader: 'unknown' }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 9, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        9: { coords: { left: 90 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      // Should not crash, width should still be calculated
      expect(decorations[0].type.attrs.style).toContain('width:');
    });
  });

  describe('Multiple Tabs and Accumulation', () => {
    it('should handle multiple tabs in sequence', () => {
      const textNode1 = createTextNode('A');
      const tabNode1 = createTabNode();
      const textNode2 = createTextNode('B');
      const tabNode2 = createTabNode();
      const textNode3 = createTextNode('C');
      const paragraph = createParagraphNode([textNode1, tabNode1, textNode2, tabNode2, textNode3], {
        tabStops: [
          { val: 'left', pos: pixelsToTwips(100) },
          { val: 'left', pos: pixelsToTwips(200) },
        ],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 2, node: tabNode1, paragraph, paragraphStart: 0 },
        { pos: 4, node: tabNode2, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        2: { coords: { left: 10 } },
        3: { coords: { left: 110 } },
        4: { coords: { left: 120 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(2);
      // First tab: 100 - 10 = 90
      expect(decorations[0].type.attrs.style).toContain('width: 90px');
      // Second tab should account for accumulated width
    });

    it('should handle consecutive tabs with no text between', () => {
      const tabNode1 = createTabNode();
      const tabNode2 = createTabNode();
      const paragraph = createParagraphNode([tabNode1, tabNode2], {
        tabStops: [],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 0, node: tabNode1, paragraph, paragraphStart: 0 },
        { pos: 1, node: tabNode2, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(2);
      // Both should use default tab distance
      expect(decorations[0].type.attrs.style).toContain('width:');
      expect(decorations[1].type.attrs.style).toContain('width:');
    });

    it('should handle mixed tab stop types in same paragraph', () => {
      const textNode1 = createTextNode('Left');
      const tabNode1 = createTabNode();
      const textNode2 = createTextNode('Center');
      const tabNode2 = createTabNode();
      const textNode3 = createTextNode('Right');
      const paragraph = createParagraphNode([textNode1, tabNode1, textNode2, tabNode2, textNode3], {
        tabStops: [
          { val: 'left', pos: 100 },
          { val: 'center', pos: 250 },
        ],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 5, node: tabNode1, paragraph, paragraphStart: 0 },
        { pos: 12, node: tabNode2, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        5: { coords: { left: 40 } },
        6: { coords: { left: 140 } },
        12: { coords: { left: 200 } },
        13: { coords: { left: 250 } },
        17: { coords: { left: 290 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(2);
      // First should be left aligned
      // Second should be center aligned with segment width adjustment
    });
  });

  describe('Range and Position Handling', () => {
    it('should respect from/to range parameters', () => {
      const tabNode1 = createTabNode();
      const tabNode2 = createTabNode();
      const tabNode3 = createTabNode();
      const paragraph = createParagraphNode([tabNode1, tabNode2, tabNode3], {});

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 10, node: tabNode1, paragraph, paragraphStart: 0 },
        { pos: 20, node: tabNode2, paragraph, paragraphStart: 0 },
        { pos: 30, node: tabNode3, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView();

      const decorations = getTabDecorations(doc, view, mockHelpers, 15, 25);

      // Should only process tab2 (pos 20)
      expect(decorations.length).toBe(1);
    });

    it('should process entire document when from/to are null/undefined', () => {
      const tabNode1 = createTabNode();
      const tabNode2 = createTabNode();
      const paragraph = createParagraphNode([tabNode1, tabNode2], {});

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 10, node: tabNode1, paragraph, paragraphStart: 0 },
        { pos: 20, node: tabNode2, paragraph, paragraphStart: 0 },
      ]);

      doc.content.size = 100;

      const view = createMockView();

      const decorations = getTabDecorations(doc, view, mockHelpers);

      // Should process all tabs
      expect(decorations.length).toBe(2);
    });

    it('should handle invalid positions (entryIndex === -1) gracefully', () => {
      // This tests the early return when flattened.findIndex returns -1
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([tabNode], {});

      // Create a scenario where the tab position doesn't match flattened entries
      const doc = {
        content: { size: 100 },
        resolve: () => createResolvedPos(paragraph, 0),
        nodesBetween: (from, to, callback) => {
          // Call with a position that won't be in the flattened array
          callback(tabNode, 999);
        },
      };

      const view = createMockView();

      // Should not crash, should return empty or skip the invalid tab
      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 1000);

      // Should handle gracefully without throwing
      expect(Array.isArray(decorations)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully without crashing', () => {
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([tabNode], {
        tabStops: [{ val: 'decimal', pos: pixelsToTwips(100), decimalChar: '.' }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 0, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      // Create a view that will throw during width calculation
      // Inner functions have fallbacks, so this tests graceful degradation
      const view = {
        coordsAtPos: vi.fn(() => {
          throw new Error('coordsAtPos error');
        }),
        domAtPos: vi.fn(() => {
          throw new Error('domAtPos error');
        }),
        nodeDOM: vi.fn(() => ({})),
      };

      // Should not crash even with errors
      expect(() => {
        const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);
        expect(Array.isArray(decorations)).toBe(true);
      }).not.toThrow();
    });

    it('should handle null paragraph context gracefully', () => {
      const tabNode = createTabNode();

      // Create a document where paragraph can't be found
      const doc = {
        content: { size: 100 },
        resolve: () => ({
          depth: 0,
          node: () => null, // No paragraph node
        }),
        nodesBetween: (from, to, callback) => {
          callback(tabNode, 5);
        },
      };

      const view = createMockView();

      // Should not crash
      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(Array.isArray(decorations)).toBe(true);
    });

    it('should handle missing/null view gracefully', () => {
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([tabNode], {});

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 5, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Pass null view
      const decorations = getTabDecorations(doc, null, mockHelpers, 0, 100);

      // Should handle errors in try/catch
      expect(Array.isArray(decorations)).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('Decoration Output', () => {
    it('should create correct Decoration.node structure', () => {
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([tabNode], {});

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 5, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        5: { coords: { left: 0 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      expect(decorations[0].from).toBe(5);
      expect(decorations[0].to).toBe(6); // pos + nodeSize (1)
    });

    it('should include width and height in style string', () => {
      const tabNode = createTabNode();
      const textStyleMark = {
        type: { name: 'textStyle' },
        attrs: { fontSize: '12' },
      };
      const textNode = createTextNode('text', [textStyleMark]);
      const paragraph = createParagraphNode([textNode, tabNode], {});
      paragraph.firstChild.marks = [textStyleMark];

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 4, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        4: { coords: { left: 40 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      expect(decorations[0].type.attrs.style).toMatch(/width: \d+px/);
      expect(decorations[0].type.attrs.style).toMatch(/height: [\d.]+px/);
    });

    it('should include leader styles in decoration when present', () => {
      const tabNode = createTabNode();
      const paragraph = createParagraphNode([tabNode], {
        tabStops: [{ val: 'left', pos: pixelsToTwips(100), leader: 'dot' }],
      });

      const doc = createMockDoc([
        { pos: 0, node: paragraph, paragraph, paragraphStart: 0 },
        { pos: 5, node: tabNode, paragraph, paragraphStart: 0 },
      ]);

      const view = createMockView({
        0: { coords: { left: 0 } },
        1: { coords: { left: 0 } },
        5: { coords: { left: 50 } },
      });

      const decorations = getTabDecorations(doc, view, mockHelpers, 0, 100);

      expect(decorations.length).toBe(1);
      expect(decorations[0].type.attrs.style).toContain('width:');
      expect(decorations[0].type.attrs.style).toContain('height:');
      expect(decorations[0].type.attrs.style).toContain('border-bottom: 1px dotted black');
    });
  });
});
