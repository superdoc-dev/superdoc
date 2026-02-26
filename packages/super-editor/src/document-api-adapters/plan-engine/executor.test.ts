import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { TextRewriteStep, StyleApplyStep, AssertStep } from '@superdoc/document-api';
import type { CompiledTarget } from './executor-registry.types.js';
import type { CompiledPlan } from './compiler.js';
import {
  executeCompiledPlan,
  executeCreateStep,
  executeSpanTextDelete,
  executeSpanTextRewrite,
  runMutationsOnTransaction,
} from './executor.js';
import { registerBuiltInExecutors } from './register-executors.js';
import { PlanError } from './errors.js';
import { Schema } from 'prosemirror-model';

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

// Register built-in executors once
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
  tr: {
    replaceWith: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    addMark: ReturnType<typeof vi.fn>;
    removeMark: ReturnType<typeof vi.fn>;
    setMeta: ReturnType<typeof vi.fn>;
  };
  dispatch: ReturnType<typeof vi.fn>;
} {
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
    },
  };
  tr.replaceWith.mockReturnValue(tr);
  tr.delete.mockReturnValue(tr);
  tr.insert.mockReturnValue(tr);
  tr.addMark.mockReturnValue(tr);
  tr.removeMark.mockReturnValue(tr);
  tr.setMeta.mockReturnValue(tr);

  const boldMark = mockMark('bold');
  const italicMark = mockMark('italic');

  const dispatch = vi.fn();

  const editor = {
    state: {
      doc: {
        textContent: text,
        textBetween: vi.fn((from: number, to: number) => {
          const start = Math.max(0, from - 1);
          const end = Math.max(start, to - 1);
          return text.slice(start, end);
        }),
        nodesBetween: vi.fn(),
      },
      tr,
      schema: {
        marks: {
          bold: { create: vi.fn(() => boldMark) },
          italic: { create: vi.fn(() => italicMark) },
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

  return { editor, tr, dispatch };
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
    ...overrides,
  } as CompiledTarget;
}

function setupBlockIndex(candidates: Array<{ nodeId: string; pos: number; node: any }>) {
  mockedDeps.getBlockIndex.mockReturnValue({ candidates });
}

function setupResolveTextRange(from: number, to: number) {
  mockedDeps.resolveTextRangeInBlock.mockReturnValue({ from, to });
}

// ---------------------------------------------------------------------------
// text.rewrite — style preservation behavioral tests
// ---------------------------------------------------------------------------

describe('executeCompiledPlan: text.rewrite style behavior', () => {
  it('uses capturedStyle from compilation when style is omitted (preserve + majority default)', () => {
    const { editor, tr } = makeEditor();
    const boldMark = mockMark('bold');
    const resolvedMarks = [boldMark];

    // Setup: block index knows about p1
    setupBlockIndex([{ nodeId: 'p1', pos: 0, node: {} }]);
    // The resolver maps block-relative [0,5) to absolute PM positions [1,6)
    setupResolveTextRange(1, 6);

    // resolveInlineStyle should be called with the capturedStyle and DEFAULT policy
    mockedDeps.resolveInlineStyle.mockReturnValue(resolvedMarks);

    const capturedStyle = {
      runs: [{ from: 0, to: 5, charCount: 5, marks: [boldMark] }],
      isUniform: true,
    };

    const step: TextRewriteStep = {
      id: 'step-1',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'World' } },
      // style intentionally omitted
    };

    const compiled: CompiledPlan = {
      mutationSteps: [
        {
          step,
          targets: [makeTarget({ capturedStyle })],
        },
      ],
      assertSteps: [],
      compiledRevision: '0',
    };

    const receipt = executeCompiledPlan(editor, compiled);

    // resolveInlineStyle should have been called with captured style + default preserve policy
    expect(mockedDeps.resolveInlineStyle).toHaveBeenCalledWith(
      editor,
      capturedStyle,
      { mode: 'preserve', onNonUniform: 'majority' },
      'step-1',
    );

    // The resolved marks should be passed to schema.text() for the replacement
    expect(editor.state.schema.text).toHaveBeenCalledWith('World', resolvedMarks);

    // tr.replaceWith should be called with the text node
    expect(tr.replaceWith).toHaveBeenCalled();

    expect(receipt.success).toBe(true);
    expect(receipt.steps[0].effect).toBe('changed');
  });

  it('uses explicit style policy when provided on text.rewrite', () => {
    const { editor, tr } = makeEditor();
    const italicMark = mockMark('italic');

    setupBlockIndex([{ nodeId: 'p1', pos: 0, node: {} }]);
    setupResolveTextRange(1, 6);
    mockedDeps.resolveInlineStyle.mockReturnValue([italicMark]);

    const step: TextRewriteStep = {
      id: 'step-2',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: {
        replacement: { text: 'World' },
        style: {
          inline: { mode: 'set', setMarks: { italic: true } },
          paragraph: { mode: 'preserve' },
        },
      },
    };

    const capturedStyle = {
      runs: [{ from: 0, to: 5, charCount: 5, marks: [mockMark('bold')] }],
      isUniform: true,
    };

    const compiled: CompiledPlan = {
      mutationSteps: [
        {
          step,
          targets: [makeTarget({ capturedStyle })],
        },
      ],
      assertSteps: [],
      compiledRevision: '0',
    };

    executeCompiledPlan(editor, compiled);

    // resolveInlineStyle should receive the explicit policy, not the default
    expect(mockedDeps.resolveInlineStyle).toHaveBeenCalledWith(
      editor,
      capturedStyle,
      { mode: 'set', setMarks: { italic: true } },
      'step-2',
    );
  });

  it('falls back to runtime capture when capturedStyle is absent', () => {
    const { editor } = makeEditor();
    const boldMark = mockMark('bold');

    setupBlockIndex([{ nodeId: 'p1', pos: 0, node: {} }]);
    setupResolveTextRange(1, 6);

    // captureRunsInRange is the runtime fallback
    mockedDeps.captureRunsInRange.mockReturnValue({
      runs: [{ from: 0, to: 5, charCount: 5, marks: [boldMark] }],
      isUniform: true,
    });
    mockedDeps.resolveInlineStyle.mockReturnValue([boldMark]);

    const step: TextRewriteStep = {
      id: 'step-3',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'World' } },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [
        {
          step,
          // No capturedStyle on target — executor must capture at runtime
          targets: [makeTarget({ capturedStyle: undefined })],
        },
      ],
      assertSteps: [],
      compiledRevision: '0',
    };

    executeCompiledPlan(editor, compiled);

    // captureRunsInRange should be called as fallback
    expect(mockedDeps.captureRunsInRange).toHaveBeenCalledWith(editor, 0, 0, 5);
  });

  it('produces noop effect when replacement text equals original', () => {
    const { editor } = makeEditor();

    setupBlockIndex([{ nodeId: 'p1', pos: 0, node: {} }]);
    setupResolveTextRange(1, 6);
    mockedDeps.resolveInlineStyle.mockReturnValue([]);

    const step: TextRewriteStep = {
      id: 'step-4',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'Hello' } }, // same text
    };

    const compiled: CompiledPlan = {
      mutationSteps: [
        {
          step,
          targets: [makeTarget({ text: 'Hello' })],
        },
      ],
      assertSteps: [],
      compiledRevision: '0',
    };

    const receipt = executeCompiledPlan(editor, compiled);

    // Effect should be noop since text didn't change
    expect(receipt.steps[0].effect).toBe('noop');
  });
});

