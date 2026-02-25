import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutationStep } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { compilePlan } from './compiler.js';
import { PlanError } from './errors.js';

const mockedDeps = vi.hoisted(() => ({
  getBlockIndex: vi.fn(),
  resolveTextRangeInBlock: vi.fn(),
  captureRunsInRange: vi.fn(() => ({ runs: [], isUniform: true })),
  getRevision: vi.fn(() => '0'),
  executeTextSelector: vi.fn(() => ({ matches: [], context: [], total: 0 })),
  executeBlockSelector: vi.fn(() => ({ matches: [], context: [], total: 0 })),
  hasStepExecutor: vi.fn(() => true),
}));

vi.mock('../helpers/index-cache.js', () => ({
  getBlockIndex: mockedDeps.getBlockIndex,
}));

vi.mock('../helpers/text-offset-resolver.js', () => ({
  resolveTextRangeInBlock: mockedDeps.resolveTextRangeInBlock,
}));

vi.mock('./style-resolver.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./style-resolver.js')>();
  return {
    ...original,
    captureRunsInRange: mockedDeps.captureRunsInRange,
  };
});

vi.mock('./revision-tracker.js', () => ({
  getRevision: mockedDeps.getRevision,
}));

vi.mock('../find/text-strategy.js', () => ({
  executeTextSelector: mockedDeps.executeTextSelector,
}));

vi.mock('../find/block-strategy.js', () => ({
  executeBlockSelector: mockedDeps.executeBlockSelector,
}));

vi.mock('./executor-registry.js', () => ({
  hasStepExecutor: mockedDeps.hasStepExecutor,
}));

function makeEditor(): Editor {
  return {
    state: {
      doc: {
        textBetween: vi.fn(() => 'abcdefghij'),
      },
    },
  } as unknown as Editor;
}

function encodeTextRefPayload(payload: Record<string, unknown>): string {
  return `text:${btoa(JSON.stringify(payload))}`;
}

