import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PMNode, PMMark, PositionMap } from '../types.js';
import type { TabRun, TabStop, ParagraphIndent, ParagraphAttrs } from '@superdoc/contracts';
import { tabNodeToRun } from './tab.js';
import * as marksModule from '../../marks/index.js';

// ============================================================================
// tabNodeToRun() Tests
// ============================================================================

describe('tabNodeToRun', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts basic tab node with position', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 5, end: 6 });

    const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs });

    expect(result).toEqual({
      kind: 'tab',
      text: '\t',
      pmStart: 5,
      pmEnd: 6,
      tabIndex: 0,
      tabStops: undefined,
      indent: undefined,
      leader: null,
    });
  });

  it('returns null when position not found', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();

    const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs });

    expect(result).toBeNull();
  });

  it('includes tab stops from paragraph attrs', () => {
    const tabStops: TabStop[] = [
      { position: 100, alignment: 'left' },
      { position: 200, alignment: 'center' },
    ];
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = { tabs: tabStops };
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs }) as TabRun;

    expect(result.tabStops).toEqual(tabStops);
  });

  it('includes indent from paragraph attrs', () => {
    const indent: ParagraphIndent = {
      left: 20,
      right: 10,
      firstLine: 5,
    };
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = { indent };
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs }) as TabRun;

    expect(result.indent).toEqual(indent);
  });

  it('includes leader character from tab node attrs', () => {
    const tabNode: PMNode = {
      type: 'tab',
      attrs: { leader: 'dot' },
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs }) as TabRun;

    expect(result.leader).toBe('dot');
  });

  it('sets leader to null when not provided', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs }) as TabRun;

    expect(result.leader).toBeNull();
  });

  it('tracks tabIndex correctly', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 5, paragraphAttrs }) as TabRun;

    expect(result.tabIndex).toBe(5);
  });

  it('handles paragraph with empty attrs', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = {};
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs }) as TabRun;

    expect(result.tabStops).toBeUndefined();
    expect(result.indent).toBeUndefined();
  });

  it('handles paragraph with empty tabStops array', () => {
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = { tabs: [] };
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs }) as TabRun;

    expect(result.tabStops).toEqual([]);
  });

  it('handles multiple tab stops in paragraph', () => {
    const tabStops: TabStop[] = [
      { position: 50, alignment: 'left' },
      { position: 100, alignment: 'center' },
      { position: 150, alignment: 'right' },
      { position: 200, alignment: 'decimal' },
    ];
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = { tabs: tabStops };
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 2, paragraphAttrs }) as TabRun;

    expect(result.tabStops).toEqual(tabStops);
    expect(result.tabStops?.length).toBe(4);
  });

  it('handles complex indent values', () => {
    const indent: ParagraphIndent = {
      left: 48,
      right: 24,
      firstLine: 12,
      hanging: 6,
    };
    const tabNode: PMNode = {
      type: 'tab',
    };
    const paragraphAttrs: ParagraphAttrs = { indent };
    const positions: PositionMap = new WeakMap();
    positions.set(tabNode, { start: 0, end: 1 });

    const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs }) as TabRun;

    expect(result.indent).toEqual(indent);
  });

  it('handles all leader types', () => {
    const leaders: Array<TabRun['leader']> = ['dot', 'hyphen', 'underscore', 'heavy', 'middleDot'];

    leaders.forEach((leader) => {
      const tabNode: PMNode = {
        type: 'tab',
        attrs: { leader },
      };
      const paragraphAttrs: ParagraphAttrs = {};
      const positions: PositionMap = new WeakMap();
      positions.set(tabNode, { start: 0, end: 1 });

      const result = tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs }) as TabRun;

      expect(result.leader).toBe(leader);
    });
  });

  describe('mark application', () => {
    it('calls applyMarksToRun with node marks', () => {
      const applyMarksToRunMock = vi.spyOn(marksModule, 'applyMarksToRun');

      const tabNode: PMNode = {
        type: 'tab',
        marks: [{ type: 'underline', attrs: { underlineType: 'single' } }],
      };
      const paragraphAttrs: ParagraphAttrs = {};
      const positions: PositionMap = new WeakMap();
      positions.set(tabNode, { start: 0, end: 1 });

      tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs });

      expect(applyMarksToRunMock).toHaveBeenCalledTimes(1);
      expect(applyMarksToRunMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tab' }), [
        { type: 'underline', attrs: { underlineType: 'single' } },
      ]);
    });

    it('calls applyMarksToRun with inherited marks', () => {
      const applyMarksToRunMock = vi.spyOn(marksModule, 'applyMarksToRun');

      const tabNode: PMNode = { type: 'tab' };
      const paragraphAttrs: ParagraphAttrs = {};
      const positions: PositionMap = new WeakMap();
      positions.set(tabNode, { start: 0, end: 1 });
      const inheritedMarks: PMMark[] = [{ type: 'underline', attrs: { underlineType: 'single' } }];

      tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs, inheritedMarks });

      expect(applyMarksToRunMock).toHaveBeenCalledTimes(1);
      expect(applyMarksToRunMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tab' }), [
        { type: 'underline', attrs: { underlineType: 'single' } },
      ]);
    });

    it('combines node marks and inherited marks', () => {
      const applyMarksToRunMock = vi.spyOn(marksModule, 'applyMarksToRun');

      const tabNode: PMNode = {
        type: 'tab',
        marks: [{ type: 'bold' }],
      };
      const paragraphAttrs: ParagraphAttrs = {};
      const positions: PositionMap = new WeakMap();
      positions.set(tabNode, { start: 0, end: 1 });
      const inheritedMarks: PMMark[] = [{ type: 'underline', attrs: { underlineType: 'single' } }];

      tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs, inheritedMarks });

      expect(applyMarksToRunMock).toHaveBeenCalledTimes(1);
      expect(applyMarksToRunMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tab' }), [
        { type: 'bold' },
        { type: 'underline', attrs: { underlineType: 'single' } },
      ]);
    });

    it('does not call applyMarksToRun when no marks present', () => {
      const applyMarksToRunMock = vi.spyOn(marksModule, 'applyMarksToRun');

      const tabNode: PMNode = { type: 'tab' };
      const paragraphAttrs: ParagraphAttrs = {};
      const positions: PositionMap = new WeakMap();
      positions.set(tabNode, { start: 0, end: 1 });

      tabNodeToRun({ node: tabNode, positions, tabOrdinal: 0, paragraphAttrs });

      expect(applyMarksToRunMock).not.toHaveBeenCalled();
    });
  });
});
