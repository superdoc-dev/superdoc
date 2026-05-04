import { describe, it, expect } from 'vitest';
import type { Run, TextRun, TrackedChangeMeta } from './index.js';
import { expandRunsForInlineNewlines } from './run-helpers.js';

describe('expandRunsForInlineNewlines', () => {
  const makeRun = (text: string, pmStart = 0): TextRun => ({
    text,
    fontFamily: 'Arial',
    fontSize: 12,
    pmStart,
    pmEnd: pmStart + text.length,
  });

  it('returns runs without inline newlines unchanged', () => {
    const runs: Run[] = [makeRun('hello')];
    expect(expandRunsForInlineNewlines(runs)).toEqual(runs);
  });

  it('splits a text run at a single inline newline', () => {
    const result = expandRunsForInlineNewlines([makeRun('foo\nbar')]);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ text: 'foo', pmStart: 0, pmEnd: 3 });
    expect(result[1]).toMatchObject({ kind: 'break', pmStart: 3, pmEnd: 4 });
    expect(result[2]).toMatchObject({ text: 'bar', pmStart: 4, pmEnd: 7 });
  });

  it('keeps the break and advances the cursor for a leading newline', () => {
    const result = expandRunsForInlineNewlines([makeRun('\nfoo')]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ kind: 'break', pmStart: 0, pmEnd: 1 });
    expect(result[1]).toMatchObject({ text: 'foo', pmStart: 1, pmEnd: 4 });
  });

  it('keeps both breaks when a run contains consecutive inline newlines', () => {
    const result = expandRunsForInlineNewlines([makeRun('a\n\nb')]);
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ text: 'a', pmStart: 0, pmEnd: 1 });
    expect(result[1]).toMatchObject({ kind: 'break', pmStart: 1, pmEnd: 2 });
    expect(result[2]).toMatchObject({ kind: 'break', pmStart: 2, pmEnd: 3 });
    expect(result[3]).toMatchObject({ text: 'b', pmStart: 3, pmEnd: 4 });
  });

  it('does not emit an empty trailing text run for a trailing newline', () => {
    const result = expandRunsForInlineNewlines([makeRun('foo\n')]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ text: 'foo', pmStart: 0, pmEnd: 3 });
    expect(result[1]).toMatchObject({ kind: 'break', pmStart: 3, pmEnd: 4 });
  });

  it('propagates trackedChange metadata onto emitted break runs', () => {
    const trackedChange: TrackedChangeMeta = {
      id: 'change-1',
      kind: 'insert',
      author: 'alice',
      date: '2024-01-01T00:00:00Z',
    };
    const run: TextRun = { ...makeRun('foo\nbar'), trackedChange };
    const result = expandRunsForInlineNewlines([run]);
    expect(result[1]).toMatchObject({ kind: 'break', trackedChange });
  });
});
