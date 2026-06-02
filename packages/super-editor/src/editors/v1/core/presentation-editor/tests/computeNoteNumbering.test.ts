import { describe, it, expect } from 'vitest';
import type { EditorState } from 'prosemirror-state';
import { computeNoteNumbering, isCustomMarkFollows, type SectionNoteConfig } from '../layout/computeNoteNumbering.js';

type Step = { kind: 'ref'; id: string; type?: string; customMarkFollows?: unknown } | { kind: 'sectionBreak' };

function makeEditorState(steps: Step[]): EditorState {
  return {
    doc: {
      content: { size: 1000 },
      descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
        let pos = 0;
        for (const step of steps) {
          if (step.kind === 'sectionBreak') {
            cb({ type: { name: 'sectionBreak' }, attrs: {} }, pos);
          } else {
            cb(
              {
                type: { name: step.type ?? 'footnoteReference' },
                attrs: { id: step.id, customMarkFollows: step.customMarkFollows },
              },
              pos,
            );
          }
          pos += 1;
        }
        return false;
      },
    },
  } as unknown as EditorState;
}

const opts = (over: Partial<Parameters<typeof computeNoteNumbering>[2]> = {}) => ({
  startCounter: 1,
  ...over,
});

describe('computeNoteNumbering — basic numbering (§17.11.20)', () => {
  it('returns empty when editorState is null/undefined', () => {
    expect(computeNoteNumbering(null, 'footnoteReference', opts())).toEqual({ numberById: {}, order: [] });
    expect(computeNoteNumbering(undefined, 'footnoteReference', opts())).toEqual({ numberById: {}, order: [] });
  });

  it('numbers refs by first appearance starting from startCounter', () => {
    const state = makeEditorState([
      { kind: 'ref', id: '1' },
      { kind: 'ref', id: '2' },
      { kind: 'ref', id: '3' },
    ]);
    expect(computeNoteNumbering(state, 'footnoteReference', opts()).numberById).toEqual({
      '1': 1,
      '2': 2,
      '3': 3,
    });
    expect(computeNoteNumbering(state, 'footnoteReference', opts({ startCounter: 5 })).numberById).toEqual({
      '1': 5,
      '2': 6,
      '3': 7,
    });
  });

  it('dedupes by id (multiple refs to the same id keep the first number)', () => {
    const state = makeEditorState([
      { kind: 'ref', id: '1' },
      { kind: 'ref', id: '1' },
      { kind: 'ref', id: '2' },
    ]);
    expect(computeNoteNumbering(state, 'footnoteReference', opts()).numberById).toEqual({ '1': 1, '2': 2 });
  });

  it('preserves order even when ids repeat', () => {
    const state = makeEditorState([
      { kind: 'ref', id: '5' },
      { kind: 'ref', id: '3' },
      { kind: 'ref', id: '5' },
    ]);
    expect(computeNoteNumbering(state, 'footnoteReference', opts()).order).toEqual(['5', '3']);
  });

  it('targets only the requested noteTypeName (ignores other note types)', () => {
    const state = makeEditorState([
      { kind: 'ref', id: '1', type: 'footnoteReference' },
      { kind: 'ref', id: '2', type: 'endnoteReference' },
      { kind: 'ref', id: '3', type: 'footnoteReference' },
    ]);
    expect(computeNoteNumbering(state, 'footnoteReference', opts()).numberById).toEqual({ '1': 1, '3': 2 });
    expect(computeNoteNumbering(state, 'endnoteReference', opts()).numberById).toEqual({ '2': 1 });
  });
});

