import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapturedStyle, CapturedRun } from './style-resolver.js';
import { queryMatchAdapter } from './query-match-adapter.js';
import { SNIPPET_MAX_LENGTH } from '@superdoc/document-api';

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
// Helpers to build mock marks and captured styles
// ---------------------------------------------------------------------------

function mockMark(name: string, attrs: Record<string, unknown> = {}) {
  return {
    type: { name },
    attrs,
    eq(other: any) {
      if (other.type.name !== name) return false;
      const keys = new Set([...Object.keys(attrs), ...Object.keys(other.attrs)]);
      for (const k of keys) {
        if (attrs[k] !== other.attrs[k]) return false;
      }
      return true;
    },
  };
}

function capturedRun(from: number, to: number, markNames: string[]): CapturedRun {
  return {
    from,
    to,
    charCount: to - from,
    marks: markNames.map((n) => mockMark(n)) as any,
  };
}

function captured(runs: CapturedRun[]): CapturedStyle {
  return { runs, isUniform: runs.length <= 1 };
}

// ---------------------------------------------------------------------------
// Mock editor that provides doc.textBetween and doc.nodeAt
// ---------------------------------------------------------------------------

function makeEditor(blockTexts: Map<string, string>) {
  return {
    state: {
      doc: {
        textBetween(from: number, to: number) {
          // The adapter calls textBetween(blockStart, blockEnd) where blockStart = pos+1, blockEnd = end-1
          // We need to map this back to the right block text based on position
          // For simplicity, return a default text; tests set up the index candidates
          // so that pos+1..end-1 maps correctly.
          return '';
        },
        nodeAt(pos: number) {
          return { type: { name: 'paragraph' }, attrs: {} };
        },
      },
    },
  } as any;
}

/**
 * Creates a mock editor that returns blockText for the candidate identified
 * by its pos. The textBetween mock uses pos+1..end-1 range convention.
 */
function makeEditorWithBlocks(
  candidates: Array<{
    nodeId: string;
    pos: number;
    end: number;
    text: string;
    nodeType?: string;
    attrs?: Record<string, unknown>;
  }>,
) {
  const editor = {
    state: {
      doc: {
        textBetween: vi.fn((from: number, to: number) => {
          for (const c of candidates) {
            if (from === c.pos + 1 && to === c.end - 1) return c.text;
          }
          return '';
        }),
        nodeAt: vi.fn((pos: number) => {
          const c = candidates.find((cand) => cand.pos === pos);
          return {
            type: { name: c?.nodeType ?? 'paragraph' },
            attrs: c?.attrs ?? {},
          };
        }),
      },
    },
  } as any;
  return editor;
}

// ---------------------------------------------------------------------------
// Common setup helpers
// ---------------------------------------------------------------------------

/**
 * Builds a FindOutput-shaped mock from legacy-style matches/context arrays.
 * Merges parallel arrays into per-item discovery items as the real findAdapter does.
 */
function setupFindResult(options: { matches: any[]; context?: any[]; total: number }) {
  const contextArr = options.context ?? [];
  const items = options.matches.map((address: any, idx: number) => {
    const item: Record<string, any> = {
      id: `find:${idx}`,
      handle: { ref: `find:${idx}`, refStability: 'ephemeral' as const, targetKind: 'node' as const },
      address,
    };
    if (contextArr[idx]) item.context = contextArr[idx];
    return item;
  });
  mockedDeps.findAdapter.mockReturnValue({
    evaluatedRevision: '',
    total: options.total,
    items,
    page: { limit: options.total, offset: 0, returned: items.length },
  });
}

function setupBlockIndex(candidates: Array<{ nodeId: string; pos: number; end: number }>) {
  mockedDeps.getBlockIndex.mockReturnValue({ candidates });
}

// ---------------------------------------------------------------------------
// Tests: blocks/runs output (D1, D4, D5)
// ---------------------------------------------------------------------------

