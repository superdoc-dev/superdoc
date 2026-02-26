import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutationStep } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { compilePlan, STEP_INTERACTION_MATRIX, MATRIX_EXEMPT_OPS } from './compiler.js';
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
      const planErr = error as PlanError;
      expect(planErr.code).toBe('REVISION_MISMATCH');
      expect(planErr.stepId).toBe('stale-ref');

      // D2: structured remediation details
      const details = planErr.details as Record<string, unknown>;
      expect(details.refRevision).toBe('old-rev');
      expect(details.currentRevision).toBe('0');
      expect(details.refStability).toBe('ephemeral');
      expect(details.refScope).toBe('run');
      expect(details.remediation).toContain('query.match');
      return;
    }

    throw new Error('expected compilePlan to throw REVISION_MISMATCH');
  });

  it('REVISION_MISMATCH.details.refScope uses V3 scope directly (match, not inferred from segments)', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [
        { nodeId: 'p1', pos: 0, end: 12, node: {} },
        { nodeId: 'p2', pos: 13, end: 25, node: {} },
      ],
    });

    // Multi-segment match ref — old code would infer 'document', correct value is 'match'
    const ref = encodeTextRefPayload({
      v: 3,
      rev: 'stale',
      matchId: 'm:1',
      scope: 'match',
      segments: [
        { blockId: 'p1', start: 0, end: 5 },
        { blockId: 'p2', start: 0, end: 3 },
      ],
    });

    const editor = makeEditor();
    const steps: MutationStep[] = [
      { id: 'multi-seg', op: 'text.rewrite', where: { by: 'ref', ref }, args: { replacement: { text: 'X' } } },
    ];

    try {
      compilePlan(editor, steps);
    } catch (error) {
      const planErr = error as PlanError;
      expect(planErr.code).toBe('REVISION_MISMATCH');
      expect(planErr.details.refScope).toBe('match');
      return;
    }
    throw new Error('expected REVISION_MISMATCH');
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

// ---------------------------------------------------------------------------
// Create-step position validation (B2)
// ---------------------------------------------------------------------------

describe('compilePlan create-step position validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getRevision.mockReturnValue('0');
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [{ nodeId: 'p1', pos: 0, end: 12, node: {} }],
    });
    mockedDeps.resolveTextRangeInBlock.mockImplementation(
      (_node: unknown, pos: number, range: { start: number; end: number }) => ({
        from: pos + 1 + range.start,
        to: pos + 1 + range.end,
      }),
    );
  });

  it('defaults args.position to "after" when omitted on create.heading', () => {
    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'create-heading',
        op: 'create.heading',
        where: { by: 'ref', ref: 'p1' },
        args: { level: 2, text: 'Title' },
      },
    ];

    const plan = compilePlan(editor, steps);
    expect(plan.mutationSteps).toHaveLength(1);

    // The compiler should have set args.position = 'after'
    const args = plan.mutationSteps[0].step.args as Record<string, unknown>;
    expect(args.position).toBe('after');
  });

  it('defaults args.position to "after" when omitted on create.paragraph', () => {
    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'create-para',
        op: 'create.paragraph',
        where: { by: 'ref', ref: 'p1' },
        args: { text: 'Hello' },
      },
    ];

    const plan = compilePlan(editor, steps);
    const args = plan.mutationSteps[0].step.args as Record<string, unknown>;
    expect(args.position).toBe('after');
  });

  it('preserves explicit "before" position on create.heading', () => {
    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'create-before',
        op: 'create.heading',
        where: { by: 'ref', ref: 'p1' },
        args: { position: 'before', level: 1, text: 'Title' },
      },
    ];

    const plan = compilePlan(editor, steps);
    const args = plan.mutationSteps[0].step.args as Record<string, unknown>;
    expect(args.position).toBe('before');
  });

  it('throws INVALID_INPUT for invalid position value', () => {
    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'bad-position',
        op: 'create.heading',
        where: { by: 'ref', ref: 'p1' },
        args: { position: 'middle', level: 1, text: 'Title' },
      },
    ];

    try {
      compilePlan(editor, steps);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('INVALID_INPUT');
      expect((error as PlanError).stepId).toBe('bad-position');
      expect((error as PlanError).details).toEqual({
        receivedPosition: 'middle',
        allowedValues: ['before', 'after'],
        default: 'after',
      });
      return;
    }

    throw new Error('expected compilePlan to throw INVALID_INPUT for invalid position');
  });
});

// ---------------------------------------------------------------------------
// Block identity integrity (Workstream E)
// ---------------------------------------------------------------------------