describe('computeNoteNumbering — §17.11.14 customMarkFollows', () => {
  it('refs with customMarkFollows do not consume an ordinal', () => {
    const state = makeEditorState([
      { kind: 'ref', id: '1' },
      { kind: 'ref', id: '2', customMarkFollows: '1' },
      { kind: 'ref', id: '3' },
    ]);
    const result = computeNoteNumbering(state, 'footnoteReference', opts());
    expect(result.numberById).toEqual({ '1': 1, '3': 2 });
    expect(result.order).toEqual(['1', '2', '3']);
  });

  it('spec example: I, [custom], II with numStart=1', () => {
    const state = makeEditorState([
      { kind: 'ref', id: 'a' },
      { kind: 'ref', id: 'b', customMarkFollows: true },
      { kind: 'ref', id: 'c' },
    ]);
    const result = computeNoteNumbering(state, 'footnoteReference', opts());
    expect(result.numberById['a']).toBe(1);
    expect(result.numberById['b']).toBeUndefined();
    expect(result.numberById['c']).toBe(2);
  });
});

describe('computeNoteNumbering — §17.11.19 numRestart=eachSect', () => {
  it('resets counter to numStart at each section boundary', () => {
    const state = makeEditorState([
      { kind: 'ref', id: 'a' },
      { kind: 'ref', id: 'b' },
      { kind: 'sectionBreak' },
      { kind: 'ref', id: 'c' },
      { kind: 'ref', id: 'd' },
      { kind: 'sectionBreak' },
      { kind: 'ref', id: 'e' },
    ]);
    const result = computeNoteNumbering(state, 'footnoteReference', opts({ defaultRestart: 'eachSect' }));
    expect(result.numberById).toEqual({ a: 1, b: 2, c: 1, d: 2, e: 1 });
  });

  it('continuous (default) does NOT reset', () => {
    const state = makeEditorState([{ kind: 'ref', id: 'a' }, { kind: 'sectionBreak' }, { kind: 'ref', id: 'b' }]);
    expect(computeNoteNumbering(state, 'footnoteReference', opts()).numberById).toEqual({ a: 1, b: 2 });
  });

  it('section-level numRestart overrides document default', () => {
    const state = makeEditorState([
      { kind: 'ref', id: 'a' },
      { kind: 'sectionBreak' },
      { kind: 'ref', id: 'b' },
      { kind: 'ref', id: 'c' },
    ]);
    const sectionConfigs = new Map<number, SectionNoteConfig>([[1, { numRestart: 'eachSect' }]]);
    const result = computeNoteNumbering(state, 'footnoteReference', opts({ sectionConfigs }));
    expect(result.numberById).toEqual({ a: 1, b: 1, c: 2 });
  });

  it('per-section numStart provides the reset value', () => {
    const state = makeEditorState([{ kind: 'ref', id: 'a' }, { kind: 'sectionBreak' }, { kind: 'ref', id: 'b' }]);
    const sectionConfigs = new Map<number, SectionNoteConfig>([[1, { numRestart: 'eachSect', numStart: 10 }]]);
    const result = computeNoteNumbering(state, 'footnoteReference', opts({ sectionConfigs }));
    expect(result.numberById).toEqual({ a: 1, b: 10 });
  });

  it('seeds counter from section-0 numStart override before any section boundary', () => {
    // §17.11.11: a single-section doc with w:footnotePr/w:numStart=5 must
    // start its first note at 5, not at the document-level startCounter.
    // Pre-fix: counter started from options.startCounter (=1) and section-0
    // overrides were only consulted when a later section boundary triggered
    // a reset, which never happens in a single-section doc.
    const state = makeEditorState([
      { kind: 'ref', id: 'a' },
      { kind: 'ref', id: 'b' },
      { kind: 'ref', id: 'c' },
    ]);
    const sectionConfigs = new Map<number, SectionNoteConfig>([[0, { numStart: 5 }]]);
    const result = computeNoteNumbering(state, 'footnoteReference', opts({ sectionConfigs }));
    expect(result.numberById).toEqual({ a: 5, b: 6, c: 7 });
  });
});

