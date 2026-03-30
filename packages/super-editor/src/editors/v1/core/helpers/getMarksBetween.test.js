import { describe, it, expect, vi, afterEach } from 'vitest';
import { doc, p, em, schema } from 'prosemirror-test-builder';

const getMarkRangeMock = vi.hoisted(() => vi.fn(() => ({ from: 0, to: 2 })));

vi.mock('./getMarkRange.js', () => ({
  getMarkRange: getMarkRangeMock,
}));

import { getMarksBetween } from './getMarksBetween.js';

describe('getMarksBetween', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('collects marks for collapsed selections using getMarkRange', () => {
    const testDoc = doc(p(em('Hi')));
    const markInstance = testDoc.resolve(1).marks()[0];

    const result = getMarksBetween(1, 1, testDoc);

    expect(getMarkRangeMock).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].mark.type).toBe(markInstance.type);
    expect(result[0]).toMatchObject({ from: 0, to: 2 });
  });

  it('collects marks between two positions', () => {
    const testDoc = doc(p(em('Hi'), ' there'));

    const result = getMarksBetween(1, testDoc.content.size, testDoc);

    const emMark = result.find((item) => item.mark.type === schema.marks.em);
    expect(emMark).toBeDefined();
    expect(emMark.from).toBe(1);
    expect(emMark.to).toBeGreaterThan(emMark.from);
  });
});