describe('queryMatchAdapter — blocks/runs output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('rev-1');
  });

  it('emits one block with two runs for a single-block bold heading + plain body match', () => {
    const candidates = [{ nodeId: 'p1', pos: 0, end: 22, text: 'Title Body text here', nodeType: 'paragraph' }];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [{ textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 20 } }] }],
      total: 1,
    });
    // Bold run [0,6) + plain run [6,20)
    mockedDeps.captureRunsInRange.mockReturnValue(captured([capturedRun(0, 6, ['bold']), capturedRun(6, 20, [])]));

    const result = queryMatchAdapter(editor, {
      select: { type: 'text', pattern: 'Title Body text here' },
    });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toEqual({ limit: 1, offset: 0, returned: 1 });
    const match = result.items[0];

    // Text match → blocks is non-empty
    expect(match.blocks.length).toBeGreaterThan(0);
    expect(match.blocks).toHaveLength(1);

    const block = match.blocks[0];
    expect(block.blockId).toBe('p1');
    expect(block.range).toEqual({ start: 0, end: 20 });
    expect(block.runs).toHaveLength(2);

    // First run: bold
    expect(block.runs[0].range).toEqual({ start: 0, end: 6 });
    expect(block.runs[0].styles.bold).toBe(true);

    // Second run: plain
    expect(block.runs[1].range).toEqual({ start: 6, end: 20 });
    expect(block.runs[1].styles.bold).toBe(false);

    // Runs tile block range
    expect(block.runs[0].range.start).toBe(block.range.start);
    expect(block.runs[block.runs.length - 1].range.end).toBe(block.range.end);
  });

  it('emits two blocks for a cross-block match with per-block runs', () => {
    const candidates = [
      { nodeId: 'p1', pos: 0, end: 12, text: 'First block' },
      { nodeId: 'p2', pos: 20, end: 33, text: 'Second block' },
    ];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [
        {
          textRanges: [
            { kind: 'text', blockId: 'p1', range: { start: 0, end: 11 } },
            { kind: 'text', blockId: 'p2', range: { start: 0, end: 12 } },
          ],
        },
      ],
      total: 1,
    });

    // Block 1: one bold run
    // Block 2: one italic run
    mockedDeps.captureRunsInRange
      .mockReturnValueOnce(captured([capturedRun(0, 11, ['bold'])]))
      .mockReturnValueOnce(captured([capturedRun(0, 12, ['italic'])]));

    const result = queryMatchAdapter(editor, {
      select: { type: 'text', pattern: 'First block\\nSecond block' },
    });

    expect(result.items).toHaveLength(1);
    const match = result.items[0];
    expect(match.blocks).toHaveLength(2);

    expect(match.blocks[0].blockId).toBe('p1');
    expect(match.blocks[0].runs).toHaveLength(1);
    expect(match.blocks[0].runs[0].styles.bold).toBe(true);

    expect(match.blocks[1].blockId).toBe('p2');
    expect(match.blocks[1].runs).toHaveLength(1);
    expect(match.blocks[1].runs[0].styles.italic).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: V3 ref emission (D6, Phase 3)
// ---------------------------------------------------------------------------

describe('queryMatchAdapter — V3 ref emission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('rev-42');
  });

  it('emits V3 refs with correct scope and revision', () => {
    const candidates = [{ nodeId: 'p1', pos: 0, end: 12, text: 'Hello world' }];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [{ textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 11 } }] }],
      total: 1,
    });
    mockedDeps.captureRunsInRange.mockReturnValue(captured([capturedRun(0, 11, [])]));

    const result = queryMatchAdapter(editor, {
      select: { type: 'text', pattern: 'Hello world' },
    });

    expect(result.evaluatedRevision).toBe('rev-42');
    const match = result.items[0];

    // Match-level handle
    expect(match.handle.ref.startsWith('text:')).toBe(true);
    expect(match.handle.refStability).toBe('ephemeral');
    expect(match.handle.targetKind).toBe('text');
    const matchRef = JSON.parse(atob(match.handle.ref.slice(5)));
    expect(matchRef.v).toBe(3);
    expect(matchRef.scope).toBe('match');
    expect(matchRef.rev).toBe('rev-42');
    expect(matchRef.segments).toHaveLength(1);

    // Block-level ref
    const block = match.blocks[0];
    const blockRef = JSON.parse(atob(block.ref.slice(5)));
    expect(blockRef.v).toBe(3);
    expect(blockRef.scope).toBe('block');
    expect(blockRef.blockIndex).toBe(0);

    // Run-level ref
    const runRef = JSON.parse(atob(block.runs[0].ref.slice(5)));
    expect(runRef.v).toBe(3);
    expect(runRef.scope).toBe('run');
    expect(runRef.blockIndex).toBe(0);
    expect(runRef.runIndex).toBe(0);
  });

  it('emits ephemeral refStability for text matches', () => {
    const candidates = [{ nodeId: 'p1', pos: 0, end: 7, text: 'Hello' }];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [{ textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }] }],
      total: 1,
    });
    mockedDeps.captureRunsInRange.mockReturnValue(captured([capturedRun(0, 5, [])]));

    const result = queryMatchAdapter(editor, {
      select: { type: 'text', pattern: 'Hello' },
    });

    expect(result.items[0].handle.refStability).toBe('ephemeral');
    expect(result.items[0].handle.targetKind).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// Tests: id (D7)
