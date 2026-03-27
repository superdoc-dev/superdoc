// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { parseLevel, resolveParentList } from './list-indent-helpers.js';

describe('parseLevel', () => {
  it('returns numeric values unchanged', () => {
    expect(parseLevel(2)).toBe(2);
    expect(parseLevel(0)).toBe(0);
  });

  it('parses numeric strings', () => {
    expect(parseLevel('3')).toBe(3);
    expect(parseLevel('08')).toBe(8);
  });

  it('falls back to 0 for invalid values', () => {
    expect(parseLevel(undefined)).toBe(0);
    expect(parseLevel('not-a-number')).toBe(0);
  });
});

describe('resolveParentList', () => {
  const makePos = (nodes) => {
    return {
      depth: nodes.length - 1,
      node: vi.fn((depth) => nodes[depth]),
    };
  };

  it('walks up the depth chain until it finds a list container', () => {
    const bulletList = { type: { name: 'bulletList' }, attrs: { listId: 42 } };
    const listItem = { type: { name: 'listItem' } };
    const paragraph = { type: { name: 'paragraph' } };

    const $pos = makePos([paragraph, listItem, bulletList]);
    const result = resolveParentList($pos);
    expect(result).toBe(bulletList);
    expect($pos.node).toHaveBeenCalledTimes(1);
  });

  it('returns null when no list container is present', () => {
    const paragraph = { type: { name: 'paragraph' } };
    const heading = { type: { name: 'heading' } };
    const $pos = makePos([paragraph, heading]);

    expect(resolveParentList($pos)).toBeNull();
  });

  it('returns null when $pos is missing', () => {
    expect(resolveParentList(null)).toBeNull();
    expect(resolveParentList(undefined)).toBeNull();
  });
});