// ---------------------------------------------------------------------------
// text.rewrite — multi-target execution
// ---------------------------------------------------------------------------

describe('executeCompiledPlan: multi-target rewrite', () => {
  it('applies rewrite to multiple targets with independent styles', () => {
    const { editor, tr } = makeEditor('Hello World');
    const boldMark = mockMark('bold');
    const italicMark = mockMark('italic');

    setupBlockIndex([
      { nodeId: 'p1', pos: 0, node: {} },
      { nodeId: 'p2', pos: 10, node: {} },
    ]);
    // Resolve targets at different positions
    mockedDeps.resolveTextRangeInBlock
      .mockReturnValueOnce({ from: 1, to: 6 }) // p1: [0,5) → abs [1,6)
      .mockReturnValueOnce({ from: 11, to: 16 }); // p2: [0,5) → abs [11,16)

    mockedDeps.resolveInlineStyle
      .mockReturnValueOnce([boldMark]) // first target: bold
      .mockReturnValueOnce([italicMark]); // second target: italic

    const step: TextRewriteStep = {
      id: 'step-multi',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'all' },
      args: { replacement: { text: 'World' } },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [
        {
          step,
          targets: [
            makeTarget({
              blockId: 'p1',
              from: 0,
              to: 5,
              text: 'Hello',
              capturedStyle: {
                runs: [{ from: 0, to: 5, charCount: 5, marks: [boldMark] }],
                isUniform: true,
              },
            }),
            makeTarget({
              stepId: 'step-multi',
              blockId: 'p2',
              from: 0,
              to: 5,
              text: 'Hello',
              capturedStyle: {
                runs: [{ from: 0, to: 5, charCount: 5, marks: [italicMark] }],
                isUniform: true,
              },
            }),
          ],
        },
      ],
      assertSteps: [],
      compiledRevision: '0',
    };

    const receipt = executeCompiledPlan(editor, compiled);

    // Two calls to schema.text — one per target
    expect(editor.state.schema.text).toHaveBeenCalledTimes(2);
    // Two calls to tr.replaceWith
    expect(tr.replaceWith).toHaveBeenCalledTimes(2);
    expect(receipt.steps[0].matchCount).toBe(2);
    expect(receipt.steps[0].effect).toBe('changed');
  });
});

// ---------------------------------------------------------------------------
// Assert steps — node selector uses Document API type mapping
// ---------------------------------------------------------------------------