// ---------------------------------------------------------------------------

describe('queryMatchAdapter — offset-aware id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('rev-1');
  });

  it('uses pagination offset in id (D20: post-filter pagination)', () => {
    // With D20 fix, text selectors don't pass limit/offset to findAdapter.
    // The adapter fetches ALL matches, filters zero-width, then paginates itself.
    // Set up 4 matches; request offset=2, limit=2 → should get items 2 and 3.
    const candidates = [
      { nodeId: 'p1', pos: 0, end: 7, text: 'abc' },
      { nodeId: 'p2', pos: 10, end: 17, text: 'abc' },
      { nodeId: 'p3', pos: 20, end: 27, text: 'abc' },
      { nodeId: 'p4', pos: 30, end: 37, text: 'abc' },
    ];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    setupFindResult({
      matches: [
        { kind: 'text', blockId: 'p1' },
        { kind: 'text', blockId: 'p2' },
        { kind: 'text', blockId: 'p3' },
        { kind: 'text', blockId: 'p4' },
      ],
      context: [
        { textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } }] },
        { textRanges: [{ kind: 'text', blockId: 'p2', range: { start: 0, end: 3 } }] },
        { textRanges: [{ kind: 'text', blockId: 'p3', range: { start: 0, end: 3 } }] },
        { textRanges: [{ kind: 'text', blockId: 'p4', range: { start: 0, end: 3 } }] },
      ],
      total: 4,
    });
    mockedDeps.captureRunsInRange.mockReturnValue(captured([capturedRun(0, 3, [])]));

    const result = queryMatchAdapter(editor, {
      select: { type: 'text', pattern: 'abc' },
      limit: 2,
      offset: 2,
    });

    // Should return 2 items from the paginated window
    expect(result.items).toHaveLength(2);
    // ids reflect the user-facing offset: m:2 and m:3
    expect(result.items[0].id).toBe('m:2');
    expect(result.items[1].id).toBe('m:3');
    // total is the full filtered count (all 4 are non-zero-width)
    expect(result.total).toBe(4);
    expect(result.page).toEqual({ limit: 2, offset: 2, returned: 2 });
  });
});

// ---------------------------------------------------------------------------
// Tests: node-selector matches (D13, D18)
// ---------------------------------------------------------------------------

