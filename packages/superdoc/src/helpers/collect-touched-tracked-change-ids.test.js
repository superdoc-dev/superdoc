import { describe, it, expect } from 'vitest';
import { collectTouchedTrackedChangeIds } from './collect-touched-tracked-change-ids.js';

/**
 * Minimal StepMap mock that records ranges and calls the callback.
 */
class MockStepMap {
  constructor(ranges) {
    this._ranges = ranges; // [[oldStart, oldEnd, newStart, newEnd], ...]
  }

  forEach(callback) {
    for (const [oldStart, oldEnd, newStart, newEnd] of this._ranges) {
      callback(oldStart, oldEnd, newStart, newEnd);
    }
  }
}

/**
 * Minimal Mapping mock that supports slice + map.
 */
class MockMapping {
  constructor(maps) {
    this.maps = maps;
  }

  slice(from) {
    return new MockMapping(this.maps.slice(from));
  }

  map(pos) {
    let result = pos;
    for (const stepMap of this.maps) {
      for (const [oldStart, oldEnd, newStart, newEnd] of stepMap._ranges) {
        const oldSize = oldEnd - oldStart;
        const newSize = newEnd - newStart;
        const delta = newSize - oldSize;
        if (result > oldStart) {
          result += delta;
        }
      }
    }
    return result;
  }
}

function createMockMark(type, id) {
  return { type: { name: type }, attrs: { id } };
}

function createMockNode(marks = []) {
  return { marks };
}

describe('collectTouchedTrackedChangeIds', () => {
  it('finds marks in a single-step transaction', () => {
    const stepMap = new MockStepMap([[5, 5, 5, 8]]);
    const mapping = new MockMapping([stepMap]);

    const trackMark = createMockMark('trackInsert', 'tc-1');
    const node = createMockNode([trackMark]);

    const transaction = {
      docChanged: true,
      doc: {
        content: { size: 20 },
        nodesBetween(from, to, callback) {
          if (from < 9 && to > 4) callback(node);
        },
      },
      mapping,
      getMeta: () => null,
    };

    const result = collectTouchedTrackedChangeIds(transaction);
    expect(result.has('tc-1')).toBe(true);
  });

  it('correctly maps earlier step ranges forward in multi-step transactions', () => {
    // Step 0: insert at pos 10, producing range [10,13] in intermediate doc
    // Step 1: insert 5 chars at pos 2, shifting everything after pos 2 by +5
    // So step 0's range in the FINAL doc is [15, 18].
    const step0 = new MockStepMap([[10, 10, 10, 13]]);
    const step1 = new MockStepMap([[2, 2, 2, 7]]);
    const mapping = new MockMapping([step0, step1]);

    const correctMark = createMockMark('trackInsert', 'correct-id');
    const wrongMark = createMockMark('trackDelete', 'wrong-id');
    const correctNode = createMockNode([correctMark]);
    const wrongNode = createMockNode([wrongMark]);

    const transaction = {
      docChanged: true,
      doc: {
        content: { size: 30 },
        nodesBetween(from, to, callback) {
          // correctMark at 14–19 (where step 0's content actually is in final doc)
          if (from < 19 && to > 14) callback(correctNode);
          // wrongMark at 9–14 (where buggy code would look)
          if (from < 14 && to > 9) callback(wrongNode);
        },
      },
      mapping,
      getMeta: () => null,
    };

    const result = collectTouchedTrackedChangeIds(transaction);
    expect(result.has('correct-id')).toBe(true);
  });

  it('handles empty mapping gracefully', () => {
    const transaction = {
      docChanged: true,
      doc: { content: { size: 10 } },
      mapping: { maps: [] },
      getMeta: () => null,
    };

    const result = collectTouchedTrackedChangeIds(transaction);
    expect(result.size).toBe(0);
  });

  it('collects IDs from plugin metadata even without doc changes', () => {
    const pluginKey = 'TrackChangesKey';
    const transaction = {
      docChanged: false,
      doc: null,
      mapping: { maps: [] },
      getMeta: (key) => {
        if (key === pluginKey) {
          return {
            insertedMark: { attrs: { id: 'meta-id-1' } },
            deletionMark: null,
            formatMark: { attrs: { id: 'meta-id-2' } },
          };
        }
        return null;
      },
    };

    const result = collectTouchedTrackedChangeIds(transaction, { trackChangesPluginKey: pluginKey });
    expect(result.has('meta-id-1')).toBe(true);
    expect(result.has('meta-id-2')).toBe(true);
    expect(result.size).toBe(2);
  });

  it('ignores non-tracked-change marks', () => {
    const stepMap = new MockStepMap([[0, 0, 0, 5]]);
    const mapping = new MockMapping([stepMap]);

    const boldMark = createMockMark('bold', 'bold-1');
    const node = createMockNode([boldMark]);

    const transaction = {
      docChanged: true,
      doc: {
        content: { size: 10 },
        nodesBetween(from, to, callback) {
          callback(node);
        },
      },
      mapping,
      getMeta: () => null,
    };

    const result = collectTouchedTrackedChangeIds(transaction);
    expect(result.size).toBe(0);
  });

  it('returns empty set for null/undefined transaction', () => {
    expect(collectTouchedTrackedChangeIds(null).size).toBe(0);
    expect(collectTouchedTrackedChangeIds(undefined).size).toBe(0);
  });
});