describe('executeAssertStep: node selector uses mapBlockNodeType', () => {
  /** Each entry has a node and a position, matching PM descendants(cb(node, pos)). */
  interface PositionedNode {
    node: { type: { name: string }; isBlock: boolean; nodeSize: number; attrs?: Record<string, unknown> };
    pos: number;
  }

  function makeAssertTr(entries: PositionedNode[]) {
    return {
      mapping: { map: (pos: number) => pos },
      docChanged: false,
      setMeta: vi.fn().mockReturnThis(),
      doc: {
        resolve: () => ({ marks: () => [] }),
        textContent: '',
        descendants: (fn: (node: any, pos: number) => boolean | void) => {
          for (const entry of entries) {
            const result = fn(entry.node, entry.pos);
            if (result === false) break;
          }
        },
      },
    };
  }

  /** Shorthand: nodes at sequential positions (nodeSize=10 each, no scoping concern). */
  function makeSimpleAssertTr(
    nodes: Array<{ type: { name: string }; isBlock: boolean; attrs?: Record<string, unknown> }>,
  ) {
    return makeAssertTr(
      nodes.map((n, i) => ({
        node: {
          ...n,
          nodeSize: 10,
          attrs: {
            nodeId: `node-${i}`,
            ...(n.attrs ?? {}),
          },
        },
        pos: i * 10,
      })),
    );
  }

  it('counts headings via mapBlockNodeType instead of raw PM type name', () => {
    const headingNode = {
      type: { name: 'paragraph' },
      isBlock: true,
      attrs: { paragraphProperties: { styleId: 'Heading1' } },
    };
    const paragraphNode = {
      type: { name: 'paragraph' },
      isBlock: true,
      attrs: {},
    };

    mockedDeps.mapBlockNodeType.mockImplementation((node: any) => {
      if (node.attrs?.paragraphProperties?.styleId === 'Heading1') return 'heading';
      return 'paragraph';
    });

    const { editor } = makeEditor();
    const tr = makeSimpleAssertTr([headingNode, paragraphNode]);
    (editor as any).state.tr = tr;

    const assertStep: AssertStep = {
      id: 'assert-heading',
      op: 'assert',
      where: {
        by: 'select',
        select: { type: 'node', nodeType: 'heading' },
      },
      args: { expectCount: 1 },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [],
      assertSteps: [assertStep],
      compiledRevision: '0',
    };

    const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, { throwOnAssertFailure: false });
    const assertOutcome = stepOutcomes.find((o) => o.stepId === 'assert-heading');

    expect(assertOutcome).toBeDefined();
    expect(assertOutcome!.effect).toBe('assert_passed');
    expect((assertOutcome!.data as any).actualCount).toBe(1);
  });

  it('counts paragraphs excluding heading and listItem nodes', () => {
    const headingNode = { type: { name: 'paragraph' }, isBlock: true, attrs: {} };
    const listItemNode = { type: { name: 'paragraph' }, isBlock: true, attrs: {} };
    const plainParagraph = { type: { name: 'paragraph' }, isBlock: true, attrs: {} };

    mockedDeps.mapBlockNodeType
      .mockReturnValueOnce('heading')
      .mockReturnValueOnce('listItem')
      .mockReturnValueOnce('paragraph');

    const { editor } = makeEditor();
    const tr = makeSimpleAssertTr([headingNode, listItemNode, plainParagraph]);
    (editor as any).state.tr = tr;

    const assertStep: AssertStep = {
      id: 'assert-para',
      op: 'assert',
      where: {
        by: 'select',
        select: { type: 'node', nodeType: 'paragraph' },
      },
      args: { expectCount: 1 },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [],
      assertSteps: [assertStep],
      compiledRevision: '0',
    };

    const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, { throwOnAssertFailure: false });
    const assertOutcome = stepOutcomes.find((o) => o.stepId === 'assert-para');

    expect(assertOutcome!.effect).toBe('assert_passed');
    expect((assertOutcome!.data as any).actualCount).toBe(1);
  });

  it('fails assert when heading count does not match expectation', () => {
    const node1 = { type: { name: 'paragraph' }, isBlock: true, attrs: {} };
    const node2 = { type: { name: 'paragraph' }, isBlock: true, attrs: {} };

    mockedDeps.mapBlockNodeType.mockReturnValueOnce('heading').mockReturnValueOnce('heading');

    const { editor } = makeEditor();
    const tr = makeSimpleAssertTr([node1, node2]);
    (editor as any).state.tr = tr;

    const assertStep: AssertStep = {
      id: 'assert-one-heading',
      op: 'assert',
      where: {
        by: 'select',
        select: { type: 'node', nodeType: 'heading' },
      },
      args: { expectCount: 1 },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [],
      assertSteps: [assertStep],
      compiledRevision: '0',
    };

    const { stepOutcomes, assertFailures } = runMutationsOnTransaction(editor, tr, compiled, {
      throwOnAssertFailure: false,
    });
    const assertOutcome = stepOutcomes.find((o) => o.stepId === 'assert-one-heading');

    expect(assertOutcome!.effect).toBe('assert_failed');
    expect((assertOutcome!.data as any).actualCount).toBe(2);
    expect(assertFailures).toHaveLength(1);
  });

  it('counts listItem nodes correctly via mapBlockNodeType', () => {
    const nodes = [
      { type: { name: 'paragraph' }, isBlock: true, attrs: {} },
      { type: { name: 'paragraph' }, isBlock: true, attrs: {} },
      { type: { name: 'paragraph' }, isBlock: true, attrs: {} },
    ];

    mockedDeps.mapBlockNodeType
      .mockReturnValueOnce('listItem')
      .mockReturnValueOnce('listItem')
      .mockReturnValueOnce('paragraph');

    const { editor } = makeEditor();
    const tr = makeSimpleAssertTr(nodes);
    (editor as any).state.tr = tr;

    const assertStep: AssertStep = {
      id: 'assert-list',
      op: 'assert',
      where: {
        by: 'select',
        select: { type: 'node', nodeType: 'listItem' },
      },
      args: { expectCount: 2 },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [],
      assertSteps: [assertStep],
      compiledRevision: '0',
    };

    const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, { throwOnAssertFailure: false });
    const assertOutcome = stepOutcomes.find((o) => o.stepId === 'assert-list');

    expect(assertOutcome!.effect).toBe('assert_passed');
    expect((assertOutcome!.data as any).actualCount).toBe(2);
  });

  // --- within scoping tests ---

  it('scopes node count to descendants of the within block only', () => {
    // Layout: table at pos 0 (nodeSize 50) contains 2 paragraphs,
    // then another paragraph at pos 50 outside the table.
    //
    //   table (pos=0, size=50, id="tbl-1")
    //     paragraph (pos=5, size=10)
    //     paragraph (pos=20, size=10)
    //   paragraph (pos=50, size=10)  ← outside scope
    const entries: PositionedNode[] = [
      { node: { type: { name: 'table' }, isBlock: true, nodeSize: 50, attrs: { nodeId: 'tbl-1' } }, pos: 0 },
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 10, attrs: { paraId: 'p1' } }, pos: 5 },
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 10, attrs: { paraId: 'p2' } }, pos: 20 },
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 10, attrs: { paraId: 'p3' } }, pos: 50 },
    ];

    mockedDeps.mapBlockNodeType.mockImplementation((node: any) => {
      if (node.type.name === 'table') return 'table';
      return 'paragraph';
    });

    const { editor } = makeEditor();
    const tr = makeAssertTr(entries);
    (editor as any).state.tr = tr;

    const assertStep: AssertStep = {
      id: 'assert-scoped',
      op: 'assert',
      where: {
        by: 'select',
        select: { type: 'node', nodeType: 'paragraph' },
        within: { kind: 'block', nodeType: 'table', nodeId: 'tbl-1' },
      },
      args: { expectCount: 2 },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [],
      assertSteps: [assertStep],
      compiledRevision: '0',
    };

    const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, { throwOnAssertFailure: false });
    const assertOutcome = stepOutcomes.find((o) => o.stepId === 'assert-scoped');

    // Only p1 and p2 are inside the table (pos 0..50), p3 is outside
    expect(assertOutcome!.effect).toBe('assert_passed');
    expect((assertOutcome!.data as any).actualCount).toBe(2);
  });

  it('does not count nodes after the scoped block boundary', () => {
    // Same layout but assert expects 3 — should fail because p3 is outside scope
    const entries: PositionedNode[] = [
      { node: { type: { name: 'table' }, isBlock: true, nodeSize: 50, attrs: { nodeId: 'tbl-1' } }, pos: 0 },
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 10, attrs: { paraId: 'p1' } }, pos: 5 },
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 10, attrs: { paraId: 'p2' } }, pos: 20 },
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 10, attrs: { paraId: 'p3' } }, pos: 50 },
    ];

    mockedDeps.mapBlockNodeType.mockImplementation((node: any) => {
      if (node.type.name === 'table') return 'table';
      return 'paragraph';
    });

    const { editor } = makeEditor();
    const tr = makeAssertTr(entries);
    (editor as any).state.tr = tr;

    const assertStep: AssertStep = {
      id: 'assert-leak',
      op: 'assert',
      where: {
        by: 'select',
        select: { type: 'node', nodeType: 'paragraph' },
        within: { kind: 'block', nodeType: 'table', nodeId: 'tbl-1' },
      },
      args: { expectCount: 3 }, // wrong — only 2 are inside
    };

    const compiled: CompiledPlan = {
      mutationSteps: [],
      assertSteps: [assertStep],
      compiledRevision: '0',
    };

    const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, { throwOnAssertFailure: false });
    const assertOutcome = stepOutcomes.find((o) => o.stepId === 'assert-leak');

    expect(assertOutcome!.effect).toBe('assert_failed');
    expect((assertOutcome!.data as any).actualCount).toBe(2);
  });

  it('returns zero when scoped node is not found in document', () => {
    const entries: PositionedNode[] = [
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 10, attrs: { paraId: 'p1' } }, pos: 0 },
    ];

    mockedDeps.mapBlockNodeType.mockReturnValue('paragraph');

    const { editor } = makeEditor();
    const tr = makeAssertTr(entries);
    (editor as any).state.tr = tr;

    const assertStep: AssertStep = {
      id: 'assert-missing-scope',
      op: 'assert',
      where: {
        by: 'select',
        select: { type: 'node', nodeType: 'paragraph' },
        within: { kind: 'block', nodeType: 'table', nodeId: 'nonexistent' },
      },
      args: { expectCount: 0 },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [],
      assertSteps: [assertStep],
      compiledRevision: '0',
    };

    const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, { throwOnAssertFailure: false });
    const assertOutcome = stepOutcomes.find((o) => o.stepId === 'assert-missing-scope');

    expect(assertOutcome!.effect).toBe('assert_passed');
    expect((assertOutcome!.data as any).actualCount).toBe(0);
  });

  // --- Ancestor exclusion ---

  it('includes the scoped container itself when it matches the selector', () => {
    // Scoping within a table: the table itself is inside [start, end] and
    // therefore included by scopeByRange semantics.
    //
    //   table (pos=0, size=50, id="tbl-1")
    //     tableRow (pos=1, size=48)  ← child block
    const entries: PositionedNode[] = [
      { node: { type: { name: 'table' }, isBlock: true, nodeSize: 50, attrs: { nodeId: 'tbl-1' } }, pos: 0 },
      { node: { type: { name: 'tableRow' }, isBlock: true, nodeSize: 48, attrs: { nodeId: 'row-1' } }, pos: 1 },
    ];

    mockedDeps.mapBlockNodeType.mockImplementation((node: any) => {
      if (node.type.name === 'table') return 'table';
      if (node.type.name === 'tableRow') return 'tableRow';
      return 'paragraph';
    });

    const { editor } = makeEditor();
    const tr = makeAssertTr(entries);
    (editor as any).state.tr = tr;

    const assertStep: AssertStep = {
      id: 'assert-no-self',
      op: 'assert',
      where: {
        by: 'select',
        select: { type: 'node', nodeType: 'table' },
        within: { kind: 'block', nodeType: 'table', nodeId: 'tbl-1' },
      },
      args: { expectCount: 1 },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [],
      assertSteps: [assertStep],
      compiledRevision: '0',
    };

    const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, { throwOnAssertFailure: false });
    const assertOutcome = stepOutcomes.find((o) => o.stepId === 'assert-no-self');

    // The scoped table itself is included.
    expect(assertOutcome!.effect).toBe('assert_passed');
    expect((assertOutcome!.data as any).actualCount).toBe(1);
  });

  it('excludes ancestor blocks that overlap the scope range', () => {
    // A document-level container wrapping both the scoped block and its siblings.
    //
    //   section (pos=0, size=100)      ← ancestor, overlaps scope
    //     table (pos=5, size=50, id="tbl-1")  ← scope target
    //       paragraph (pos=10, size=10)
    //     paragraph (pos=60, size=10)  ← outside scope
    const entries: PositionedNode[] = [
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 100, attrs: { nodeId: 'section-1' } }, pos: 0 },
      { node: { type: { name: 'table' }, isBlock: true, nodeSize: 50, attrs: { nodeId: 'tbl-1' } }, pos: 5 },
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 10, attrs: { paraId: 'p-inside' } }, pos: 10 },
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 10, attrs: { paraId: 'p-outside' } }, pos: 60 },
    ];

    mockedDeps.mapBlockNodeType.mockImplementation((node: any) => {
      if (node.type.name === 'table') return 'table';
      return 'paragraph';
    });

    const { editor } = makeEditor();
    const tr = makeAssertTr(entries);
    (editor as any).state.tr = tr;

    const assertStep: AssertStep = {
      id: 'assert-ancestor-excl',
      op: 'assert',
      where: {
        by: 'select',
        select: { type: 'node', nodeType: 'paragraph' },
        within: { kind: 'block', nodeType: 'table', nodeId: 'tbl-1' },
      },
      args: { expectCount: 1 },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [],
      assertSteps: [assertStep],
      compiledRevision: '0',
    };

    const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, { throwOnAssertFailure: false });
    const assertOutcome = stepOutcomes.find((o) => o.stepId === 'assert-ancestor-excl');

    // section-1 at pos=0 is an ancestor (pos < scopeFrom=5), excluded
    // p-inside at pos=10 is inside scope [5, 55), counted
    // p-outside at pos=60 is outside scope, excluded
    expect(assertOutcome!.effect).toBe('assert_passed');
    expect((assertOutcome!.data as any).actualCount).toBe(1);
  });

  // --- Inline within support ---

  it('uses inline within offsets as the scope range', () => {
    // Inline within is resolved to an absolute text range in the target block.
    // Block candidates must be fully contained in that range.
    const entries: PositionedNode[] = [
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 20, attrs: { paraId: 'p1' } }, pos: 0 },
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 10, attrs: { paraId: 'child-1' } }, pos: 1 },
      { node: { type: { name: 'paragraph' }, isBlock: true, nodeSize: 10, attrs: { paraId: 'outside' } }, pos: 25 },
    ];

    mockedDeps.mapBlockNodeType.mockReturnValue('paragraph');

    const { editor } = makeEditor();
    const tr = makeAssertTr(entries);
    (editor as any).state.tr = tr;

    const assertStep: AssertStep = {
      id: 'assert-inline-within',
      op: 'assert',
      where: {
        by: 'select',
        select: { type: 'node', nodeType: 'paragraph' },
        within: {
          kind: 'inline',
          nodeType: 'commentMark',
          anchor: {
            start: { blockId: 'p1', offset: 0 },
            end: { blockId: 'p1', offset: 5 },
          },
        } as any,
      },
      args: { expectCount: 0 },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [],
      assertSteps: [assertStep],
      compiledRevision: '0',
    };

    const { stepOutcomes } = runMutationsOnTransaction(editor, tr, compiled, { throwOnAssertFailure: false });
    const assertOutcome = stepOutcomes.find((o) => o.stepId === 'assert-inline-within');

    // Inline range resolves to [1, 6). None of these block nodes are fully
    // contained within that range, so count is zero.
    expect(assertOutcome!.effect).toBe('assert_passed');
    expect((assertOutcome!.data as any).actualCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Revision tracking — reads revision after dispatch (no manual increment)
// ---------------------------------------------------------------------------

describe('executeCompiledPlan: revision tracking', () => {
  it('reads revision after dispatch instead of manually incrementing', () => {
    const { editor } = makeEditor();

    setupBlockIndex([{ nodeId: 'p1', pos: 0, node: {} }]);
    setupResolveTextRange(1, 6);
    mockedDeps.resolveInlineStyle.mockReturnValue([]);

    // Simulate: getRevision returns '0' initially, then '1' after dispatch
    mockedDeps.getRevision
      .mockReturnValueOnce('0') // revisionBefore
      .mockReturnValueOnce('1'); // revisionAfter (post-dispatch)

    const step: TextRewriteStep = {
      id: 'step-rev',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'World' } },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [
        {
          step,
          targets: [makeTarget()],
        },
      ],
      assertSteps: [],
      compiledRevision: '0',
    };

    const receipt = executeCompiledPlan(editor, compiled);

    // incrementRevision should NOT be called (tracked by transaction listener)
    expect(mockedDeps.incrementRevision).not.toHaveBeenCalled();

    // getRevision should be called twice: once for before, once for after
    expect(mockedDeps.getRevision).toHaveBeenCalledTimes(2);

    expect(receipt.revision.before).toBe('0');
    expect(receipt.revision.after).toBe('1');
  });

  it('returns same revision when no doc changes occur', () => {
    const { editor, tr } = makeEditor();
    // No doc changes
    (tr as any).docChanged = false;

    setupBlockIndex([{ nodeId: 'p1', pos: 0, node: {} }]);
    setupResolveTextRange(1, 6);
    mockedDeps.resolveInlineStyle.mockReturnValue([]);

    mockedDeps.getRevision.mockReturnValue('5');

    const step: TextRewriteStep = {
      id: 'step-noop',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'Hello' } },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [
        {
          step,
          targets: [makeTarget({ text: 'Hello' })],
        },
      ],
      assertSteps: [],
      compiledRevision: '5',
    };

    const receipt = executeCompiledPlan(editor, compiled);

    // No dispatch should have occurred
    expect(editor.dispatch).not.toHaveBeenCalled();
    // Revision unchanged
    expect(receipt.revision.before).toBe('5');
    expect(receipt.revision.after).toBe('5');
  });
});