describe('queryMatchAdapter — node-selector matches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('rev-1');
  });

  it('returns empty blocks, stable ref, no snippet for block-level node matches', () => {
    setupFindResult({
      matches: [{ kind: 'block', nodeId: 'p1' }],
      context: [{}],
      total: 1,
    });

    const dummyEditor = {} as any;

    const result = queryMatchAdapter(dummyEditor, {
      select: { type: 'node', nodeType: 'paragraph' },
    });

    expect(result.items).toHaveLength(1);
    const match = result.items[0];
    expect(match.blocks).toEqual([]);
    expect(match.handle.refStability).toBe('stable');
    expect(match.handle.ref).toBe('p1');
    expect(match.handle.targetKind).toBe('node');
    // Node match: no snippet or highlightRange
    expect((match as any).snippet).toBeUndefined();
    expect((match as any).highlightRange).toBeUndefined();
  });

  it('returns ephemeral V3 ref for inline node matches', () => {
    // Inline nodes (e.g., images) have anchor-based addresses, not stable nodeIds.
    // The ref must be ephemeral since anchor offsets are position-dependent.
    setupFindResult({
      matches: [
        {
          kind: 'inline',
          nodeType: 'image',
          anchor: {
            start: { blockId: 'p1', offset: 5 },
            end: { blockId: 'p1', offset: 6 },
          },
        },
      ],
      context: [{}],
      total: 1,
    });

    const dummyEditor = {} as any;
    mockedDeps.getRevision.mockReturnValue('rev-10');

    const result = queryMatchAdapter(dummyEditor, {
      select: { type: 'node', nodeType: 'image' },
    });

    expect(result.items).toHaveLength(1);
    const match = result.items[0];
    expect(match.blocks).toEqual([]);
    expect(match.handle.refStability).toBe('ephemeral');
    expect(match.handle.targetKind).toBe('node');
    // Ref should be a V3 text ref, not an empty string or nodeId
    expect(match.handle.ref.startsWith('text:')).toBe(true);
    const refPayload = JSON.parse(atob(match.handle.ref.slice(5)));
    expect(refPayload.v).toBe(3);
    expect(refPayload.scope).toBe('match');
    expect(refPayload.rev).toBe('rev-10');
    expect(refPayload.segments).toEqual([{ blockId: 'p1', start: 5, end: 6 }]);
  });

  it('builds two segments for cross-block inline anchor', () => {
    // When an inline node's anchor spans two blocks, buildInlineAnchorSegments
    // produces [startBlock: offset→end, endBlock: 0→offset].
    const candidates = [
      { nodeId: 'p1', pos: 0, end: 12, text: 'First block' },
      { nodeId: 'p2', pos: 20, end: 33, text: 'Second block' },
    ];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    setupFindResult({
      matches: [
        {
          kind: 'inline',
          nodeType: 'bookmark',
          anchor: {
            start: { blockId: 'p1', offset: 8 },
            end: { blockId: 'p2', offset: 4 },
          },
        },
      ],
      context: [{}],
      total: 1,
    });
    mockedDeps.getRevision.mockReturnValue('rev-20');

    const result = queryMatchAdapter(editor, {
      select: { type: 'node', nodeType: 'bookmark' },
    });

    expect(result.items).toHaveLength(1);
    const match = result.items[0];
    expect(match.blocks).toEqual([]);
    expect(match.handle.refStability).toBe('ephemeral');
    expect(match.handle.targetKind).toBe('node');

    const refPayload = JSON.parse(atob(match.handle.ref.slice(5)));
    expect(refPayload.v).toBe(3);
    expect(refPayload.segments).toEqual([
      { blockId: 'p1', start: 8, end: 11 }, // 'First block'.length = 11
      { blockId: 'p2', start: 0, end: 4 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Tests: cross-block address is first block (D14)
// ---------------------------------------------------------------------------

describe('queryMatchAdapter — address semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('rev-1');
  });

  it('address refers to the first block for cross-block matches', () => {
    const candidates = [
      { nodeId: 'p1', pos: 0, end: 12, text: 'First block' },
      { nodeId: 'p2', pos: 20, end: 33, text: 'Second block' },
    ];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [
        {
          textRanges: [
            { kind: 'text', blockId: 'p1', range: { start: 0, end: 11 } },
            { kind: 'text', blockId: 'p2', range: { start: 0, end: 12 } },
          ],
        },
      ],
      total: 1,
    });
    mockedDeps.captureRunsInRange
      .mockReturnValueOnce(captured([capturedRun(0, 11, [])]))
      .mockReturnValueOnce(captured([capturedRun(0, 12, [])]));

    const result = queryMatchAdapter(editor, {
      select: { type: 'text', pattern: 'First block Second block' },
    });

    // The address should reference the first block
    expect(result.items[0].address).toEqual({ kind: 'text', blockId: 'p1' });
  });
});

// ---------------------------------------------------------------------------
// Tests: zero-width match filtering (D20)
// ---------------------------------------------------------------------------

describe('queryMatchAdapter — zero-width match filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('rev-1');
  });

  it('silently drops zero-width text matches', () => {
    setupFindResult({
      matches: [
        { kind: 'text', blockId: 'p1' },
        { kind: 'text', blockId: 'p1' },
      ],
      context: [
        { textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 5, end: 5 } }] }, // zero-width
        { textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } }] }, // real
      ],
      total: 2,
    });

    const candidates = [{ nodeId: 'p1', pos: 0, end: 12, text: 'Hello world' }];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    mockedDeps.captureRunsInRange.mockReturnValue(captured([capturedRun(0, 3, [])]));

    const result = queryMatchAdapter(editor, {
      select: { type: 'text', pattern: '^', mode: 'regex' },
    });

    // Only the non-zero-width match survives
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('throws MATCH_NOT_FOUND when all matches are zero-width and require != any', () => {
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [{ textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } }] }],
      total: 1,
    });

    const dummyEditor = {} as any;

    expect(() =>
      queryMatchAdapter(dummyEditor, {
        select: { type: 'text', pattern: '^', mode: 'regex' },
        require: 'first',
      }),
    ).toThrow(/MATCH_NOT_FOUND/);
  });
});

// ---------------------------------------------------------------------------
// Tests: snippet assembly (D11, D17)
// ---------------------------------------------------------------------------

