import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapturedStyle, CapturedRun } from './style-resolver.js';
import { buildStyleSummary, queryMatchAdapter } from './query-match-adapter.js';

// ---------------------------------------------------------------------------
// Module mocks — intercept dependencies of queryMatchAdapter
// ---------------------------------------------------------------------------

const mockedDeps = vi.hoisted(() => ({
  findAdapter: vi.fn(),
  getBlockIndex: vi.fn(),
  captureRunsInRange: vi.fn(),
  getRevision: vi.fn(() => 'rev-1'),
}));

vi.mock('../find-adapter.js', () => ({
  findAdapter: mockedDeps.findAdapter,
}));

vi.mock('../helpers/index-cache.js', () => ({
  getBlockIndex: mockedDeps.getBlockIndex,
}));

vi.mock('./style-resolver.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./style-resolver.js')>();
  return {
    ...orig,
    captureRunsInRange: mockedDeps.captureRunsInRange,
  };
});

vi.mock('./revision-tracker.js', () => ({
  getRevision: mockedDeps.getRevision,
}));

// ---------------------------------------------------------------------------
// Helpers to build mock captured styles
// ---------------------------------------------------------------------------

function mockMark(name: string) {
  return {
    type: { name, create: () => mockMark(name) },
    attrs: {},
    eq: (other: any) => other.type.name === name,
  };
}

function run(from: number, to: number, markNames: string[]): CapturedRun {
  return {
    from,
    to,
    charCount: to - from,
    marks: markNames.map(mockMark) as any,
  };
}

function captured(runs: CapturedRun[], isUniform: boolean): CapturedStyle {
  return { runs, isUniform };
}

// ---------------------------------------------------------------------------
// buildStyleSummary — unit tests
// ---------------------------------------------------------------------------

describe('buildStyleSummary', () => {
  it('reports all marks from a uniform bold+italic range', () => {
    const style = buildStyleSummary(captured([run(0, 10, ['bold', 'italic'])], true));
    expect(style.marks).toEqual({ bold: true, italic: true });
    expect(style.isUniform).toBe(true);
  });

  it('reports no marks for unstyled text', () => {
    const style = buildStyleSummary(captured([run(0, 10, [])], true));
    expect(style.marks).toEqual({});
    expect(style.isUniform).toBe(true);
  });

  it('reports marks by majority rule for non-uniform ranges', () => {
    // 8 chars bold, 2 chars not bold → bold wins (>50%)
    const style = buildStyleSummary(captured([run(0, 8, ['bold']), run(8, 10, [])], false));
    expect(style.marks).toEqual({ bold: true });
    expect(style.isUniform).toBe(false);
  });

  it('reports mark as false when minority of text has it', () => {
    // 2 chars bold, 8 chars not bold → bold loses
    const style = buildStyleSummary(captured([run(0, 2, ['bold']), run(2, 10, [])], false));
    expect(style.marks).toEqual({ bold: false });
    expect(style.isUniform).toBe(false);
  });

  it('reports mark as false on exact 50/50 tie', () => {
    const style = buildStyleSummary(captured([run(0, 5, ['bold']), run(5, 10, [])], false));
    expect(style.marks).toEqual({ bold: false });
  });

  it('handles multiple marks independently', () => {
    // bold: 8/10 chars → true, italic: 3/10 chars → false, underline: 10/10 → true
    const style = buildStyleSummary(
      captured(
        [
          run(0, 8, ['bold', 'underline']),
          run(8, 10, ['italic', 'underline']),
          run(10, 10, []), // zero-width, doesn't affect counts
        ],
        false,
      ),
    );
    // Bold: 8/10 > 50% → true
    // Italic: 2/10 < 50% → false
    // Underline: 10/10 > 50% → true
    expect(style.marks.bold).toBe(true);
    expect(style.marks.italic).toBe(false);
    expect(style.marks.underline).toBe(true);
  });

  it('returns empty marks for empty runs', () => {
    const style = buildStyleSummary(captured([], true));
    expect(style.marks).toEqual({});
    expect(style.isUniform).toBe(true);
  });

  it('only reports core marks (ignores non-core like textStyle)', () => {
    const style = buildStyleSummary(captured([run(0, 10, ['bold', 'textStyle'])], true));
    // textStyle is not in CORE_MARK_NAMES so it should not appear
    expect(style.marks).toEqual({ bold: true });
    expect(style.marks).not.toHaveProperty('textStyle');
  });
});

// ---------------------------------------------------------------------------
// queryMatchAdapter — behavioral integration tests
// ---------------------------------------------------------------------------