// ---------------------------------------------------------------------------
// T7: Revision consistency and compile/execute drift detection
// ---------------------------------------------------------------------------

describe('executeCompiledPlan: revision drift guard (D3)', () => {
  it('throws REVISION_CHANGED_SINCE_COMPILE when revision drifts between compile and execute', () => {
    const { editor } = makeEditor();
    setupBlockIndex([{ nodeId: 'p1', pos: 0, node: {} }]);
    setupResolveTextRange(1, 6);
    mockedDeps.resolveInlineStyle.mockReturnValue([]);

    // Simulate: compiled at rev 3, but document is now at rev 5
    mockedDeps.getRevision.mockReturnValue('5');

    const step: TextRewriteStep = {
      id: 'step-drift',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'New' } },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [{ step, targets: [makeTarget()] }],
      assertSteps: [],
      compiledRevision: '3',
    };

    try {
      executeCompiledPlan(editor, compiled);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      const planErr = error as PlanError;
      expect(planErr.code).toBe('REVISION_CHANGED_SINCE_COMPILE');
      expect(planErr.details).toMatchObject({
        compiledRevision: '3',
        currentRevision: '5',
      });
      expect(planErr.details.remediation).toBeTruthy();
      return;
    }
    throw new Error('expected REVISION_CHANGED_SINCE_COMPILE');
  });

  it('does not throw when compiledRevision matches current revision', () => {
    const { editor } = makeEditor();
    setupBlockIndex([{ nodeId: 'p1', pos: 0, node: {} }]);
    setupResolveTextRange(1, 6);
    mockedDeps.resolveInlineStyle.mockReturnValue([]);
    mockedDeps.getRevision.mockReturnValue('0');

    const step: TextRewriteStep = {
      id: 'step-ok',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'New' } },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [{ step, targets: [makeTarget()] }],
      assertSteps: [],
      compiledRevision: '0',
    };

    expect(() => executeCompiledPlan(editor, compiled)).not.toThrow();
  });

  it('revision.before matches compiledRevision on success', () => {
    const { editor } = makeEditor();
    setupBlockIndex([{ nodeId: 'p1', pos: 0, node: {} }]);
    setupResolveTextRange(1, 6);
    mockedDeps.resolveInlineStyle.mockReturnValue([]);

    // First call: before (returns '2'), second call: after (returns '3')
    mockedDeps.getRevision.mockReturnValueOnce('2').mockReturnValueOnce('3');

    const step: TextRewriteStep = {
      id: 'step-rev',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'Changed' } },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [{ step, targets: [makeTarget()] }],
      assertSteps: [],
      compiledRevision: '2',
    };

    const receipt = executeCompiledPlan(editor, compiled);
    expect(receipt.revision.before).toBe('2');
    expect(receipt.revision.after).toBe('3');
  });

  it('multi-step plan produces single revision bump', () => {
    const { editor } = makeEditor();
    setupBlockIndex([{ nodeId: 'p1', pos: 0, node: {} }]);
    setupResolveTextRange(1, 6);
    mockedDeps.resolveInlineStyle.mockReturnValue([]);

    // before → '0', after → '1' (one bump for the whole plan)
    mockedDeps.getRevision.mockReturnValueOnce('0').mockReturnValueOnce('1');

    const step1: TextRewriteStep = {
      id: 'step-multi-1',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'Hi' } },
    };
    const step2: StyleApplyStep = {
      id: 'step-multi-2',
      op: 'format.apply',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { inline: { bold: true } },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [
        { step: step1, targets: [makeTarget()] },
        { step: step2, targets: [makeTarget()] },
      ],
      assertSteps: [],
      compiledRevision: '0',
    };

    const receipt = executeCompiledPlan(editor, compiled);
    expect(receipt.revision.before).toBe('0');
    expect(receipt.revision.after).toBe('1');
    expect(receipt.steps.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// executeCreateStep — block-anchor position and duplicate ID detection
// ---------------------------------------------------------------------------

describe('executeCreateStep: block-anchor position resolution', () => {
  function makeCreateEditor(candidateNodeSize: number) {
    const insertedNode = {
      type: { name: 'paragraph' },
      isTextblock: true,
      attrs: {},
    };

    const paragraphType = {
      createAndFill: vi.fn(() => insertedNode),
      create: vi.fn(() => insertedNode),
    };

    const tr = {
      insert: vi.fn(),
      mapping: { map: (pos: number) => pos },
      doc: {
        descendants: vi.fn((fn: (node: any) => boolean | void) => {
          fn({ isTextblock: true, attrs: { paraId: 'p1' } });
          fn({ isTextblock: true, attrs: {} });
        }),
      },
    };

    const editor = {
      state: {
        schema: {
          nodes: { paragraph: paragraphType },
          text: vi.fn((t: string) => ({ type: { name: 'text' }, text: t })),
        },
      },
    } as unknown as Editor;

    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [{ nodeId: 'p1', pos: 10, end: 10 + candidateNodeSize, nodeSize: candidateNodeSize, node: {} }],
    });

    return { editor, tr, paragraphType };
  }

  it('inserts after the anchor block when position is "after"', () => {
    const nodeSize = 20;
    const { editor, tr } = makeCreateEditor(nodeSize);
    const step = { id: 'create-1', op: 'create.paragraph', args: { position: 'after', text: 'New' } } as any;
    const targets = [makeTarget({ blockId: 'p1', kind: 'range' })];
    const mapping = { map: (pos: number) => pos } as any;

    executeCreateStep(editor, tr as any, step, targets, mapping);

    // 'after' → candidate.pos + candidate.nodeSize = 10 + 20 = 30
    expect(tr.insert).toHaveBeenCalledWith(30, expect.anything());
  });

  it('inserts before the anchor block when position is "before"', () => {
    const nodeSize = 20;
    const { editor, tr } = makeCreateEditor(nodeSize);
    const step = { id: 'create-2', op: 'create.paragraph', args: { position: 'before', text: 'New' } } as any;
    const targets = [makeTarget({ blockId: 'p1', kind: 'range' })];
    const mapping = { map: (pos: number) => pos } as any;

    executeCreateStep(editor, tr as any, step, targets, mapping);

    // 'before' → candidate.pos = 10
    expect(tr.insert).toHaveBeenCalledWith(10, expect.anything());
  });

  it('defaults position to "after" when omitted', () => {
    const nodeSize = 15;
    const { editor, tr } = makeCreateEditor(nodeSize);
    const step = { id: 'create-3', op: 'create.paragraph', args: { text: 'New' } } as any;
    const targets = [makeTarget({ blockId: 'p1', kind: 'range' })];
    const mapping = { map: (pos: number) => pos } as any;

    executeCreateStep(editor, tr as any, step, targets, mapping);

    // default 'after' → candidate.pos + candidate.nodeSize = 10 + 15 = 25
    expect(tr.insert).toHaveBeenCalledWith(25, expect.anything());
  });

  it('throws TARGET_NOT_FOUND when anchor block is missing', () => {
    const { editor, tr } = makeCreateEditor(20);
    // Override to return empty index
    mockedDeps.getBlockIndex.mockReturnValue({ candidates: [] });

    const step = { id: 'create-missing', op: 'create.paragraph', args: { position: 'after', text: 'New' } } as any;
    const targets = [makeTarget({ blockId: 'p1', kind: 'range' })];
    const mapping = { map: (pos: number) => pos } as any;

    try {
      executeCreateStep(editor, tr as any, step, targets, mapping);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('TARGET_NOT_FOUND');
      return;
    }

    throw new Error('expected TARGET_NOT_FOUND');
  });
});

