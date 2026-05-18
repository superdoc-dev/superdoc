import { describe, it, expect } from 'vitest';
import type { EditorState } from 'prosemirror-state';
import { computeNoteNumbering, isCustomMarkFollows } from '../layout/computeNoteNumbering.js';

function makeEditorState(
  refs: Array<{ id: string; pos: number; type?: string; customMarkFollows?: unknown }>,
): EditorState {
  return {
    doc: {
      content: { size: 1000 },
      descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
        for (const r of refs) {
          cb(
            {
              type: { name: r.type ?? 'footnoteReference' },
              attrs: { id: r.id, customMarkFollows: r.customMarkFollows },
            },
            r.pos,
          );
        }
        return false;
      },
    },
  } as unknown as EditorState;
}

describe('computeNoteNumbering — §17.11.14 + §17.11.20', () => {
  it('returns empty when editorState is null/undefined', () => {
    expect(computeNoteNumbering(null, 'footnoteReference', 1)).toEqual({ numberById: {}, order: [] });
    expect(computeNoteNumbering(undefined, 'footnoteReference', 1)).toEqual({ numberById: {}, order: [] });
  });

  it('numbers refs by first appearance starting from startCounter', () => {
    const state = makeEditorState([
      { id: '1', pos: 10 },
      { id: '2', pos: 20 },
      { id: '3', pos: 30 },
    ]);
    expect(computeNoteNumbering(state, 'footnoteReference', 1).numberById).toEqual({ '1': 1, '2': 2, '3': 3 });
    expect(computeNoteNumbering(state, 'footnoteReference', 5).numberById).toEqual({ '1': 5, '2': 6, '3': 7 });
  });

  it('dedupes by id (multiple refs to the same id keep the first number)', () => {
    const state = makeEditorState([
      { id: '1', pos: 10 },
      { id: '1', pos: 50 },
      { id: '2', pos: 100 },
    ]);
    expect(computeNoteNumbering(state, 'footnoteReference', 1).numberById).toEqual({ '1': 1, '2': 2 });
  });

  it('preserves order even when ids repeat', () => {
    const state = makeEditorState([
      { id: '5', pos: 10 },
      { id: '3', pos: 20 },
      { id: '5', pos: 30 },
    ]);
    expect(computeNoteNumbering(state, 'footnoteReference', 1).order).toEqual(['5', '3']);
  });

  it('§17.11.14: customMarkFollows refs do not consume an ordinal', () => {
    const state = makeEditorState([
      { id: '1', pos: 10 },
      { id: '2', pos: 20, customMarkFollows: '1' },
      { id: '3', pos: 30 },
    ]);
    const result = computeNoteNumbering(state, 'footnoteReference', 1);
    // id=2 has no number (custom mark renders in body); id=3 takes ordinal 2
    expect(result.numberById).toEqual({ '1': 1, '3': 2 });
    expect(result.order).toEqual(['1', '2', '3']);
  });

  it('§17.11.14 spec example: I, [custom], II with numStart=1', () => {
    const state = makeEditorState([
      { id: 'a', pos: 10 },
      { id: 'b', pos: 20, customMarkFollows: true },
      { id: 'c', pos: 30 },
    ]);
    const result = computeNoteNumbering(state, 'footnoteReference', 1);
    expect(result.numberById['a']).toBe(1);
    expect(result.numberById['b']).toBeUndefined();
    expect(result.numberById['c']).toBe(2);
  });

  it('respects startCounter when followed by a customMark ref', () => {
    const state = makeEditorState([
      { id: 'a', pos: 10, customMarkFollows: '1' },
      { id: 'b', pos: 20 },
    ]);
    expect(computeNoteNumbering(state, 'footnoteReference', 7).numberById).toEqual({ b: 7 });
  });

  it('targets only the requested noteTypeName (ignores other note types)', () => {
    const state = makeEditorState([
      { id: '1', pos: 10, type: 'footnoteReference' },
      { id: '2', pos: 20, type: 'endnoteReference' },
      { id: '3', pos: 30, type: 'footnoteReference' },
    ]);
    expect(computeNoteNumbering(state, 'footnoteReference', 1).numberById).toEqual({ '1': 1, '3': 2 });
    expect(computeNoteNumbering(state, 'endnoteReference', 1).numberById).toEqual({ '2': 1 });
  });
});

describe('isCustomMarkFollows — OOXML on/off parsing', () => {
  it.each([
    [true, true],
    [1, true],
    ['1', true],
    ['true', true],
    ['on', true],
    ['TRUE', true],
    [' 1 ', true],
    [false, false],
    [0, false],
    ['0', false],
    ['false', false],
    ['off', false],
    [undefined, false],
    [null, false],
    [{}, false],
  ])('isCustomMarkFollows(%j) === %j', (input, expected) => {
    expect(isCustomMarkFollows(input)).toBe(expected);
  });
});
