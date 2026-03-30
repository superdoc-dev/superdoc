import { describe, it, expect } from 'vitest';
import { diffSequences } from './sequence-diffing.ts';

const buildAdded = (item) => ({ action: 'added', id: item.id });
const buildDeleted = (item) => ({ action: 'deleted', id: item.id });
const buildModified = (oldItem, newItem) => ({
  action: 'modified',
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
      shouldProcessEqualAsModification: (oldItem, newItem) => oldItem.value !== newItem.value,
      buildAdded,
      buildDeleted,
      buildModified,
    });

    expect(diffs).toEqual([{ action: 'modified', id: 'b', from: 'World', to: 'World!!!' }]);
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
      shouldProcessEqualAsModification: () => false,
      buildAdded,
      buildDeleted,
      buildModified,
    });

    expect(diffs).toEqual([{ action: 'modified', id: 'b', from: 'Beta', to: 'Beta v2' }]);
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
      { action: 'deleted', id: 'a' },
      { action: 'added', id: 'b' },
    ]);
  });
});