describe('executeCreateStep: post-insert duplicate ID detection', () => {
  it('throws INTERNAL_ERROR when insertion creates duplicate block IDs', () => {
    const insertedNode = {
      type: { name: 'paragraph' },
      isTextblock: true,
      attrs: {},
    };

    const paragraphType = {
      createAndFill: vi.fn(() => insertedNode),
      create: vi.fn(() => insertedNode),
    };

    const tr = {
      insert: vi.fn(),
      mapping: { map: (pos: number) => pos },
      doc: {
        descendants: vi.fn((fn: (node: any) => boolean | void) => {
          // Simulate two textblocks with the same paraId after insertion
          fn({ isTextblock: true, attrs: { paraId: 'dup-id' } });
          fn({ isTextblock: true, attrs: { paraId: 'dup-id' } });
        }),
      },
    };

    const editor = {
      state: {
        schema: {
          nodes: { paragraph: paragraphType },
          text: vi.fn((t: string) => ({ type: { name: 'text' }, text: t })),
        },
      },
    } as unknown as Editor;

    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [{ nodeId: 'p1', pos: 0, end: 10, nodeSize: 10, node: {} }],
    });

    const step = { id: 'create-dup', op: 'create.paragraph', args: { position: 'after', text: 'New' } } as any;
    const targets = [makeTarget({ blockId: 'p1', kind: 'range' })];
    const mapping = { map: (pos: number) => pos } as any;

    try {
      executeCreateStep(editor, tr as any, step, targets, mapping);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('INTERNAL_ERROR');
      expect((error as PlanError).details).toMatchObject({ duplicateBlockIds: ['dup-id'] });
      expect((error as PlanError).details).toHaveProperty('source');
      expect((error as PlanError).details).toHaveProperty('invariant');
      return;
    }

    throw new Error('expected INTERNAL_ERROR for duplicate block IDs');
  });

  it('does not throw when all post-insert block IDs are unique', () => {
    const insertedNode = {
      type: { name: 'paragraph' },
      isTextblock: true,
      attrs: {},
    };

    const paragraphType = {
      createAndFill: vi.fn(() => insertedNode),
      create: vi.fn(() => insertedNode),
    };

    const tr = {
      insert: vi.fn(),
      mapping: { map: (pos: number) => pos },
      doc: {
        descendants: vi.fn((fn: (node: any) => boolean | void) => {
          fn({ isTextblock: true, attrs: { paraId: 'id-a' } });
          fn({ isTextblock: true, attrs: { paraId: 'id-b' } });
          fn({ isTextblock: true, attrs: { sdBlockId: 'id-c' } });
        }),
      },
    };

    const editor = {
      state: {
        schema: {
          nodes: { paragraph: paragraphType },
          text: vi.fn((t: string) => ({ type: { name: 'text' }, text: t })),
        },
      },
    } as unknown as Editor;

    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [{ nodeId: 'p1', pos: 0, end: 10, nodeSize: 10, node: {} }],
    });

    const step = { id: 'create-ok', op: 'create.paragraph', args: { position: 'after', text: 'New' } } as any;
    const targets = [makeTarget({ blockId: 'p1', kind: 'range' })];
    const mapping = { map: (pos: number) => pos } as any;

    expect(() => executeCreateStep(editor, tr as any, step, targets, mapping)).not.toThrow();
  });

  it('skips non-textblock nodes during duplicate check', () => {
    const insertedNode = {
      type: { name: 'paragraph' },
      isTextblock: true,
      attrs: {},
    };

    const paragraphType = {
      createAndFill: vi.fn(() => insertedNode),
      create: vi.fn(() => insertedNode),
    };

    const tr = {
      insert: vi.fn(),
      mapping: { map: (pos: number) => pos },
      doc: {
        descendants: vi.fn((fn: (node: any) => boolean | void) => {
          // Two container blocks with same ID — should not trigger the check
          fn({ isTextblock: false, attrs: { nodeId: 'container-1' } });
          fn({ isTextblock: false, attrs: { nodeId: 'container-1' } });
          // One textblock with unique ID
          fn({ isTextblock: true, attrs: { paraId: 'unique' } });
        }),
      },
    };

    const editor = {
      state: {
        schema: {
          nodes: { paragraph: paragraphType },
          text: vi.fn((t: string) => ({ type: { name: 'text' }, text: t })),
        },
      },
    } as unknown as Editor;

    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [{ nodeId: 'p1', pos: 0, end: 10, nodeSize: 10, node: {} }],
    });

    const step = { id: 'create-skip', op: 'create.paragraph', args: { position: 'after', text: 'X' } } as any;
    const targets = [makeTarget({ blockId: 'p1', kind: 'range' })];
    const mapping = { map: (pos: number) => pos } as any;

    // Should not throw — non-textblock duplicates are ignored
    expect(() => executeCreateStep(editor, tr as any, step, targets, mapping)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// executeCreateStep — span target (multi-block ref) support
// ---------------------------------------------------------------------------

describe('executeCreateStep: span target (multi-block create ref)', () => {
  function makeSpanCreateEditor(candidates: Array<{ nodeId: string; pos: number; nodeSize: number }>) {
    const insertedNode = {
      type: { name: 'paragraph' },
      isTextblock: true,
      attrs: {},
    };

    const paragraphType = {
      createAndFill: vi.fn(() => insertedNode),
      create: vi.fn(() => insertedNode),
    };

    const tr = {
      insert: vi.fn(),
      mapping: { map: (pos: number) => pos },
      doc: {
        descendants: vi.fn((fn: (node: any) => boolean | void) => {
          // All unique IDs — no duplicate-ID failures
          for (let i = 0; i < candidates.length + 1; i++) {
            fn({ isTextblock: true, attrs: { paraId: `unique-${i}` } });
          }
        }),
      },
    };

    const editor = {
      state: {
        schema: {
          nodes: { paragraph: paragraphType },
          text: vi.fn((t: string) => ({ type: { name: 'text' }, text: t })),
        },
      },
    } as unknown as Editor;

    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: candidates.map((c) => ({ ...c, end: c.pos + c.nodeSize, node: {} })),
    });

    return { editor, tr, paragraphType };
  }

  function makeSpanTarget(segments: Array<{ blockId: string; from: number; to: number }>): CompiledTarget {
    return {
      kind: 'span',
      stepId: 'span-create',
      op: 'create.paragraph',
      matchId: 'match-1',
      segments: segments.map((s) => ({
        ...s,
        absFrom: s.from,
        absTo: s.to,
      })),
      text: 'span text',
      marks: [],
    } as CompiledTarget;
  }

  it('anchors to last segment block when position is "after" (multi-block ref)', () => {
    const candidates = [
      { nodeId: 'p1', pos: 10, nodeSize: 20 },
      { nodeId: 'p2', pos: 30, nodeSize: 25 },
      { nodeId: 'p3', pos: 55, nodeSize: 15 },
    ];
    const { editor, tr } = makeSpanCreateEditor(candidates);

    const step = { id: 'span-create-after', op: 'create.paragraph', args: { position: 'after', text: 'New' } } as any;
    const target = makeSpanTarget([
      { blockId: 'p1', from: 0, to: 5 },
      { blockId: 'p2', from: 0, to: 10 },
      { blockId: 'p3', from: 0, to: 8 },
    ]);
    const mapping = { map: (pos: number) => pos } as any;

    executeCreateStep(editor, tr as any, step, [target], mapping);

    // 'after' on last segment (p3): candidate.pos + candidate.nodeSize = 55 + 15 = 70
    expect(tr.insert).toHaveBeenCalledWith(70, expect.anything());
  });

  it('anchors to first segment block when position is "before" (multi-block ref)', () => {
    const candidates = [
      { nodeId: 'p1', pos: 10, nodeSize: 20 },
      { nodeId: 'p2', pos: 30, nodeSize: 25 },
    ];
    const { editor, tr } = makeSpanCreateEditor(candidates);

    const step = { id: 'span-create-before', op: 'create.paragraph', args: { position: 'before', text: 'New' } } as any;
    const target = makeSpanTarget([
      { blockId: 'p1', from: 0, to: 5 },
      { blockId: 'p2', from: 0, to: 10 },
    ]);
    const mapping = { map: (pos: number) => pos } as any;

    executeCreateStep(editor, tr as any, step, [target], mapping);

    // 'before' on first segment (p1): candidate.pos = 10
    expect(tr.insert).toHaveBeenCalledWith(10, expect.anything());
  });

  it('defaults to "after" on last segment when position is omitted (multi-block ref)', () => {
    const candidates = [
      { nodeId: 'p1', pos: 5, nodeSize: 10 },
      { nodeId: 'p2', pos: 15, nodeSize: 20 },
    ];
    const { editor, tr } = makeSpanCreateEditor(candidates);

    const step = { id: 'span-create-default', op: 'create.paragraph', args: { text: 'New' } } as any;
    const target = makeSpanTarget([
      { blockId: 'p1', from: 0, to: 3 },
      { blockId: 'p2', from: 0, to: 8 },
    ]);
    const mapping = { map: (pos: number) => pos } as any;

    executeCreateStep(editor, tr as any, step, [target], mapping);

    // default 'after' on last segment (p2): candidate.pos + candidate.nodeSize = 15 + 20 = 35
    expect(tr.insert).toHaveBeenCalledWith(35, expect.anything());
  });

  it('does not use text-model offsets from span segments for create insertion', () => {
    const candidates = [
      { nodeId: 'p1', pos: 100, nodeSize: 50 },
      { nodeId: 'p2', pos: 150, nodeSize: 40 },
    ];
    const { editor, tr } = makeSpanCreateEditor(candidates);

    const step = {
      id: 'span-no-offset',
      op: 'create.heading',
      args: { position: 'after', level: 2, text: 'Title' },
    } as any;
    // Segments have non-zero from/to — these must be ignored for create ops
    const target = makeSpanTarget([
      { blockId: 'p1', from: 5, to: 20 },
      { blockId: 'p2', from: 3, to: 15 },
    ]);
    const mapping = { map: (pos: number) => pos } as any;

    executeCreateStep(editor, tr as any, step, [target], mapping);

    // Should use p2's block boundary (150 + 40 = 190), NOT p2's from/to offsets
    expect(tr.insert).toHaveBeenCalledWith(190, expect.anything());
  });
});

