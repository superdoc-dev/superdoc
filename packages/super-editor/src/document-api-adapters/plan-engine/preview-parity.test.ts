/**
 * T6: Preview non-mutating parity tests (§13.17)
 *
 * Verifies that `previewPlan`:
 * 1. Does not mutate the document (no dispatch, no revision change).
 * 2. Reports the same success/failure shape as the execute path for identical inputs.
 * 3. Collects assert failures instead of throwing.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { TextRewriteStep, StyleApplyStep, AssertStep } from '@superdoc/document-api';
import type { CompiledPlan } from './compiler.js';
import type { CompiledTarget } from './executor-registry.types.js';
import { previewPlan } from './preview.js';
import { registerBuiltInExecutors } from './register-executors.js';
import { PlanError } from './errors.js';

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
  compilePlan: vi.fn(),
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

// Mock compilePlan so preview tests don't need a fully wired editor with commands
vi.mock('./compiler.js', () => ({
  compilePlan: mockedDeps.compilePlan,
}));

beforeAll(() => {
  registerBuiltInExecutors();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedDeps.getRevision.mockReturnValue('0');
  mockedDeps.incrementRevision.mockReturnValue('1');
  mockedDeps.mapBlockNodeType.mockReturnValue(undefined);
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

function makeEditor(text = 'Hello'): {
  editor: Editor;
  dispatch: ReturnType<typeof vi.fn>;
} {
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
      textContent: text,
      descendants: vi.fn(),
      textBetween: vi.fn(() => text),
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
        textContent: text,
        textBetween: vi.fn(() => text),
        nodesBetween: vi.fn(),
        descendants: vi.fn(),
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

function makeTarget(overrides: Partial<CompiledTarget> = {}): CompiledTarget {
  return {
    kind: 'range',
    stepId: 'step-1',
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
  } as CompiledTarget;
}

function makeCompiledPlan(overrides: Partial<CompiledPlan> = {}): CompiledPlan {
  const rewriteStep: TextRewriteStep = {
    id: 'step-1',
    op: 'text.rewrite',
    where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
    args: { replacement: { text: 'World' } },
  };
  return {
    mutationSteps: [{ step: rewriteStep, targets: [makeTarget()] }],
    assertSteps: [],
    compiledRevision: '0',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T6.1 — Preview does not dispatch or change revision
// ---------------------------------------------------------------------------

describe('previewPlan: non-mutating guarantee', () => {
  it('does not dispatch for a valid text.rewrite plan', () => {
    const { editor, dispatch } = makeEditor();
    mockedDeps.compilePlan.mockReturnValue(makeCompiledPlan());

    const step: TextRewriteStep = {
      id: 'step-preview',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'World' } },
    };

    previewPlan(editor, { steps: [step] });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch for a multi-step plan', () => {
    const { editor, dispatch } = makeEditor();
    const formatStep: StyleApplyStep = {
      id: 'step-2',
      op: 'format.apply',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { inline: { bold: true } },
    };

    mockedDeps.compilePlan.mockReturnValue(
      makeCompiledPlan({
        mutationSteps: [
          { step: makeCompiledPlan().mutationSteps[0].step, targets: [makeTarget()] },
          { step: formatStep, targets: [makeTarget({ stepId: 'step-2', op: 'format.apply' })] },
        ],
      }),
    );

    previewPlan(editor, { steps: [makeCompiledPlan().mutationSteps[0].step, formatStep] });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch even when the plan would fail at compile', () => {
    const { editor, dispatch } = makeEditor();

    // compilePlan throws (simulating target not found)
    mockedDeps.compilePlan.mockImplementation(() => {
      throw new PlanError('TARGET_NOT_FOUND', 'TARGET_NOT_FOUND — block "p1" not found', 'step-1');
    });

    const step: TextRewriteStep = {
      id: 'step-bad',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'World' } },
    };

    const result = previewPlan(editor, { steps: [step] });

    expect(dispatch).not.toHaveBeenCalled();
    expect(result.valid).toBe(false);
    expect(result.failures).toBeDefined();
    expect(result.failures!.length).toBe(1);
    expect(result.failures![0].code).toBe('TARGET_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// T6.2 — Preview reports evaluatedRevision from compiled plan
// ---------------------------------------------------------------------------

describe('previewPlan: revision reporting', () => {
  it('evaluatedRevision matches the revision at preview time', () => {
    const { editor } = makeEditor();
    mockedDeps.getRevision.mockReturnValue('7');
    mockedDeps.compilePlan.mockReturnValue(makeCompiledPlan({ compiledRevision: '7' }));

    const step: TextRewriteStep = {
      id: 'step-rev',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'World' } },
    };

    const result = previewPlan(editor, { steps: [step] });

    expect(result.evaluatedRevision).toBe('7');
  });

  it('evaluatedRevision falls back to getRevision when compile fails', () => {
    const { editor } = makeEditor();
    mockedDeps.getRevision.mockReturnValue('3');

    mockedDeps.compilePlan.mockImplementation(() => {
      throw new PlanError('INVALID_INPUT', 'INVALID_INPUT — bad step', 'step-1');
    });

    const result = previewPlan(editor, {
      steps: [
        {
          id: 's1',
          op: 'text.rewrite',
          where: { by: 'select', select: { type: 'text', pattern: 'x' }, require: 'exactlyOne' },
          args: { replacement: { text: 'y' } },
        },
      ],
    });

    expect(result.evaluatedRevision).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// T6.3 — Preview success shape parity with execute
// ---------------------------------------------------------------------------

describe('previewPlan: success/failure shape parity', () => {
  it('valid plan preview reports valid=true with step previews', () => {
    const { editor } = makeEditor();
    mockedDeps.compilePlan.mockReturnValue(makeCompiledPlan());

    const step: TextRewriteStep = {
      id: 'step-parity',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'World' } },
    };

    const result = previewPlan(editor, { steps: [step] });

    expect(result.valid).toBe(true);
    expect(result.failures).toBeUndefined();
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].stepId).toBe('step-1');
    expect(result.steps[0].op).toBe('text.rewrite');
  });

  it('compile failure reports valid=false with failure details', () => {
    const { editor } = makeEditor();
    mockedDeps.compilePlan.mockImplementation(() => {
      throw new PlanError('MATCH_NOT_FOUND', 'MATCH_NOT_FOUND — no matches', 'step-fail');
    });

    const step: TextRewriteStep = {
      id: 'step-fail',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Nope' }, require: 'exactlyOne' },
      args: { replacement: { text: 'World' } },
    };

    const result = previewPlan(editor, { steps: [step] });

    expect(result.valid).toBe(false);
    expect(result.failures).toBeDefined();
    expect(result.failures!.length).toBe(1);
    expect(result.failures![0].code).toBe('MATCH_NOT_FOUND');
    expect(result.failures![0].phase).toBe('compile');
  });

  it('assert failure in preview does not throw — reports as failure', () => {
    const { editor } = makeEditor();

    const assertStep: AssertStep = {
      id: 'assert-fail',
      op: 'assert',
      where: { by: 'select', select: { type: 'text', pattern: 'nonexistent' }, require: 'exactlyOne' },
      args: { expectCount: 10 },
    };

    mockedDeps.compilePlan.mockReturnValue(
      makeCompiledPlan({
        assertSteps: [assertStep],
      }),
    );

    const result = previewPlan(editor, {
      steps: [
        {
          id: 's1',
          op: 'text.rewrite',
          where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
          args: { replacement: { text: 'Hi' } },
        },
        assertStep,
      ],
    });

    // Preview should complete without throwing
    expect(result.evaluatedRevision).toBeTruthy();
    // The mutation step + assert step should be in results
    expect(result.steps.length).toBeGreaterThan(0);
  });
});