describe('queryMatchAdapter — snippet assembly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('rev-1');
  });

  it('produces snippet with context for a short match', () => {
    const blockText = 'A'.repeat(100) + 'MATCH' + 'B'.repeat(100);
    const candidates = [{ nodeId: 'p1', pos: 0, end: blockText.length + 2, text: blockText }];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [{ textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 100, end: 105 } }] }],
      total: 1,
    });
    mockedDeps.captureRunsInRange.mockReturnValue(captured([capturedRun(100, 105, [])]));

    const result = queryMatchAdapter(editor, {
      select: { type: 'text', pattern: 'MATCH' },
    });

    const match = result.items[0] as any;
    expect(match.snippet).toContain('MATCH');
    expect(match.highlightRange.start).toBeGreaterThanOrEqual(0);
    expect(match.highlightRange.end).toBeLessThanOrEqual(match.snippet.length);
    // Verify highlightRange correctly points to match text
    expect(match.snippet.slice(match.highlightRange.start, match.highlightRange.end)).toBe('MATCH');
  });

  it('truncates snippet when match text exceeds SNIPPET_MAX_LENGTH', () => {
    const longText = 'X'.repeat(600);
    const candidates = [{ nodeId: 'p1', pos: 0, end: longText.length + 2, text: longText }];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    setupFindResult({
      matches: [{ kind: 'text', blockId: 'p1' }],
      context: [{ textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 600 } }] }],
      total: 1,
    });
    mockedDeps.captureRunsInRange.mockReturnValue(captured([capturedRun(0, 600, [])]));

    const result = queryMatchAdapter(editor, {
      select: { type: 'text', pattern: longText },
    });

    const match = result.items[0] as any;
    expect(match.snippet.length).toBe(SNIPPET_MAX_LENGTH);
    expect(match.highlightRange).toEqual({ start: 0, end: SNIPPET_MAX_LENGTH });
  });
});

// ---------------------------------------------------------------------------
// Tests: cardinality enforcement
// ---------------------------------------------------------------------------

describe('queryMatchAdapter — cardinality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('rev-1');
  });

  it('throws MATCH_NOT_FOUND when require=first and zero matches', () => {
    setupFindResult({ matches: [], total: 0 });
    const dummyEditor = {} as any;

    expect(() =>
      queryMatchAdapter(dummyEditor, {
        select: { type: 'text', pattern: 'missing' },
        require: 'first',
      }),
    ).toThrow(/MATCH_NOT_FOUND/);
  });

  it('throws AMBIGUOUS_MATCH when require=exactlyOne and multiple matches', () => {
    const candidates = [
      { nodeId: 'p1', pos: 0, end: 7, text: 'abc' },
      { nodeId: 'p2', pos: 10, end: 17, text: 'abc' },
    ];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    setupFindResult({
      matches: [
        { kind: 'text', blockId: 'p1' },
        { kind: 'text', blockId: 'p2' },
      ],
      context: [
        { textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } }] },
        { textRanges: [{ kind: 'text', blockId: 'p2', range: { start: 0, end: 3 } }] },
      ],
      total: 2,
    });
    mockedDeps.captureRunsInRange.mockReturnValue(captured([capturedRun(0, 3, [])]));

    expect(() =>
      queryMatchAdapter(editor, {
        select: { type: 'text', pattern: 'abc' },
        require: 'exactlyOne',
      }),
    ).toThrow(/AMBIGUOUS_MATCH/);
  });

  it('returns only first match when require=first', () => {
    const candidates = [
      { nodeId: 'p1', pos: 0, end: 7, text: 'abc' },
      { nodeId: 'p2', pos: 10, end: 17, text: 'abc' },
    ];
    const editor = makeEditorWithBlocks(candidates);
    setupBlockIndex(candidates.map(({ nodeId, pos, end }) => ({ nodeId, pos, end })));
    setupFindResult({
      matches: [
        { kind: 'text', blockId: 'p1' },
        { kind: 'text', blockId: 'p2' },
      ],
      context: [
        { textRanges: [{ kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } }] },
        { textRanges: [{ kind: 'text', blockId: 'p2', range: { start: 0, end: 3 } }] },
      ],
      total: 2,
    });
    mockedDeps.captureRunsInRange.mockReturnValue(captured([capturedRun(0, 3, [])]));

    const result = queryMatchAdapter(editor, {
      select: { type: 'text', pattern: 'abc' },
      require: 'first',
    });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(2);
  });
});
