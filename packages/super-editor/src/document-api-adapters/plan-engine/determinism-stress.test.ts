/**
 * T5: Determinism stress test (§13.16)
 *
 * Runs a multi-step workflow (rewrite + format) 100 times on independently
 * constructed mock editors. Verifies the canonicalized output shape is
 * identical across all runs — no flaky ordering, no volatile state leaks.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { TextRewriteStep, StyleApplyStep, PlanReceipt } from '@superdoc/document-api';
import type { CompiledPlan } from './compiler.js';
import type { CompiledTarget, CompiledRangeTarget } from './executor-registry.types.js';
import { executeCompiledPlan } from './executor.js';
import { registerBuiltInExecutors } from './register-executors.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockedDeps = vi.hoisted(() => ({
  getBlockIndex: vi.fn(),
  resolveTextRangeInBlock: vi.fn(),
  getRevision: vi.fn(() => '0'),
  checkRevision: vi.fn(),
  incrementRevision: vi.fn(() => '1'),
  captureRunsInRange: vi.fn(),
  resolveInlineStyle: vi.fn(() => []),
  applyDirectMutationMeta: vi.fn(),
  applyTrackedMutationMeta: vi.fn(),
  mapBlockNodeType: vi.fn(),
}));

vi.mock('../helpers/index-cache.js', () => ({
  getBlockIndex: mockedDeps.getBlockIndex,
}));

vi.mock('../helpers/text-offset-resolver.js', () => ({
  resolveTextRangeInBlock: mockedDeps.resolveTextRangeInBlock,
}));

vi.mock('./revision-tracker.js', () => ({
  getRevision: mockedDeps.getRevision,
  checkRevision: mockedDeps.checkRevision,
  incrementRevision: mockedDeps.incrementRevision,
}));

vi.mock('./style-resolver.js', () => ({
  captureRunsInRange: mockedDeps.captureRunsInRange,
  resolveInlineStyle: mockedDeps.resolveInlineStyle,
}));

vi.mock('../helpers/transaction-meta.js', () => ({
  applyDirectMutationMeta: mockedDeps.applyDirectMutationMeta,
  applyTrackedMutationMeta: mockedDeps.applyTrackedMutationMeta,
}));

vi.mock('../helpers/node-address-resolver.js', () => ({
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
function makeFreshEditor(): { editor: Editor; dispatch: ReturnType<typeof vi.fn> } {
  const boldMark = mockMark('bold');
  const tr = {
    replaceWith: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
    addMark: vi.fn(),
    removeMark: vi.fn(),
    setMeta: vi.fn(),
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

  const dispatch = vi.fn();

  const editor = {
    state: {
      doc: {
        textContent: 'Hello world',
        textBetween: vi.fn(() => 'Hello world'),
        nodesBetween: vi.fn(),
      },
      tr,
      schema: {
        marks: {
          bold: { create: vi.fn(() => boldMark) },
          italic: { create: vi.fn(() => mockMark('italic')) },
          underline: { create: vi.fn(() => mockMark('underline')) },
          strike: { create: vi.fn(() => mockMark('strike')) },
        },
        text: vi.fn((t: string, m?: unknown[]) => ({
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
      vi.clearAllMocks();
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