describe('compilePlan ref-targeting semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('0');
    mockedDeps.resolveTextRangeInBlock.mockImplementation(
      (_node: unknown, pos: number, range: { start: number; end: number }) => ({
        from: pos + 1 + range.start,
        to: pos + 1 + range.end,
      }),
    );
  });

  it('throws MATCH_NOT_FOUND when a ref resolves zero targets', () => {
    mockedDeps.getBlockIndex.mockReturnValue({ candidates: [] });
    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'delete-by-ref',
        op: 'text.delete',
        where: { by: 'ref', ref: 'missing-block-id' },
        args: {},
      },
    ];

    try {
      compilePlan(editor, steps);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('MATCH_NOT_FOUND');
      expect((error as PlanError).stepId).toBe('delete-by-ref');
      return;
    }

    throw new Error('expected compilePlan to throw MATCH_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// V3 ref resolution (D6, Phase 4)
// ---------------------------------------------------------------------------

describe('compilePlan V3 ref resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('0');
    mockedDeps.resolveTextRangeInBlock.mockImplementation(
      (_node: unknown, pos: number, range: { start: number; end: number }) => ({
        from: pos + 1 + range.start,
        to: pos + 1 + range.end,
      }),
    );
  });

  it('resolves a single-segment V3 run ref to a CompiledRangeTarget', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [{ nodeId: 'p1', pos: 0, end: 12, node: {} }],
    });

    const ref = encodeTextRefPayload({
      v: 3,
      rev: '0',
      matchId: 'm:0',
      scope: 'run',
      segments: [{ blockId: 'p1', start: 0, end: 5 }],
      blockIndex: 0,
      runIndex: 0,
    });

    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'rewrite-run',
        op: 'text.rewrite',
        where: { by: 'ref', ref },
        args: { replacement: { text: 'replaced' } },
      },
    ];

    const plan = compilePlan(editor, steps);
    expect(plan.mutationSteps).toHaveLength(1);
    expect(plan.mutationSteps[0].targets).toHaveLength(1);

    const target = plan.mutationSteps[0].targets[0];
    expect(target.kind).toBe('range');
    if (target.kind === 'range') {
      expect(target.blockId).toBe('p1');
      expect(target.from).toBe(0);
      expect(target.to).toBe(5);
      expect(target.matchId).toBe('m:0');
    }
  });

  it('resolves a single-segment V3 block ref to a CompiledRangeTarget', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [{ nodeId: 'p1', pos: 0, end: 12, node: {} }],
    });

    const ref = encodeTextRefPayload({
      v: 3,
      rev: '0',
      matchId: 'm:0',
      scope: 'block',
      segments: [{ blockId: 'p1', start: 0, end: 10 }],
      blockIndex: 0,
    });

    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'rewrite-block',
        op: 'text.rewrite',
        where: { by: 'ref', ref },
        args: { replacement: { text: 'replaced' } },
      },
    ];

    const plan = compilePlan(editor, steps);
    const target = plan.mutationSteps[0].targets[0];
    expect(target.kind).toBe('range');
    if (target.kind === 'range') {
      expect(target.blockId).toBe('p1');
      expect(target.from).toBe(0);
      expect(target.to).toBe(10);
    }
  });

  it('resolves a multi-segment V3 match ref to a CompiledSpanTarget', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [
        { nodeId: 'p1', pos: 0, end: 12, node: {} },
        { nodeId: 'p2', pos: 20, end: 32, node: {} },
      ],
    });

    const ref = encodeTextRefPayload({
      v: 3,
      rev: '0',
      matchId: 'm:0',
      scope: 'match',
      segments: [
        { blockId: 'p1', start: 0, end: 10 },
        { blockId: 'p2', start: 0, end: 10 },
      ],
    });

    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'span-rewrite',
        op: 'text.rewrite',
        where: { by: 'ref', ref },
        args: { replacement: { text: 'replaced' } },
      },
    ];

    const plan = compilePlan(editor, steps);
    const target = plan.mutationSteps[0].targets[0];
    expect(target.kind).toBe('span');
    if (target.kind === 'span') {
      expect(target.segments).toHaveLength(2);
      expect(target.segments[0].blockId).toBe('p1');
      expect(target.segments[1].blockId).toBe('p2');
      expect(target.matchId).toBe('m:0');
    }
  });

  it('throws REVISION_MISMATCH when V3 ref revision does not match current', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [{ nodeId: 'p1', pos: 0, end: 12, node: {} }],
    });

    const ref = encodeTextRefPayload({
      v: 3,
      rev: 'old-rev',
      matchId: 'm:0',
      scope: 'run',
      segments: [{ blockId: 'p1', start: 0, end: 5 }],
    });

    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'stale-ref',
        op: 'text.delete',
        where: { by: 'ref', ref },
        args: {},
      },
    ];

    try {
      compilePlan(editor, steps);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('REVISION_MISMATCH');
      return;
    }

    throw new Error('expected compilePlan to throw REVISION_MISMATCH');
  });

  it('throws MATCH_NOT_FOUND when V3 ref block is not in the index', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [], // empty — no blocks
    });

    const ref = encodeTextRefPayload({
      v: 3,
      rev: '0',
      matchId: 'm:0',
      scope: 'run',
      segments: [{ blockId: 'missing', start: 0, end: 5 }],
    });

    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'missing-block',
        op: 'text.delete',
        where: { by: 'ref', ref },
        args: {},
      },
    ];

    try {
      compilePlan(editor, steps);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('MATCH_NOT_FOUND');
      return;
    }

    throw new Error('expected compilePlan to throw MATCH_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Entity ref rejection (C4 — registry-based dispatch)
// ---------------------------------------------------------------------------

describe('compilePlan entity ref rejection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('0');
    mockedDeps.getBlockIndex.mockReturnValue({ candidates: [] });
  });

  it('throws INVALID_INPUT for tc: (tracked change) entity refs', () => {
    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'tc-ref',
        op: 'text.delete',
        where: { by: 'ref', ref: 'tc:change-123' },
        args: {},
      },
    ];

    try {
      compilePlan(editor, steps);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('INVALID_INPUT');
      expect((error as PlanError).message).toContain('tracked change');
      expect((error as PlanError).message).toContain('tc:change-123');
      return;
    }

    throw new Error('expected compilePlan to throw INVALID_INPUT for tc: ref');
  });

  it('throws INVALID_INPUT for comment: entity refs', () => {
    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'comment-ref',
        op: 'text.delete',
        where: { by: 'ref', ref: 'comment:c1' },
        args: {},
      },
    ];

    try {
      compilePlan(editor, steps);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('INVALID_INPUT');
      expect((error as PlanError).message).toContain('comment');
      expect((error as PlanError).message).toContain('comment:c1');
      return;
    }

    throw new Error('expected compilePlan to throw INVALID_INPUT for comment: ref');
  });
});