describe('compilePlan block identity pre-check', () => {
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

  it('throws DOCUMENT_IDENTITY_CONFLICT when document has duplicate block IDs', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [
        { nodeId: 'p1', pos: 0, end: 12, node: {} },
        { nodeId: 'p1', pos: 20, end: 32, node: {} },
      ],
    });

    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'step-1',
        op: 'text.rewrite',
        where: { by: 'ref', ref: 'p1' },
        args: { replacement: { text: 'test' } },
      },
    ];

    try {
      compilePlan(editor, steps);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('DOCUMENT_IDENTITY_CONFLICT');
      expect((error as PlanError).details).toEqual({
        duplicateBlockIds: ['p1'],
        blockCount: 1,
        remediation: 'Re-import the document or call document.repair() to assign unique identities.',
      });
      return;
    }

    throw new Error('expected compilePlan to throw DOCUMENT_IDENTITY_CONFLICT');
  });

  it('does not throw when all block IDs are unique', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [
        { nodeId: 'p1', pos: 0, end: 12, node: {} },
        { nodeId: 'p2', pos: 20, end: 32, node: {} },
      ],
    });

    const editor = makeEditor();
    const steps: MutationStep[] = [
      {
        id: 'step-1',
        op: 'text.rewrite',
        where: { by: 'ref', ref: 'p1' },
        args: { replacement: { text: 'test' } },
      },
    ];

    expect(() => compilePlan(editor, steps)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Step interaction matrix table-driven tests (Workstream C)
// ---------------------------------------------------------------------------

describe('step interaction matrix', () => {
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

  /**
   * Helper: build a two-step plan where both steps target the same range in the same block.
   * This triggers the interaction matrix for same_target or same_block classification.
   */
  function buildSameTargetPlan(
    opA: string,
    opB: string,
    argsA: Record<string, unknown> = {},
    argsB: Record<string, unknown> = {},
  ): MutationStep[] {
    const ref = encodeTextRefPayload({
      v: 3,
      rev: '0',
      matchId: 'm:0',
      scope: 'match',
      segments: [{ blockId: 'p1', start: 0, end: 5 }],
    });

    const defaultArgs: Record<string, Record<string, unknown>> = {
      'text.rewrite': { replacement: { text: 'new' } },
      'text.insert': { position: 'before', content: { text: 'new' } },
      'text.delete': {},
      'format.apply': { inline: { bold: true } },
      'create.heading': { position: 'after', level: 1, text: 'Title' },
      'create.paragraph': { position: 'after', text: 'Body' },
    };

    return [
      { id: 'step-a', op: opA, where: { by: 'ref', ref }, args: { ...defaultArgs[opA], ...argsA } },
      { id: 'step-b', op: opB, where: { by: 'ref', ref }, args: { ...defaultArgs[opB], ...argsB } },
    ];
  }

  function setupSingleBlock(): void {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [{ nodeId: 'p1', pos: 0, end: 12, node: {} }],
    });
  }

  // Table-driven: iterate every matrix entry and verify the verdict
  const matrixEntries = [...STEP_INTERACTION_MATRIX.entries()];

  describe('matrix verdicts — allow entries', () => {
    const allowEntries = matrixEntries.filter(([, verdict]) => verdict === 'allow');

    for (const [key] of allowEntries) {
      const [opA, opB] = key.split('::');

      it(`allows ${opA} → ${opB} (${key})`, () => {
        setupSingleBlock();
        const editor = makeEditor();
        // Resolve create.* to concrete ops
        const concreteA = opA === 'create.*' ? 'create.heading' : opA;
        const concreteB = opB === 'create.*' ? 'create.paragraph' : opB;
        const steps = buildSameTargetPlan(concreteA, concreteB);

        expect(() => compilePlan(editor, steps)).not.toThrow();
      });
    }
  });

  describe('matrix verdicts — reject entries', () => {
    const rejectEntries = matrixEntries.filter(([, verdict]) => verdict === 'reject');

    for (const [key] of rejectEntries) {
      const [opA, opB] = key.split('::');

      it(`rejects ${opA} → ${opB} (${key})`, () => {
        setupSingleBlock();
        const editor = makeEditor();
        const concreteA = opA === 'create.*' ? 'create.heading' : opA;
        const concreteB = opB === 'create.*' ? 'create.paragraph' : opB;
        const steps = buildSameTargetPlan(concreteA, concreteB);

        try {
          compilePlan(editor, steps);
        } catch (error) {
          expect(error).toBeInstanceOf(PlanError);
          expect((error as PlanError).code).toBe('PLAN_CONFLICT_OVERLAP');
          return;
        }

        throw new Error(`expected PLAN_CONFLICT_OVERLAP for ${key}`);
      });
    }
  });

  it('allows disjoint steps of any operation type', () => {
    // Two steps targeting completely different blocks — always allowed
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [
        { nodeId: 'p1', pos: 0, end: 12, node: {} },
        { nodeId: 'p2', pos: 20, end: 32, node: {} },
      ],
    });

    const editor = makeEditor();
    const refA = encodeTextRefPayload({
      v: 3,
      rev: '0',
      matchId: 'm:0',
      scope: 'match',
      segments: [{ blockId: 'p1', start: 0, end: 5 }],
    });
    const refB = encodeTextRefPayload({
      v: 3,
      rev: '0',
      matchId: 'm:1',
      scope: 'match',
      segments: [{ blockId: 'p2', start: 0, end: 5 }],
    });

    // format.apply → text.rewrite on disjoint blocks should be fine
    const steps: MutationStep[] = [
      { id: 'step-a', op: 'format.apply', where: { by: 'ref', ref: refA }, args: { inline: { bold: true } } },
      { id: 'step-b', op: 'text.rewrite', where: { by: 'ref', ref: refB }, args: { replacement: { text: 'new' } } },
    ];

    expect(() => compilePlan(editor, steps)).not.toThrow();
  });

  it('text.rewrite → format.apply same ref succeeds (key customer workflow)', () => {
    setupSingleBlock();
    const editor = makeEditor();
    const steps = buildSameTargetPlan('text.rewrite', 'format.apply');

    expect(() => compilePlan(editor, steps)).not.toThrow();
  });

  it('format.apply → text.rewrite same ref is rejected (order matters)', () => {
    setupSingleBlock();
    const editor = makeEditor();
    const steps = buildSameTargetPlan('format.apply', 'text.rewrite');

    try {
      compilePlan(editor, steps);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('PLAN_CONFLICT_OVERLAP');
      return;
    }

    throw new Error('expected PLAN_CONFLICT_OVERLAP');
  });

  it('exempt ops (assert) are never rejected', () => {
    expect(MATRIX_EXEMPT_OPS.has('assert')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// INVALID_INSERTION_CONTEXT — compile-time schema validation for create ops
// ---------------------------------------------------------------------------

describe('compilePlan: INVALID_INSERTION_CONTEXT for create ops', () => {
  const paragraphNodeType = { name: 'paragraph' };

  function makeContentMatchType(allowed: string[]) {
    return {
      matchType: (nodeType: { name: string }) => allowed.includes(nodeType.name),
    };
  }

  /** Build an editor mock with doc.resolve returning a parent with configurable content rules. */
  function makeEditorWithParent(parentTypeName: string, allowedChildren: string[]): Editor {
    const canReplaceWith = (_from: number, _to: number, nodeType: { name: string }) =>
      allowedChildren.includes(nodeType.name);

    return {
      state: {
        doc: {
          textBetween: vi.fn(() => 'abcdefghij'),
          resolve: vi.fn(() => ({
            parent: {
              type: {
                name: parentTypeName,
                contentMatch: makeContentMatchType(allowedChildren),
              },
              canReplaceWith,
            },
            index: () => 0,
          })),
        },
        schema: {
          nodes: {
            paragraph: paragraphNodeType,
          },
        },
      },
    } as unknown as Editor;
  }

  function setupBlockForInsertionTest() {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [
        { nodeId: 'p1', pos: 10, end: 25, nodeSize: 15, nodeType: 'paragraph', node: { type: { name: 'paragraph' } } },
      ],
    });

    const ref = encodeTextRefPayload({
      v: 3,
      rev: '0',
      matchId: 'm:1',
      scope: 'match',
      segments: [{ blockId: 'p1', start: 0, end: 5 }],
    });
    return ref;
  }

  it('allows create.paragraph when parent accepts paragraph children', () => {
    const ref = setupBlockForInsertionTest();
    const editor = makeEditorWithParent('doc', ['paragraph']);

    const steps: MutationStep[] = [
      { id: 'create-1', op: 'create.paragraph', where: { by: 'ref', ref }, args: { position: 'after', text: 'New' } },
    ];

    expect(() => compilePlan(editor, steps)).not.toThrow();
  });

  it('allows create.heading when parent accepts paragraph children (heading is paragraph node)', () => {
    const ref = setupBlockForInsertionTest();
    const editor = makeEditorWithParent('doc', ['paragraph']);

    const steps: MutationStep[] = [
      {
        id: 'create-h',
        op: 'create.heading',
        where: { by: 'ref', ref },
        args: { position: 'after', level: 1, text: 'Title' },
      },
    ];

    expect(() => compilePlan(editor, steps)).not.toThrow();
  });

  it('rejects create.paragraph when parent does not accept paragraph children', () => {
    const ref = setupBlockForInsertionTest();
    const editor = makeEditorWithParent('custom_container', ['image']);

    const steps: MutationStep[] = [
      {
        id: 'create-fail',
        op: 'create.paragraph',
        where: { by: 'ref', ref },
        args: { position: 'after', text: 'New' },
      },
    ];

    try {
      compilePlan(editor, steps);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      const planErr = error as PlanError;
      expect(planErr.code).toBe('INVALID_INSERTION_CONTEXT');
      expect(planErr.details).toMatchObject({
        stepIndex: 0,
        stepId: 'create-fail',
        operation: 'create.paragraph',
        anchorBlockId: 'p1',
        parentType: 'custom_container',
        requestedChildType: 'paragraph',
        requestedSemanticType: 'paragraph',
      });
      expect(typeof planErr.details.stepIndex).toBe('number');
      return;
    }

    throw new Error('expected INVALID_INSERTION_CONTEXT');
  });

  it('rejects create.heading inside parent that rejects paragraphs', () => {
    const ref = setupBlockForInsertionTest();
    const editor = makeEditorWithParent('footnote', ['text']);

    const steps: MutationStep[] = [
      {
        id: 'create-h-fail',
        op: 'create.heading',
        where: { by: 'ref', ref },
        args: { position: 'before', level: 2, text: 'Bad' },
      },
    ];

    try {
      compilePlan(editor, steps);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      const planErr = error as PlanError;
      expect(planErr.code).toBe('INVALID_INSERTION_CONTEXT');
      expect(planErr.details).toMatchObject({
        stepIndex: 0,
        operation: 'create.heading',
        parentType: 'footnote',
        requestedSemanticType: 'heading',
      });
      return;
    }

    throw new Error('expected INVALID_INSERTION_CONTEXT');
  });

  it('includes allowedChildTypes in error details', () => {
    const ref = setupBlockForInsertionTest();
    const editor = makeEditorWithParent('table_cell', ['text', 'image']);

    const steps: MutationStep[] = [
      { id: 'create-cell', op: 'create.paragraph', where: { by: 'ref', ref }, args: { position: 'after', text: 'X' } },
    ];

    try {
      compilePlan(editor, steps);
    } catch (error) {
      const planErr = error as PlanError;
      expect(planErr.code).toBe('INVALID_INSERTION_CONTEXT');
      expect(Array.isArray(planErr.details.allowedChildTypes)).toBe(true);
      return;
    }

    throw new Error('expected INVALID_INSERTION_CONTEXT');
  });

  it('validates at correct insertion index for position=before vs position=after', () => {
    const ref = setupBlockForInsertionTest();

    // canReplaceWith that only allows paragraph at index 0, not index 1
    const canReplaceWith = (from: number, _to: number, nodeType: { name: string }) =>
      nodeType.name === 'paragraph' && from === 0;

    const editor = {
      state: {
        doc: {
          textBetween: vi.fn(() => 'abcdefghij'),
          resolve: vi.fn(() => ({
            parent: {
              type: {
                name: 'ordered_container',
                contentMatch: makeContentMatchType([]),
              },
              canReplaceWith,
            },
            index: () => 0, // anchor is at index 0
          })),
        },
        schema: { nodes: { paragraph: paragraphNodeType } },
      },
    } as unknown as Editor;

    // position=before → insertionIndex=0 → allowed
    const stepsBefore: MutationStep[] = [
      { id: 'create-b', op: 'create.paragraph', where: { by: 'ref', ref }, args: { position: 'before', text: 'X' } },
    ];
    expect(() => compilePlan(editor, stepsBefore)).not.toThrow();

    // position=after → insertionIndex=1 → rejected
    const stepsAfter: MutationStep[] = [
      { id: 'create-a', op: 'create.paragraph', where: { by: 'ref', ref }, args: { position: 'after', text: 'Y' } },
    ];
    try {
      compilePlan(editor, stepsAfter);
    } catch (error) {
      const planErr = error as PlanError;
      expect(planErr.code).toBe('INVALID_INSERTION_CONTEXT');
      expect(planErr.details.insertionIndex).toBe(1);
      return;
    }
    throw new Error('expected INVALID_INSERTION_CONTEXT for position=after at index 1');
  });
});
