import { describe, it, expect } from 'vitest';
import { diffSequences } from './sequence-diffing.js';

const buildAdded = (item) => ({ type: 'added', id: item.id });
const buildDeleted = (item) => ({ type: 'deleted', id: item.id });
const buildModified = (oldItem, newItem) => ({
  type: 'modified',
  id: oldItem.id ?? newItem.id,
  from: oldItem.value,
  to: newItem.value,
});

describe('diffSequences', () => {
  it('detects modifications for equal-aligned items when requested', () => {
    const oldSeq = [
      { id: 'a', value: 'Hello' },
      { id: 'b', value: 'World' },
    ];
    const newSeq = [
      { id: 'a', value: 'Hello' },
      { id: 'b', value: 'World!!!' },
    ];

    const diffs = diffSequences(oldSeq, newSeq, {
      comparator: (a, b) => a.id === b.id,
      shouldProcessEqual: (oldItem, newItem) => oldItem.value !== newItem.value,
      buildAdded,
      buildDeleted,
      buildModified,
    });

    expect(diffs).toEqual([{ type: 'modified', id: 'b', from: 'World', to: 'World!!!' }]);
  });

  it('pairs delete/insert operations into modifications when allowed', () => {
    const oldSeq = [
      { id: 'a', value: 'Alpha' },
      { id: 'b', value: 'Beta' },
    ];
    const newSeq = [
      { id: 'a', value: 'Alpha' },
      { id: 'c', value: 'Beta v2' },
    ];

    const diffs = diffSequences(oldSeq, newSeq, {
      comparator: (a, b) => a.id === b.id,
      canTreatAsModification: (oldItem, newItem) => oldItem.value[0] === newItem.value[0],
      shouldProcessEqual: () => false,
      buildAdded,
      buildDeleted,
      buildModified,
    });

    expect(diffs).toEqual([{ type: 'modified', id: 'b', from: 'Beta', to: 'Beta v2' }]);
  });

  it('emits additions and deletions when items cannot be paired', () => {
    const oldSeq = [{ id: 'a', value: 'Foo' }];
    const newSeq = [{ id: 'b', value: 'Bar' }];

    const diffs = diffSequences(oldSeq, newSeq, {
      comparator: (a, b) => a.id === b.id,
      buildAdded,
      buildDeleted,
      buildModified,
    });

    expect(diffs).toEqual([
      { type: 'deleted', id: 'a' },
      { type: 'added', id: 'b' },
    ]);
  });
});