describe('span target contiguity checks', () => {
  it('throws SPAN_FRAGMENTED when mapping changes the gap between segments', () => {
    const tr = {
      delete: vi.fn(),
    };

    const target = {
      kind: 'span',
      stepId: 'step-span-delete',
      op: 'text.delete',
      matchId: 'm:0',
      segments: [
        { blockId: 'p1', from: 0, to: 3, absFrom: 1, absTo: 4 },
        { blockId: 'p2', from: 0, to: 3, absFrom: 6, absTo: 9 },
      ],
      text: 'abcdef',
      marks: [],
    } as any;

    const step = { id: 'step-span-delete', op: 'text.delete', args: {} } as any;
    const mapping = {
      map: (pos: number) => {
        if (pos === 1) return 1;
        if (pos === 4) return 4;
        if (pos === 6) return 9;
        if (pos === 9) return 12;
        return pos;
      },
    };

    try {
      executeSpanTextDelete({} as Editor, tr, target, step, mapping);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('SPAN_FRAGMENTED');
      expect(tr.delete).not.toHaveBeenCalled();
      return;
    }

    throw new Error('expected executeSpanTextDelete to throw SPAN_FRAGMENTED');
  });

  it('accepts span execution when mapping preserves inter-segment gaps', () => {
    const tr = {
      delete: vi.fn(),
    };

    const target = {
      kind: 'span',
      stepId: 'step-span-delete-ok',
      op: 'text.delete',
      matchId: 'm:1',
      segments: [
        { blockId: 'p1', from: 0, to: 3, absFrom: 1, absTo: 4 },
        { blockId: 'p2', from: 0, to: 3, absFrom: 6, absTo: 9 },
      ],
      text: 'abcdef',
      marks: [],
    } as any;

    const step = { id: 'step-span-delete-ok', op: 'text.delete', args: {} } as any;
    const mapping = {
      map: (pos: number) => pos + 5,
    };

    const outcome = executeSpanTextDelete({} as Editor, tr, target, step, mapping);

    expect(outcome.changed).toBe(true);
    expect(tr.delete).toHaveBeenCalledWith(6, 14);
  });

  it('inherits paragraph-level attrs for multi-block span rewrites without copying ids', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          group: 'block',
          content: 'text*',
          attrs: {
            paragraphProperties: { default: null },
            listRendering: { default: null },
            paraId: { default: null },
            sdBlockId: { default: null },
          },
        },
        text: { group: 'inline' },
      },
    });

    const sourceP1 = schema.nodes.paragraph.create({
      paragraphProperties: { styleId: 'Heading2' },
      paraId: 'p1',
      sdBlockId: 'sd-p1',
    });
    const sourceP2 = schema.nodes.paragraph.create({
      paragraphProperties: { styleId: 'Normal' },
      listRendering: { markerText: '1.' },
      paraId: 'p2',
      sdBlockId: 'sd-p2',
    });

    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [
        { nodeId: 'p1', node: sourceP1, pos: 0, end: 12 },
        { nodeId: 'p2', node: sourceP2, pos: 20, end: 32 },
      ],
    });

    const tr = {
      replace: vi.fn(),
      replaceWith: vi.fn(),
    };

    const target = {
      kind: 'span',
      stepId: 'step-span-rewrite',
      op: 'text.rewrite',
      matchId: 'm:2',
      segments: [
        { blockId: 'p1', from: 0, to: 3, absFrom: 1, absTo: 4 },
        { blockId: 'p2', from: 0, to: 3, absFrom: 6, absTo: 9 },
      ],
      text: 'abcdef',
      marks: [],
      capturedStyleBySegment: [],
    } as any;

    const step: TextRewriteStep = {
      id: 'step-span-rewrite',
      op: 'text.rewrite',
      where: {
        by: 'select',
        select: { type: 'text', pattern: 'unused' },
        require: 'exactlyOne',
      },
      args: {
        replacement: {
          blocks: [{ text: 'alpha' }, { text: 'beta' }],
        },
        style: {
          inline: { mode: 'clear' },
          paragraph: { mode: 'preserve' },
        },
      },
    };

    const mapping = { map: (pos: number) => pos };
    executeSpanTextRewrite({ state: { schema } } as unknown as Editor, tr, target, step, mapping);

    expect(tr.replace).toHaveBeenCalledTimes(1);
    const slice = tr.replace.mock.calls[0][2];
    const first = slice.content.child(0);
    const second = slice.content.child(1);

    expect(first.attrs.paragraphProperties).toEqual({ styleId: 'Heading2' });
    expect(first.attrs.paraId).toBeNull();
    expect(first.attrs.sdBlockId).toBeNull();

    expect(second.attrs.paragraphProperties).toEqual({ styleId: 'Normal' });
    expect(second.attrs.listRendering).toEqual({ markerText: '1.' });
    expect(second.attrs.paraId).toBeNull();
    expect(second.attrs.sdBlockId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T3: Atomic rollback tests (multi-step failure — §13.13)
// ---------------------------------------------------------------------------

describe('executeCompiledPlan: atomic rollback on failure', () => {
  it('does not dispatch when an assert step fails (PRECONDITION_FAILED)', () => {
    const { editor, dispatch } = makeEditor();
    setupBlockIndex([{ nodeId: 'p1', pos: 0, node: {} }]);
    setupResolveTextRange(1, 6);
    mockedDeps.resolveInlineStyle.mockReturnValue([]);
    mockedDeps.getRevision.mockReturnValue('0');

    // Patch tr.doc with descendants so buildAssertIndex can run
    const tr = editor.state.tr as any;
    tr.doc.descendants = vi.fn();
    tr.doc.textBetween = vi.fn(() => '');

    const mutationStep: TextRewriteStep = {
      id: 'step-1',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'Hi' } },
    };

    // Assert expects 5 matches of "NonExistent" — will find 0 → PRECONDITION_FAILED
    const assertStep: AssertStep = {
      id: 'assert-bad',
      op: 'assert',
      where: { by: 'select', select: { type: 'text', pattern: 'NonExistent' }, require: 'exactlyOne' },
      args: { expectCount: 5 },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [{ step: mutationStep, targets: [makeTarget()] }],
      assertSteps: [assertStep],
      compiledRevision: '0',
    };

    try {
      executeCompiledPlan(editor, compiled);
      throw new Error('expected PRECONDITION_FAILED');
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('PRECONDITION_FAILED');
    }

    // dispatch should not have been called — transaction rolled back
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch when the executor throws for unsupported op', () => {
    const { editor, dispatch } = makeEditor();
    mockedDeps.getRevision.mockReturnValue('0');

    const badStep = {
      id: 'step-bad-op',
      op: 'totally.unknown',
      where: { by: 'select', select: { type: 'text', pattern: 'x' }, require: 'exactlyOne' },
      args: {},
    } as any;

    const compiled: CompiledPlan = {
      mutationSteps: [{ step: badStep, targets: [makeTarget()] }],
      assertSteps: [],
      compiledRevision: '0',
    };

    expect(() => executeCompiledPlan(editor, compiled)).toThrow();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch when revision drift is detected (REVISION_CHANGED_SINCE_COMPILE)', () => {
    const { editor, dispatch } = makeEditor();
    mockedDeps.getRevision.mockReturnValue('3');

    const step: TextRewriteStep = {
      id: 'step-drift-rollback',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'Changed' } },
    };

    const compiled: CompiledPlan = {
      mutationSteps: [{ step, targets: [makeTarget()] }],
      assertSteps: [],
      compiledRevision: '0',
    };

    expect(() => executeCompiledPlan(editor, compiled)).toThrow(PlanError);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch when a single step target is not found', () => {
    const { editor, dispatch } = makeEditor();
    mockedDeps.getRevision.mockReturnValue('0');

    // Set up an empty block index so TARGET_NOT_FOUND will be thrown during create
    mockedDeps.getBlockIndex.mockReturnValue({ candidates: [] });

    const step = {
      id: 'step-missing-target',
      op: 'create.paragraph',
      args: { position: 'after', text: 'New' },
    } as any;

    const compiled: CompiledPlan = {
      mutationSteps: [{ step, targets: [makeTarget({ blockId: 'nonexistent', kind: 'range' })] }],
      assertSteps: [],
      compiledRevision: '0',
    };

    expect(() => executeCompiledPlan(editor, compiled)).toThrow();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
