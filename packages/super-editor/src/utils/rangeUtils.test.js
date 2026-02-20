import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';

import {
  collectChangedRanges,
  collectChangedRangesThroughTransactions,
  clampRange,
  mapRangesThroughTransactions,
  mergeRanges,
} from './rangeUtils.js';

const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      text: { group: 'inline' },
    },
    marks: {
      bold: {},
    },
  });

const createStateWithText = (schema, text) =>
  EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.node('paragraph', null, schema.text(text))]),
  });

describe('rangeUtils', () => {
  it('mergeRanges returns empty array for empty input', () => {
    expect(mergeRanges([], 100)).toEqual([]);
  });

  it('mergeRanges returns single range unchanged', () => {
    expect(mergeRanges([{ from: 1, to: 5 }], 100)).toEqual([{ from: 1, to: 5 }]);
  });

  it('mergeRanges merges overlapping ranges', () => {
    expect(
      mergeRanges(
        [
          { from: 1, to: 5 },
          { from: 3, to: 8 },
        ],
        100,
      ),
    ).toEqual([{ from: 1, to: 8 }]);
  });

  it('mergeRanges merges adjacent ranges', () => {
    expect(
      mergeRanges(
        [
          { from: 1, to: 5 },
          { from: 5, to: 10 },
        ],
        100,
      ),
    ).toEqual([{ from: 1, to: 10 }]);
  });

  it('mergeRanges keeps non-overlapping ranges separate', () => {
    expect(
      mergeRanges(
        [
          { from: 1, to: 3 },
          { from: 5, to: 8 },
          { from: 10, to: 15 },
        ],
        100,
      ),
    ).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 8 },
      { from: 10, to: 15 },
    ]);
  });

  it('mergeRanges sorts ranges before merging', () => {
    expect(
      mergeRanges(
        [
          { from: 10, to: 15 },
          { from: 1, to: 5 },
          { from: 3, to: 8 },
        ],
        100,
      ),
    ).toEqual([
      { from: 1, to: 8 },
      { from: 10, to: 15 },
    ]);
  });

  it('mergeRanges merges when one range is contained within another', () => {
    expect(
      mergeRanges(
        [
          { from: 1, to: 10 },
          { from: 3, to: 5 },
        ],
        100,
      ),
    ).toEqual([{ from: 1, to: 10 }]);
  });

  it('mergeRanges drops zero-length ranges', () => {
    expect(
      mergeRanges(
        [
          { from: 5, to: 5 },
          { from: 5, to: 10 },
        ],
        100,
      ),
    ).toEqual([{ from: 5, to: 10 }]);
  });

  it('mergeRanges does not mutate original array', () => {
    const original = [
      { from: 5, to: 10 },
      { from: 1, to: 3 },
    ];
    const copy = JSON.parse(JSON.stringify(original));
    mergeRanges(original, 100);
    expect(original).toEqual(copy);
  });

  it('mergeRanges clamps, drops invalid, and merges overlaps', () => {
    const ranges = [
      { from: -2, to: 2 },
      { from: 2, to: 4 },
      { from: 5, to: 5 },
      { from: 10, to: 8 },
    ];

    expect(mergeRanges(ranges, 6)).toEqual([{ from: 0, to: 4 }]);
  });

  it('clampRange returns range unchanged when within bounds', () => {
    expect(clampRange(10, 20, 100)).toEqual({ start: 10, end: 20 });
  });

  it('clampRange clamps start to 0 when negative', () => {
    expect(clampRange(-5, 20, 100)).toEqual({ start: 0, end: 20 });
  });

  it('clampRange clamps end to docSize when exceeding', () => {
    expect(clampRange(10, 150, 100)).toEqual({ start: 10, end: 100 });
  });

  it('clampRange returns null for invalid range (start >= end)', () => {
    expect(clampRange(50, 50, 100)).toBeNull();
  });

  it('collectChangedRanges returns mapping-map ranges only', () => {
    const schema = makeSchema();
    const state = createStateWithText(schema, 'hello');
    const tr = state.tr.insertText('X', 1);
    const nextState = state.apply(tr);

    expect(collectChangedRanges([tr], nextState.doc.content.size)).toEqual([{ from: 1, to: 2 }]);
  });

  it('mapRangesThroughTransactions remaps ranges through inserts', () => {
    const schema = makeSchema();
    const state = createStateWithText(schema, 'hello');
    const tr = state.tr.insertText('X', 1);
    const nextState = state.apply(tr);

    const mapped = mapRangesThroughTransactions([{ from: 2, to: 4 }], [tr], nextState.doc.content.size);
    expect(mapped).toEqual([{ from: 3, to: 5 }]);
  });

  it('collectChangedRangesThroughTransactions maps step ranges through later transactions', () => {
    const schema = makeSchema();
    const state = createStateWithText(schema, 'hello');
    const tr1 = state.tr.addMark(1, 3, schema.marks.bold.create());
    const state1 = state.apply(tr1);
    const tr2 = state1.tr.insertText('X', 1);
    const state2 = state1.apply(tr2);

    const ranges = collectChangedRangesThroughTransactions([tr1, tr2], state2.doc.content.size);

    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.some((range) => range.from <= 2 && range.to >= 4)).toBe(true);
  });

  it('collectChangedRangesThroughTransactions maps extraRanges through all transactions', () => {
    const schema = makeSchema();
    const state = createStateWithText(schema, 'hello');
    const tr = state.tr.insertText('X', 1);
    const nextState = state.apply(tr);

    const ranges = collectChangedRangesThroughTransactions([tr], nextState.doc.content.size, {
      extraRanges: [{ from: 2, to: 3 }],
    });

    expect(ranges.some((range) => range.from === 3 && range.to === 4)).toBe(true);
  });
});
