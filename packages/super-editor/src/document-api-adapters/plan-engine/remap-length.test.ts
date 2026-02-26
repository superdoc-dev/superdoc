/**
 * T4: Remap correctness tests for rewrite→format length deltas (§13.14)
 *
 * Verifies that each range executor correctly applies mapping.map()
 * to its compiled absolute positions, so position shifts from prior
 * steps are propagated.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { TextRewriteStep, TextDeleteStep, StyleApplyStep, TextInsertStep } from '@superdoc/document-api';
import type { CompiledRangeTarget, CompiledSpanTarget } from './executor-registry.types.js';
import {
  executeTextRewrite,
  executeTextDelete,
  executeStyleApply,
  executeTextInsert,
  executeSpanTextRewrite,
} from './executor.js';
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

beforeEach(() => {
  vi.clearAllMocks();
  mockedDeps.getRevision.mockReturnValue('0');
  mockedDeps.mapBlockNodeType.mockReturnValue(undefined);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEditor(): Editor {
  const boldMark = { type: { name: 'bold' }, attrs: {}, eq: (o: any) => o.type.name === 'bold' };
  return {
    state: {
      doc: {
        textContent: 'Hello',
        textBetween: vi.fn(() => 'Hello'),
        nodesBetween: vi.fn(),
      },
      schema: {
        marks: {
          bold: { create: vi.fn(() => boldMark) },
          italic: { create: vi.fn(() => ({ type: { name: 'italic' }, attrs: {} })) },
          underline: { create: vi.fn() },
          strike: { create: vi.fn() },
        },
        text: vi.fn((t: string, m?: unknown[]) => ({
          type: { name: 'text' },
          text: t,
          marks: m ?? [],
        })),
      },
    },
  } as unknown as Editor;
}

function makeTr() {
  const tr = {
    replaceWith: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
    addMark: vi.fn(),
    removeMark: vi.fn(),
    setMeta: vi.fn(),
    mapping: { map: vi.fn((pos: number) => pos) },
    docChanged: true,
    doc: {
      resolve: () => ({ marks: () => [] }),
    },
  };
  tr.replaceWith.mockReturnValue(tr);
  tr.delete.mockReturnValue(tr);
  tr.insert.mockReturnValue(tr);
  tr.addMark.mockReturnValue(tr);
  tr.removeMark.mockReturnValue(tr);
  tr.setMeta.mockReturnValue(tr);
  return tr;
}

function makeRangeTarget(overrides: Partial<CompiledRangeTarget> = {}): CompiledRangeTarget {
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
    // Provide capturedStyle to avoid fallback to getBlockIndex in resolveMarksForRange
    capturedStyle: { runs: [], isUniform: true },
    ...overrides,
  } as CompiledRangeTarget;
}

// ---------------------------------------------------------------------------
// T4.1 — shorter replacement: mapping.map receives original compiled positions
// ---------------------------------------------------------------------------

describe('remap correctness: mapping.map called with compiled positions', () => {
  it('shorter replacement: maps absFrom and absTo through mapping', () => {
    const editor = makeEditor();
    const tr = makeTr();
    mockedDeps.resolveInlineStyle.mockReturnValue([]);

    const target = makeRangeTarget({ absFrom: 10, absTo: 20 });
    const step: TextRewriteStep = {
      id: 'remap-short',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'Hi' } },
    };

    // Simulate a prior step shifted positions by -3
    tr.mapping.map.mockImplementation((pos: number) => pos - 3);

    executeTextRewrite(editor, tr as any, target, step, tr.mapping as any);

    expect(tr.mapping.map).toHaveBeenCalledWith(10);
    expect(tr.mapping.map).toHaveBeenCalledWith(20);
    // replaceWith should use remapped positions (10-3=7, 20-3=17)
    expect(tr.replaceWith).toHaveBeenCalledWith(7, 17, expect.anything());
  });

  it('longer replacement: maps absFrom and absTo through mapping', () => {
    const editor = makeEditor();
    const tr = makeTr();
    mockedDeps.resolveInlineStyle.mockReturnValue([]);

    const target = makeRangeTarget({ absFrom: 5, absTo: 8 });
    const step: TextRewriteStep = {
      id: 'remap-long',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'foo' }, require: 'exactlyOne' },
      args: { replacement: { text: 'foobar' } },
    };

    // Simulate a prior step that expanded content by +4
    tr.mapping.map.mockImplementation((pos: number) => pos + 4);

    executeTextRewrite(editor, tr as any, target, step, tr.mapping as any);

    expect(tr.mapping.map).toHaveBeenCalledWith(5);
    expect(tr.mapping.map).toHaveBeenCalledWith(8);
    expect(tr.replaceWith).toHaveBeenCalledWith(9, 12, expect.anything());
  });

  it('empty replacement (delete via rewrite): maps positions through mapping', () => {
    const editor = makeEditor();
    const tr = makeTr();
    mockedDeps.resolveInlineStyle.mockReturnValue([]);

    const target = makeRangeTarget({ absFrom: 3, absTo: 10, text: 'content' });
    const step: TextRewriteStep = {
      id: 'remap-empty',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'content' }, require: 'exactlyOne' },
      args: { replacement: { text: '' } },
    };

    tr.mapping.map.mockImplementation((pos: number) => pos + 2);

    executeTextRewrite(editor, tr as any, target, step, tr.mapping as any);

    expect(tr.mapping.map).toHaveBeenCalledWith(3);
    expect(tr.mapping.map).toHaveBeenCalledWith(10);
    expect(tr.replaceWith).toHaveBeenCalledWith(5, 12, expect.anything());
  });

  it('equal length replacement: maps positions through mapping', () => {
    const editor = makeEditor();
    const tr = makeTr();
    mockedDeps.resolveInlineStyle.mockReturnValue([]);

    const target = makeRangeTarget({ absFrom: 1, absTo: 6, text: 'Hello' });
    const step: TextRewriteStep = {
      id: 'remap-equal',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { replacement: { text: 'World' } },
    };

    // Identity mapping — no prior shift
    tr.mapping.map.mockImplementation((pos: number) => pos);

    executeTextRewrite(editor, tr as any, target, step, tr.mapping as any);

    expect(tr.mapping.map).toHaveBeenCalledWith(1);
    expect(tr.mapping.map).toHaveBeenCalledWith(6);
    expect(tr.replaceWith).toHaveBeenCalledWith(1, 6, expect.anything());
  });
});

// ---------------------------------------------------------------------------
// T4.2 — format.apply also uses mapping for its positions
// ---------------------------------------------------------------------------

describe('remap correctness: format.apply uses mapping', () => {
  it('addMark uses remapped positions', () => {
    const editor = makeEditor();
    const tr = makeTr();

    const target = makeRangeTarget({ absFrom: 5, absTo: 15 });
    const step: StyleApplyStep = {
      id: 'remap-format',
      op: 'format.apply',
      where: { by: 'select', select: { type: 'text', pattern: 'some text' }, require: 'exactlyOne' },
      args: { inline: { bold: true } },
    };

    // Simulate +10 offset from prior steps
    tr.mapping.map.mockImplementation((pos: number) => pos + 10);

    executeStyleApply(editor, tr as any, target, step, tr.mapping as any);

    expect(tr.mapping.map).toHaveBeenCalledWith(5);
    expect(tr.mapping.map).toHaveBeenCalledWith(15);
    expect(tr.addMark).toHaveBeenCalledWith(15, 25, expect.anything());
  });
});

// ---------------------------------------------------------------------------
// T4.3 — text.delete uses mapping
// ---------------------------------------------------------------------------

describe('remap correctness: text.delete uses mapping', () => {
  it('delete uses remapped positions', () => {
    const editor = makeEditor();
    const tr = makeTr();

    const target = makeRangeTarget({ absFrom: 2, absTo: 7, text: 'Hello' });
    const step = {
      id: 'remap-delete',
      op: 'text.delete',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: {},
    } as unknown as TextDeleteStep;

    // Simulate -1 offset
    tr.mapping.map.mockImplementation((pos: number) => pos - 1);

    executeTextDelete(editor, tr as any, target, step, tr.mapping as any);

    expect(tr.mapping.map).toHaveBeenCalledWith(2);
    expect(tr.mapping.map).toHaveBeenCalledWith(7);
    expect(tr.delete).toHaveBeenCalledWith(1, 6);
  });
});

// ---------------------------------------------------------------------------
// T4.4 — text.insert uses mapping for position
// ---------------------------------------------------------------------------

describe('remap correctness: text.insert uses mapping', () => {
  it('insert-before uses remapped absFrom', () => {
    const editor = makeEditor();
    const tr = makeTr();

    const target = makeRangeTarget({ absFrom: 4, absTo: 9 });
    const step: TextInsertStep = {
      id: 'remap-insert',
      op: 'text.insert',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { position: 'before', content: { text: 'prefix' } },
    };

    tr.mapping.map.mockImplementation((pos: number) => pos + 5);

    executeTextInsert(editor, tr as any, target, step, tr.mapping as any);

    // position=before → maps absFrom (4 → 9)
    expect(tr.mapping.map).toHaveBeenCalledWith(4);
    expect(tr.insert).toHaveBeenCalledWith(9, expect.anything());
  });

  it('insert-after uses remapped absTo', () => {
    const editor = makeEditor();
    const tr = makeTr();

    const target = makeRangeTarget({ absFrom: 4, absTo: 9 });
    const step: TextInsertStep = {
      id: 'remap-insert-after',
      op: 'text.insert',
      where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'exactlyOne' },
      args: { position: 'after', content: { text: 'suffix' } },
    };

    tr.mapping.map.mockImplementation((pos: number) => pos + 3);

    executeTextInsert(editor, tr as any, target, step, tr.mapping as any);

    // position=after → maps absTo (9 → 12)
    expect(tr.mapping.map).toHaveBeenCalledWith(9);
    expect(tr.insert).toHaveBeenCalledWith(12, expect.anything());
  });
});
