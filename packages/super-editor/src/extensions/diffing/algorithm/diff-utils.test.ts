import { describe, it, expect } from 'vitest';
import { getInsertionPos } from './diff-utils.ts';

const createNodeInfo = ({ pos = 0, depth = 0, nodeSize = 1 } = {}) => ({
  pos,
  depth,
  node: { nodeSize },
});

describe('getInsertionPos', () => {
  it('positions after previous node when depth matches', () => {
    const previous = createNodeInfo({ pos: 10, depth: 2, nodeSize: 5 });
    expect(getInsertionPos(2, [previous], 1)).toBe(15);
  });

  it('falls back to previous position plus one when depth differs', () => {
    const previous = createNodeInfo({ pos: 10, depth: 1, nodeSize: 3 });
    expect(getInsertionPos(2, [previous], 1)).toBe(11);
  });

  it('walks backward to the nearest matching shallower depth anchor', () => {
    const table = createNodeInfo({ pos: 0, depth: 0, nodeSize: 12 });
    const row = createNodeInfo({ pos: 1, depth: 1, nodeSize: 6 });
    const cell = createNodeInfo({ pos: 2, depth: 2, nodeSize: 4 });
    const oldNodes = [table, row, cell];

    expect(getInsertionPos(0, oldNodes, 3)).toBe(12);
  });

  it('returns zero when there is no previous node info', () => {
    expect(getInsertionPos(0, [], 0)).toBe(0);
  });

  it('handles previous nodes lacking nodeSize safely', () => {
    const previous = { pos: 5, depth: 1, node: {} } as any;
    expect(getInsertionPos(1, [previous], 1)).toBe(5);
  });
});
