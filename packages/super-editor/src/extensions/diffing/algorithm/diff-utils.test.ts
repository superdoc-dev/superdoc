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
    expect(getInsertionPos(2, previous)).toBe(15);
  });

  it('falls back to previous position plus one when depth differs', () => {
    const previous = createNodeInfo({ pos: 10, depth: 1, nodeSize: 3 });
    expect(getInsertionPos(2, previous)).toBe(11);
  });

  it('returns zero when there is no previous node info', () => {
    expect(getInsertionPos(0, undefined)).toBe(0);
  });

  it('handles previous nodes lacking nodeSize safely', () => {
    const previous = { pos: 5, depth: 1, node: {} } as any;
    expect(getInsertionPos(1, previous)).toBe(5);
  });
});