describe('queryMatchAdapter (behavioral)', () => {
  const dummyEditor = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('rev-1');
  });

  function setupFindResult(options: { matches: any[]; context?: any[]; total: number }) {
    mockedDeps.findAdapter.mockReturnValue({
      matches: options.matches,
      context: options.context ?? [],
      total: options.total,
    });
  }

  function setupBlockIndex(candidates: Array<{ nodeId: string; pos: number }>) {
    mockedDeps.getBlockIndex.mockReturnValue({ candidates });
  }

  it('includes style summary on matches when includeStyle is true', () => {
    const boldRun = run(0, 5, ['bold']);
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [
        {
          textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }],
        },
      ],
      total: 1,
    });
    setupBlockIndex([{ nodeId: 'p1', pos: 0 }]);
    mockedDeps.captureRunsInRange.mockReturnValue(captured([boldRun], true));

    const result = queryMatchAdapter(dummyEditor, {
      select: { type: 'text', pattern: 'Hello' },
      includeStyle: true,
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].style).toBeDefined();
    expect(result.matches[0].style!.marks).toEqual({ bold: true });
    expect(result.matches[0].style!.isUniform).toBe(true);
  });

  it('omits style summary when includeStyle is false', () => {
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [
        {
          textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }],
        },
      ],
      total: 1,
    });

    const result = queryMatchAdapter(dummyEditor, {
      select: { type: 'text', pattern: 'Hello' },
      includeStyle: false,
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].style).toBeUndefined();
    // captureRunsInRange should not be called
    expect(mockedDeps.captureRunsInRange).not.toHaveBeenCalled();
  });

  it('omits style when includeStyle is true but match has no textRanges', () => {
    setupFindResult({
      matches: [{ kind: 'block', nodeId: 'p1' }],
      context: [{}], // no textRanges
      total: 1,
    });

    const result = queryMatchAdapter(dummyEditor, {
      select: { type: 'node', nodeType: 'paragraph' },
      includeStyle: true,
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].style).toBeUndefined();
  });

  it('reports non-uniform style across multi-run match', () => {
    const boldRun = run(0, 3, ['bold']);
    const plainRun = run(3, 5, []);
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [
        {
          textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }],
        },
      ],
      total: 1,
    });
    setupBlockIndex([{ nodeId: 'p1', pos: 0 }]);
    mockedDeps.captureRunsInRange.mockReturnValue(captured([boldRun, plainRun], false));

    const result = queryMatchAdapter(dummyEditor, {
      select: { type: 'text', pattern: 'Hello' },
      includeStyle: true,
    });

    expect(result.matches[0].style).toBeDefined();
    // bold: 3/5 > 50% → true
    expect(result.matches[0].style!.marks.bold).toBe(true);
    expect(result.matches[0].style!.isUniform).toBe(false);
  });

  it('captures style across multiple textRanges in a single match', () => {
    // Simulates a match split across two inline runs (same block)
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [
        {
          textRanges: [
            { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } },
            { kind: 'text', blockId: 'p1', range: { start: 3, end: 7 } },
          ],
        },
      ],
      total: 1,
    });
    setupBlockIndex([{ nodeId: 'p1', pos: 0 }]);

    // First range: bold, second range: bold+italic
    mockedDeps.captureRunsInRange
      .mockReturnValueOnce(captured([run(0, 3, ['bold'])], true))
      .mockReturnValueOnce(captured([run(3, 7, ['bold', 'italic'])], true));

    const result = queryMatchAdapter(dummyEditor, {
      select: { type: 'text', pattern: 'Hello w' },
      includeStyle: true,
    });

    expect(result.matches[0].style).toBeDefined();
    // bold: 7/7 (all chars) → true
    expect(result.matches[0].style!.marks.bold).toBe(true);
    // italic: 4/7 > 50% → true
    expect(result.matches[0].style!.marks.italic).toBe(true);
    // Cross-range uniformity: runs have different marks → not uniform
    expect(result.matches[0].style!.isUniform).toBe(false);
  });

  it('generates ephemeral text ref with revision', () => {
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [
        {
          textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }],
        },
      ],
      total: 1,
    });
    mockedDeps.getRevision.mockReturnValue('rev-42');

    const result = queryMatchAdapter(dummyEditor, {
      select: { type: 'text', pattern: 'Hello' },
    });

    expect(result.evaluatedRevision).toBe('rev-42');
    expect(result.matches[0].ref).toBeDefined();
    expect(result.matches[0].ref!.startsWith('text:')).toBe(true);
    expect(result.matches[0].refStability).toBe('ephemeral');

    // Decode ref to verify it contains revision and ranges
    const decoded = JSON.parse(atob(result.matches[0].ref!.slice(5)));
    expect(decoded.rev).toBe('rev-42');
    expect(decoded.ranges).toHaveLength(1);
  });
});
