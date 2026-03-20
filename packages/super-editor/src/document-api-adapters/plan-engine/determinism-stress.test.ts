import { describe, it, test, expect, mock, beforeAll } from 'bun:test';
/**
 * T5: Determinism stress test (§13.16)
 *
 * Runs a multi-step workflow (rewrite + format) 100 times on independently
 * constructed mock editors. Verifies the canonicalized output shape is
 * identical across all runs — no flaky ordering, no volatile state leaks.
 */

import type { Editor } from '../../core/Editor.js';
import type { TextRewriteStep, StyleApplyStep, PlanReceipt } from '@superdoc/document-api';
import type { CompiledPlan } from './compiler.js';
import type { CompiledTarget, CompiledRangeTarget } from './executor-registry.types.js';
const { executeCompiledPlan } = await import('./executor.js');
const { registerBuiltInExecutors } = await import('./register-executors.js');

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockedDeps = {
  getBlockIndex: mock(),
  resolveTextRangeInBlock: mock(),
  getRevision: mock(() => '0'),
  checkRevision: mock(),
  incrementRevision: mock(() => '1'),
  captureRunsInRange: mock(),
  resolveInlineStyle: mock(() => []),
  applyDirectMutationMeta: mock(),
  applyTrackedMutationMeta: mock(),
  mapBlockNodeType: mock(),
};

mock.module('../helpers/index-cache.js', () => ({
  getBlockIndex: mockedDeps.getBlockIndex,
}));

mock.module('../helpers/text-offset-resolver.js', () => ({
  resolveTextRangeInBlock: mockedDeps.resolveTextRangeInBlock,
}));

mock.module('./revision-tracker.js', () => ({
  getRevision: mockedDeps.getRevision,
  checkRevision: mockedDeps.checkRevision,
  incrementRevision: mockedDeps.incrementRevision,
}));

mock.module('./style-resolver.js', () => ({
  captureRunsInRange: mockedDeps.captureRunsInRange,
  resolveInlineStyle: mockedDeps.resolveInlineStyle,
}));

mock.module('../helpers/transaction-meta.js', () => ({
  applyDirectMutationMeta: mockedDeps.applyDirectMutationMeta,
  applyTrackedMutationMeta: mockedDeps.applyTrackedMutationMeta,
}));

mock.module('../helpers/node-address-resolver.js', () => ({
  mapBlockNodeType: mockedDeps.mapBlockNodeType,
  findBlockById: (index: any, address: { nodeType: string; nodeId: string }) =>
    index.byId.get(`${address.nodeType}:${address.nodeId}`),
  isTextBlockCandidate: (candidate: { nodeType: string }) =>
    candidate.nodeType === 'paragraph' ||
    candidate.nodeType === 'heading' ||
    candidate.nodeType === 'listItem' ||
    candidate.nodeType === 'tableCell',
}));

beforeAll(() => {
  registerBuiltInExecutors();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockMark(name: string) {
  return {
    type: { name, create: () => mockMark(name) },
    attrs: {},
    eq: (other: any) => other.type.name === name,
  };
}

/** Create a fresh editor instance for each run — no shared state between runs. */
function makeFreshEditor(): { editor: Editor; dispatch: ReturnType<typeof mock> } {
  const boldMark = mockMark('bold');
  const tr = {
    replaceWith: mock(),
    delete: mock(),
    insert: mock(),
    addMark: mock(),
    removeMark: mock(),
    setMeta: mock(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    doc: {
      resolve: () => ({ marks: () => [] }),
      textContent: 'Hello world',
    },
  };
  tr.replaceWith.mockReturnValue(tr);
  tr.delete.mockReturnValue(tr);
  tr.insert.mockReturnValue(tr);
  tr.addMark.mockReturnValue(tr);
  tr.removeMark.mockReturnValue(tr);
  tr.setMeta.mockReturnValue(tr);

  const dispatch = mock();

  const editor = {
    state: {
      doc: {
        textContent: 'Hello world',
        textBetween: mock(() => 'Hello world'),
        nodesBetween: mock(),
      },
      tr,
      schema: {
        marks: {
          bold: { create: mock(() => boldMark) },
          italic: { create: mock(() => mockMark('italic')) },
          underline: { create: mock(() => mockMark('underline')) },
          strike: { create: mock(() => mockMark('strike')) },
        },
        text: mock((t: string, m?: unknown[]) => ({
          type: { name: 'text' },
          text: t,
          marks: m ?? [],
        })),
      },
    },
    dispatch,
  } as unknown as Editor;

  return { editor, dispatch };
}

function makeTarget(overrides: Partial<CompiledRangeTarget> = {}): CompiledRangeTarget {
  return {
    kind: 'range',
    stepId: 'step-rewrite',
    op: 'text.rewrite',
    blockId: 'p1',
    from: 0,
    to: 5,
    absFrom: 1,
    absTo: 6,
    text: 'Hello',
    marks: [],
    capturedStyle: { runs: [], isUniform: true },
    ...overrides,
  } as CompiledRangeTarget;
}

function makeCompiledPlan(): CompiledPlan {
  const rewriteStep: TextRewriteStep = {
    id: 'step-rewrite',
    op: 'text.rewrite',
    where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
    args: { replacement: { text: 'Changed' } },
  };

  const formatStep: StyleApplyStep = {
    id: 'step-format',
    op: 'format.apply',
    where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
    args: { inline: { bold: true } },
  };

  return {
    mutationSteps: [
      { step: rewriteStep, targets: [makeTarget()] },
      {
        step: formatStep,
        targets: [
          makeTarget({
            stepId: 'step-format',
            op: 'format.apply',
            from: 6,
            to: 11,
            absFrom: 7,
            absTo: 12,
            text: 'world',
          }),
        ],
      },
    ],
    assertSteps: [],
    compiledRevision: '0',
  };
}

/** Canonicalize a receipt for cross-run comparison — strip volatile fields. */
function canonicalize(receipt: PlanReceipt): string {
  const canonical = {
    success: receipt.success,
    stepCount: receipt.steps.length,
    steps: receipt.steps.map((s) => ({
      stepId: s.stepId,
      op: s.op,
      effect: s.effect,
      matchCount: s.matchCount,
    })),
    revisionBefore: receipt.revision.before,
    revisionAfter: receipt.revision.after,
    // Exclude timing (volatile)
  };
  return JSON.stringify(canonical);
}

// ---------------------------------------------------------------------------
// Stress test
// ---------------------------------------------------------------------------

describe('determinism stress test: 100-run consistency', () => {
  it('produces identical canonicalized receipts across 100 independent runs', () => {
    const results: string[] = [];

    for (let i = 0; i < 100; i++) {
      // Reset mocks for each run to avoid cross-run state leakage
      mockedDeps.getRevision.mockReturnValue('0');
      mockedDeps.incrementRevision.mockReturnValue('1');
      mockedDeps.resolveInlineStyle.mockReturnValue([]);
      mockedDeps.mapBlockNodeType.mockReturnValue(undefined);

      const { editor } = makeFreshEditor();
      const compiled = makeCompiledPlan();

      const receipt = executeCompiledPlan(editor, compiled);
      results.push(canonicalize(receipt));
    }

    // All 100 runs must produce the same canonicalized output
    const baseline = results[0];
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(baseline);
    }

    // Verify the baseline looks correct
    const parsed = JSON.parse(baseline);
    expect(parsed.success).toBe(true);
    expect(parsed.stepCount).toBe(2);
    expect(parsed.steps[0].op).toBe('text.rewrite');
    expect(parsed.steps[1].op).toBe('format.apply');
  });
});