describe('computeNoteNumbering — §17.11.19 numRestart=eachPage', () => {
  it('resets counter at page boundaries when refPageById provided', () => {
    const state = makeEditorState([
      { kind: 'ref', id: 'a' },
      { kind: 'ref', id: 'b' },
      { kind: 'ref', id: 'c' },
      { kind: 'ref', id: 'd' },
    ]);
    const refPageById = new Map<string, number>([
      ['a', 0],
      ['b', 0],
      ['c', 1],
      ['d', 1],
    ]);
    const result = computeNoteNumbering(state, 'footnoteReference', opts({ defaultRestart: 'eachPage', refPageById }));
    expect(result.numberById).toEqual({ a: 1, b: 2, c: 1, d: 2 });
  });

  it('eachPage without refPageById falls back to continuous (first-pass fallback)', () => {
    const state = makeEditorState([
      { kind: 'ref', id: 'a' },
      { kind: 'ref', id: 'b' },
      { kind: 'ref', id: 'c' },
    ]);
    expect(computeNoteNumbering(state, 'footnoteReference', opts({ defaultRestart: 'eachPage' })).numberById).toEqual({
      a: 1,
      b: 2,
      c: 3,
    });
  });

  it('section-level eachPage overrides document-wide continuous', () => {
    const state = makeEditorState([
      { kind: 'ref', id: 'a' },
      { kind: 'ref', id: 'b' },
      { kind: 'sectionBreak' },
      { kind: 'ref', id: 'c' },
      { kind: 'ref', id: 'd' },
    ]);
    const sectionConfigs = new Map<number, SectionNoteConfig>([[1, { numRestart: 'eachPage' }]]);
    const refPageById = new Map<string, number>([
      ['a', 0],
      ['b', 0],
      ['c', 1],
      ['d', 2],
    ]);
    const result = computeNoteNumbering(state, 'footnoteReference', opts({ sectionConfigs, refPageById }));
    // section 0 = continuous (a, b numbered 1, 2). section 1 = eachPage (c → 1 fresh page; d → 1 new page reset).
    expect(result.numberById).toEqual({ a: 1, b: 2, c: 1, d: 1 });
  });

  it('eachPage with per-section numStart resets to that value', () => {
    const state = makeEditorState([
      { kind: 'ref', id: 'a' },
      { kind: 'ref', id: 'b' },
    ]);
    const sectionConfigs = new Map<number, SectionNoteConfig>([[0, { numRestart: 'eachPage', numStart: 7 }]]);
    const refPageById = new Map<string, number>([
      ['a', 0],
      ['b', 1],
    ]);
    const result = computeNoteNumbering(state, 'footnoteReference', opts({ sectionConfigs, refPageById }));
    // §17.11.11: section-0 numStart applies to refs on page 0 too (initial
    // seed), and is the reset value at every page boundary thereafter.
    expect(result.numberById).toEqual({ a: 7, b: 7 });
  });
});

describe('computeNoteNumbering — §17.11.11 + §17.11.18 per-section numFmt', () => {
  it('emits formatById when a section overrides numFmt', () => {
    const state = makeEditorState([{ kind: 'ref', id: 'a' }, { kind: 'sectionBreak' }, { kind: 'ref', id: 'b' }]);
    const sectionConfigs = new Map<number, SectionNoteConfig>([[1, { numFmt: 'upperRoman' }]]);
    const result = computeNoteNumbering(state, 'footnoteReference', opts({ defaultNumFmt: 'decimal', sectionConfigs }));
    expect(result.numberById).toEqual({ a: 1, b: 2 });
    expect(result.formatById).toEqual({ a: 'decimal', b: 'upperRoman' });
  });

  it('omits formatById when no section overrides exist (backwards compat)', () => {
    const state = makeEditorState([{ kind: 'ref', id: 'a' }, { kind: 'sectionBreak' }, { kind: 'ref', id: 'b' }]);
    const result = computeNoteNumbering(state, 'footnoteReference', opts({ defaultNumFmt: 'decimal' }));
    expect(result.formatById).toBeUndefined();
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
