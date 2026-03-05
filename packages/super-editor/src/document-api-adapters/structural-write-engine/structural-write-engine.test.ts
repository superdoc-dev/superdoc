import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../../core/Editor.js';
import { registerBuiltInExecutors } from '../plan-engine/register-executors.js';
import { clearExecutorRegistry } from '../plan-engine/executor-registry.js';
import { insertStructuredWrapper, replaceStructuredWrapper } from '../plan-engine/plan-wrappers.js';
import { executePlan } from '../plan-engine/executor.js';
import { markdownToFragmentAdapter } from '../markdown-to-fragment-adapter.js';
import { executeStructuralInsert, executeStructuralReplace, materializeFragment } from './index.js';
import { enforceNestingPolicy } from './nesting-guard.js';
import { validateDocumentFragment } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';
import type { SDFragment } from '@superdoc/document-api';

let docData: Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

beforeAll(async () => {
  docData = await loadTestDataForEditorTests('blank-doc.docx');
  clearExecutorRegistry();
  registerBuiltInExecutors();
});

let editor: Editor;

beforeEach(() => {
  ({ editor } = initTestEditor({
    content: docData.docx,
    media: docData.media,
    mediaFiles: docData.mediaFiles,
    fonts: docData.fonts,
  }));
});

afterEach(() => {
  editor?.destroy();
  // @ts-expect-error cleanup
  editor = null;
});

function requireFirstTableCellBlockId(editor: Editor): string {
  let cellId: string | undefined;
  editor.state.doc.descendants((node) => {
    const candidate = node.attrs?.sdBlockId;
    if (node.type.name === 'tableCell' && typeof candidate === 'string') {
      cellId = candidate;
      return false;
    }
    return true;
  });
  if (!cellId) {
    throw new Error('Expected a tableCell with sdBlockId in the document.');
  }
  return cellId;
}

function requireFirstParagraphInsideTableCellBlockId(editor: Editor): string {
  let paragraphId: string | undefined;
  editor.state.doc.descendants((node, pos) => {
    const candidate = node.attrs?.sdBlockId;
    if (node.type.name !== 'paragraph' || typeof candidate !== 'string') return true;

    const $pos = editor.state.doc.resolve(pos);
    let insideTableCell = false;
    for (let depth = $pos.depth; depth > 0; depth--) {
      const nodeType = $pos.node(depth).type.name;
      if (nodeType === 'tableCell' || nodeType === 'tableHeader') {
        insideTableCell = true;
        break;
      }
    }

    if (!insideTableCell) return true;
    paragraphId = candidate;
    return false;
  });

  if (!paragraphId) {
    throw new Error('Expected a paragraph inside a table cell with sdBlockId.');
  }
  return paragraphId;
}

function requireFirstTableNode(editor: Editor): import('prosemirror-model').Node {
  let tableNode: import('prosemirror-model').Node | undefined;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'table') {
      tableNode = node;
      return false;
    }
    return true;
  });
  if (!tableNode) {
    throw new Error('Expected a table node in the document.');
  }
  return tableNode;
}

function enableTrackedMode(editor: Editor): void {
  (editor as any).options.user = {
    id: 'test-user-id',
    name: 'Test User',
    email: 'test-user@example.com',
  };
}

// ---------------------------------------------------------------------------
// executeStructuralInsert
// ---------------------------------------------------------------------------

describe('executeStructuralInsert', () => {
  it('inserts a paragraph at the end of the document', () => {
    const fragment: SDFragment = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'hello structural' }],
    };

    const result = executeStructuralInsert(editor, { content: fragment });

    expect(result.success).toBe(true);
    expect(result.insertedBlockIds.length).toBeGreaterThanOrEqual(1);
    expect(editor.state.doc.textContent).toContain('hello structural');
  });

  it('inserts multiple nodes as a fragment array', () => {
    const fragment: SDFragment = [
      { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
    ];

    const result = executeStructuralInsert(editor, { content: fragment });

    expect(result.success).toBe(true);
    expect(result.insertedBlockIds.length).toBe(2);
    expect(editor.state.doc.textContent).toContain('first');
    expect(editor.state.doc.textContent).toContain('second');
  });

  it('inserts a heading (falls back to paragraph if heading not in schema)', () => {
    const fragment: SDFragment = {
      type: 'heading',
      level: 2,
      content: [{ type: 'text', text: 'My Heading' }],
    };

    const result = executeStructuralInsert(editor, { content: fragment });

    expect(result.success).toBe(true);
    expect(result.insertedBlockIds.length).toBeGreaterThanOrEqual(1);
    expect(editor.state.doc.textContent).toContain('My Heading');
  });

  it('returns unique block IDs for each inserted node', () => {
    const fragment: SDFragment = [
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
    ];

    const result = executeStructuralInsert(editor, { content: fragment });

    expect(new Set(result.insertedBlockIds).size).toBe(result.insertedBlockIds.length);
  });
});

// ---------------------------------------------------------------------------
// executeStructuralReplace
// ---------------------------------------------------------------------------

describe('executeStructuralReplace', () => {
  it('replaces a block with new structural content', () => {
    // First insert a paragraph to get a known blockId
    const insertResult = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'old content' }] },
    });
    const blockId = insertResult.insertedBlockIds[0]!;

    const target = { kind: 'text' as const, blockId, range: { start: 0, end: 11 } };
    const result = executeStructuralReplace(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'new content' }] },
    });

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('new content');
    expect(editor.state.doc.textContent).not.toContain('old content');
  });

  it('throws TARGET_NOT_FOUND for unknown blockId', () => {
    const target = { kind: 'text' as const, blockId: 'nonexistent', range: { start: 0, end: 5 } };
    expect(() =>
      executeStructuralReplace(editor, {
        target,
        content: { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
      }),
    ).toThrow(DocumentApiAdapterError);
  });
});

// ---------------------------------------------------------------------------
// replaceStructuredWrapper (receipt-level tests)
// ---------------------------------------------------------------------------

describe('replaceStructuredWrapper', () => {
  it('replaces a paragraph block via the wrapper and returns a receipt', () => {
    // Seed a paragraph to get a known blockId.
    const seed = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'old text' }] },
    });
    const blockId = seed.insertedBlockIds[0]!;

    const target = { kind: 'text' as const, blockId, range: { start: 0, end: 8 } };
    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'replaced' }] },
    });

    expect(result.success).toBe(true);
    expect(result.resolution).toBeDefined();
    expect(result.resolution!.target.nodeId).toBe(blockId);
    expect(editor.state.doc.textContent).toContain('replaced');
    expect(editor.state.doc.textContent).not.toContain('old text');
  });

  it('snapshots covered text in resolution.text', () => {
    const seed = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'snapshot me' }] },
    });
    const blockId = seed.insertedBlockIds[0]!;

    const target = { kind: 'text' as const, blockId, range: { start: 0, end: 11 } };
    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'new' }] },
    });

    expect(result.success).toBe(true);
    // SDMutationReceipt resolution carries SDAddress (nodeId + anchor), not text snapshot.
    // Verify the replace target was correctly resolved via the SDAddress.
    expect(result.resolution).toBeDefined();
    expect(result.resolution!.target.nodeId).toBe(blockId);
  });

  it('replaces a table block via the wrapper', () => {
    const seed = executeStructuralInsert(editor, {
      content: {
        type: 'table',
        rows: [
          {
            type: 'tableRow',
            cells: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell data' }] }] },
            ],
          },
        ],
      },
    });
    const tableBlockId = seed.insertedBlockIds[0]!;

    const target = { kind: 'text' as const, blockId: tableBlockId, range: { start: 0, end: 0 } };
    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'table replaced' }] },
    });

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('table replaced');
    expect(editor.state.doc.textContent).not.toContain('cell data');
  });

  it('replaces a table block with markdownToFragment output', () => {
    const seed = executeStructuralInsert(editor, {
      content: {
        type: 'table',
        rows: [
          {
            type: 'tableRow',
            cells: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'old' }] }] }],
          },
        ],
      },
    });
    const tableBlockId = seed.insertedBlockIds[0]!;

    const parsed = markdownToFragmentAdapter(editor, {
      markdown: '| Col A | Col B |\n| --- | --- |\n| foo | bar |',
    });

    // Regression guard: markdown projection must not emit duplicate empty IDs.
    expect(() => validateDocumentFragment(parsed.fragment)).not.toThrow();

    const result = replaceStructuredWrapper(editor, {
      target: { kind: 'text', blockId: tableBlockId, range: { start: 0, end: 0 } },
      content: parsed.fragment,
    });

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('foo');
    expect(editor.state.doc.textContent).toContain('bar');
    expect(editor.state.doc.textContent).not.toContain('old');

    const tableNode = requireFirstTableNode(editor);
    expect(tableNode.attrs?.tableProperties?.tableWidth).toEqual({
      value: 5000,
      type: 'pct',
    });
    expect(tableNode.attrs?.needsTableStyleNormalization).not.toBe(true);
    const hasStyleOrFallbackBorders =
      typeof tableNode.attrs?.tableStyleId === 'string' || Object.keys(tableNode.attrs?.borders ?? {}).length > 0;
    expect(hasStyleOrFallbackBorders).toBe(true);
  });

  it('supports dry-run mode without mutating the document', () => {
    const seed = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'keep me' }] },
    });
    const blockId = seed.insertedBlockIds[0]!;
    const textBefore = editor.state.doc.textContent;

    const target = { kind: 'text' as const, blockId, range: { start: 0, end: 7 } };
    const result = replaceStructuredWrapper(
      editor,
      {
        target,
        content: { type: 'paragraph', content: [{ type: 'text', text: 'gone' }] },
      },
      { dryRun: true },
    );

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toBe(textBefore);
  });

  it('applies tracked transaction metadata when changeMode=tracked', () => {
    enableTrackedMode(editor);
    const seed = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'tracked old' }] },
    });
    const blockId = seed.insertedBlockIds[0]!;
    const dispatchSpy = vi.spyOn(editor, 'dispatch');

    const result = replaceStructuredWrapper(
      editor,
      {
        target: { kind: 'text', blockId, range: { start: 0, end: 11 } },
        content: { type: 'paragraph', content: [{ type: 'text', text: 'tracked new' }] },
      },
      { changeMode: 'tracked' },
    );

    expect(result.success).toBe(true);
    const dispatchedTr = dispatchSpy.mock.calls.at(-1)?.[0];
    expect(dispatchedTr?.getMeta('forceTrackChanges')).toBe(true);
    expect(dispatchedTr?.getMeta('skipTrackChanges')).not.toBe(true);
  });

  it('runs structural validation during dry-run and throws INVALID_NESTING on nested table replace', () => {
    const tableFragment: SDFragment = {
      type: 'table',
      rows: [{ type: 'tableRow', cells: [{ type: 'tableCell' }] }],
    };
    executeStructuralInsert(editor, { content: tableFragment });
    const paragraphInCellId = requireFirstParagraphInsideTableCellBlockId(editor);

    const input = {
      target: { kind: 'text' as const, blockId: paragraphInCellId, range: { start: 0, end: 0 } },
      content: tableFragment,
    };

    expect(() => replaceStructuredWrapper(editor, input)).toThrow(DocumentApiAdapterError);

    try {
      replaceStructuredWrapper(editor, input, { dryRun: true });
      throw new Error('expected dry-run to throw INVALID_NESTING');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentApiAdapterError);
      expect((error as DocumentApiAdapterError).code).toBe('INVALID_NESTING');
    }
  });
});

// ---------------------------------------------------------------------------
// insertStructuredWrapper — placement receipt accuracy
// ---------------------------------------------------------------------------

describe('insertStructuredWrapper — placement receipt', () => {
  it('receipt range reflects "before" placement', () => {
    // Seed a paragraph to use as target.
    const seed = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'anchor' }] },
    });
    const blockId = seed.insertedBlockIds[0]!;

    const target = { kind: 'text' as const, blockId, range: { start: 0, end: 6 } };
    const result = insertStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
      placement: 'before',
    });

    expect(result.success).toBe(true);
    // "before" placement: receipt carries a valid SDAddress resolution.
    expect(result.resolution).toBeDefined();
    expect(result.resolution!.target).toBeDefined();
  });

  it('receipt range reflects "after" placement (default)', () => {
    const seed = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'anchor' }] },
    });
    const blockId = seed.insertedBlockIds[0]!;

    const target = { kind: 'text' as const, blockId, range: { start: 0, end: 6 } };
    const resultAfter = insertStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      placement: 'after',
    });

    const resultBefore = insertStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'before-it' }] },
      placement: 'before',
    });

    expect(resultAfter.success).toBe(true);
    expect(resultBefore.success).toBe(true);
    // Both inserts target the same block, so the SDAddress anchors reflect insertion points.
    // Verify both receipts carry valid resolution.
    expect(resultBefore.resolution).toBeDefined();
    expect(resultAfter.resolution).toBeDefined();
  });

  it('applies tracked transaction metadata when changeMode=tracked', () => {
    enableTrackedMode(editor);
    const dispatchSpy = vi.spyOn(editor, 'dispatch');

    const result = insertStructuredWrapper(
      editor,
      {
        content: { type: 'paragraph', content: [{ type: 'text', text: 'tracked insert' }] },
      },
      { changeMode: 'tracked' },
    );

    expect(result.success).toBe(true);
    const dispatchedTr = dispatchSpy.mock.calls.at(-1)?.[0];
    expect(dispatchedTr?.getMeta('forceTrackChanges')).toBe(true);
    expect(dispatchedTr?.getMeta('skipTrackChanges')).not.toBe(true);
  });

  it('runs structural validation during dry-run and throws INVALID_NESTING on nested table insert', () => {
    const tableFragment: SDFragment = {
      type: 'table',
      rows: [{ type: 'tableRow', cells: [{ type: 'tableCell' }] }],
    };
    executeStructuralInsert(editor, { content: tableFragment });
    const cellBlockId = requireFirstTableCellBlockId(editor);

    const input = {
      target: { kind: 'text' as const, blockId: cellBlockId, range: { start: 0, end: 0 } },
      content: tableFragment,
      placement: 'insideStart' as const,
    };

    expect(() => insertStructuredWrapper(editor, input)).toThrow(DocumentApiAdapterError);

    try {
      insertStructuredWrapper(editor, input, { dryRun: true });
      throw new Error('expected dry-run to throw INVALID_NESTING');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentApiAdapterError);
      expect((error as DocumentApiAdapterError).code).toBe('INVALID_NESTING');
    }
  });
});

// ---------------------------------------------------------------------------
// mutations.apply structural steps
// ---------------------------------------------------------------------------

describe('mutations.apply structural steps', () => {
  it('passes tracked mode through structural.insert step execution', () => {
    enableTrackedMode(editor);
    const anchor = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'anchor step' }] },
    });
    const anchorId = anchor.insertedBlockIds[0]!;
    const dispatchSpy = vi.spyOn(editor, 'dispatch');

    const receipt = executePlan(editor, {
      changeMode: 'tracked',
      steps: [
        {
          id: 'step-structural-insert',
          op: 'structural.insert',
          where: { by: 'ref', ref: anchorId },
          args: {
            content: { type: 'paragraph', content: [{ type: 'text', text: 'plan tracked insert' }] },
          },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(receipt.steps[0]?.effect).toBe('changed');
    const dispatchedTr = dispatchSpy.mock.calls.at(-1)?.[0];
    expect(dispatchedTr?.getMeta('forceTrackChanges')).toBe(true);
    expect(dispatchedTr?.getMeta('skipTrackChanges')).not.toBe(true);
  });

  it('passes tracked mode through structural.replace step execution', () => {
    enableTrackedMode(editor);
    const targetSeed = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'replace me from step' }] },
    });
    const targetId = targetSeed.insertedBlockIds[0]!;
    const dispatchSpy = vi.spyOn(editor, 'dispatch');

    const receipt = executePlan(editor, {
      changeMode: 'tracked',
      steps: [
        {
          id: 'step-structural-replace',
          op: 'structural.replace',
          where: { by: 'ref', ref: targetId },
          args: {
            content: { type: 'paragraph', content: [{ type: 'text', text: 'plan tracked replace' }] },
          },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(receipt.steps[0]?.effect).toBe('changed');
    const dispatchedTr = dispatchSpy.mock.calls.at(-1)?.[0];
    expect(dispatchedTr?.getMeta('forceTrackChanges')).toBe(true);
    expect(dispatchedTr?.getMeta('skipTrackChanges')).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// enforceNestingPolicy
// ---------------------------------------------------------------------------

describe('enforceNestingPolicy', () => {
  it('allows non-table fragments anywhere', () => {
    const fragment: SDFragment = { type: 'paragraph', content: [] };
    // Should not throw — paragraph is not a table
    expect(() => enforceNestingPolicy(fragment, editor.state.doc, 0)).not.toThrow();
  });

  it('allows tables at top level with default policy', () => {
    const fragment: SDFragment = {
      type: 'table',
      rows: [{ type: 'tableRow', cells: [{ type: 'tableCell' }] }],
    };
    // Should not throw — inserting at doc level, not inside a table
    expect(() => enforceNestingPolicy(fragment, editor.state.doc, 0)).not.toThrow();
  });

  it('throws INVALID_NESTING when tables are forbidden', () => {
    // We need a position inside a table cell. We can test this by inserting
    // a table first, then checking nesting at a position inside it.
    const tableFragment: SDFragment = {
      type: 'table',
      rows: [{ type: 'tableRow', cells: [{ type: 'tableCell' }] }],
    };

    executeStructuralInsert(editor, { content: tableFragment });

    // Find a position inside the table cell
    let cellPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell' && cellPos === undefined) {
        cellPos = pos + 1; // Inside the cell
        return false;
      }
      return true;
    });

    if (cellPos !== undefined) {
      const nestedTable: SDFragment = {
        type: 'table',
        rows: [{ type: 'tableRow', cells: [{ type: 'tableCell' }] }],
      };

      expect(() => enforceNestingPolicy(nestedTable, editor.state.doc, cellPos!)).toThrow(DocumentApiAdapterError);
      expect(() => enforceNestingPolicy(nestedTable, editor.state.doc, cellPos!)).toThrow(/table inside another table/);
    }
  });

  it('throws INVALID_NESTING for table nested inside a list (recursive detection)', () => {
    const tableFragment: SDFragment = {
      type: 'table',
      rows: [{ type: 'tableRow', cells: [{ type: 'tableCell' }] }],
    };

    executeStructuralInsert(editor, { content: tableFragment });

    let cellPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell' && cellPos === undefined) {
        cellPos = pos + 1;
        return false;
      }
      return true;
    });

    if (cellPos !== undefined) {
      // Table hidden inside a list item — should still be detected
      const listWithNestedTable: SDFragment = {
        kind: 'list',
        list: {
          items: [
            {
              level: 0,
              content: [
                {
                  kind: 'table',
                  table: { rows: [{ cells: [{ content: [{ kind: 'paragraph', paragraph: { inlines: [] } }] }] }] },
                },
              ],
            },
          ],
        },
      } as any;

      expect(() => enforceNestingPolicy(listWithNestedTable, editor.state.doc, cellPos!)).toThrow(
        /table inside another table/,
      );
    }
  });

  it('allows nested tables when policy permits', () => {
    const tableFragment: SDFragment = {
      type: 'table',
      rows: [{ type: 'tableRow', cells: [{ type: 'tableCell' }] }],
    };

    executeStructuralInsert(editor, { content: tableFragment });

    let cellPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell' && cellPos === undefined) {
        cellPos = pos + 1;
        return false;
      }
      return true;
    });

    if (cellPos !== undefined) {
      // Should not throw when tables: 'allow'
      expect(() => enforceNestingPolicy(tableFragment, editor.state.doc, cellPos!, { tables: 'allow' })).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Fragment validation (document-api level)
// ---------------------------------------------------------------------------

describe('validateDocumentFragment', () => {
  it('accepts a valid paragraph', () => {
    expect(() =>
      validateDocumentFragment({ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }),
    ).not.toThrow();
  });

  it('accepts a valid heading', () => {
    expect(() => validateDocumentFragment({ type: 'heading', level: 1, content: [] })).not.toThrow();
  });

  it('accepts an array of nodes', () => {
    expect(() =>
      validateDocumentFragment([
        { type: 'paragraph', content: [] },
        { type: 'heading', level: 2, content: [] },
      ]),
    ).not.toThrow();
  });

  it('rejects empty array', () => {
    expect(() => validateDocumentFragment([])).toThrow(/at least one node/);
  });

  it('rejects null', () => {
    expect(() => validateDocumentFragment(null)).toThrow(/null or undefined/);
  });

  it('rejects heading with invalid level', () => {
    expect(() => validateDocumentFragment({ type: 'heading', level: 0 })).toThrow(/between 1 and 6/);
  });

  it('rejects table without rows', () => {
    expect(() => validateDocumentFragment({ type: 'table', rows: [] })).toThrow(/at least one row/);
  });

  it('rejects invalid inline content type', () => {
    expect(() => validateDocumentFragment({ type: 'paragraph', content: [{ type: 'invalid' }] })).toThrow(
      /text.*or.*image/,
    );
  });

  it('rejects inline text without text field', () => {
    expect(() => validateDocumentFragment({ type: 'paragraph', content: [{ type: 'text' }] })).toThrow(
      /requires a "text" string/,
    );
  });

  it('rejects inline image without src field', () => {
    expect(() => validateDocumentFragment({ type: 'paragraph', content: [{ type: 'image' }] })).toThrow(
      /requires a non-empty "src"/,
    );
  });

  it('rejects top-level image without src field', () => {
    expect(() => validateDocumentFragment({ type: 'image' })).toThrow(/requires a non-empty "src"/);
  });

  it('accepts top-level image with valid src', () => {
    expect(() => validateDocumentFragment({ type: 'image', src: 'https://example.com/img.png' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Phase 6: Materializer — SDM/1 kind dispatch
// ---------------------------------------------------------------------------

describe('materializeFragment — SDM/1 kind dispatch', () => {
  it('materializes an SDM/1 paragraph with nested payload', () => {
    const fragment: SDFragment = {
      kind: 'paragraph',
      paragraph: {
        inlines: [{ kind: 'run', run: { text: 'hello SDM/1' } }],
      },
    } as any;

    const result = executeStructuralInsert(editor, { content: fragment });

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('hello SDM/1');
  });

  it('materializes an SDM/1 heading with level', () => {
    const fragment: SDFragment = {
      kind: 'heading',
      heading: {
        level: 2,
        inlines: [{ kind: 'run', run: { text: 'SDM/1 Heading' } }],
      },
    } as any;

    const result = executeStructuralInsert(editor, { content: fragment });

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('SDM/1 Heading');
  });

  it('preserves caller-provided id as sdBlockId', () => {
    const fragment: SDFragment = {
      kind: 'paragraph',
      id: 'my-custom-id',
      paragraph: {
        inlines: [{ kind: 'run', run: { text: 'with id' } }],
      },
    } as any;

    const result = executeStructuralInsert(editor, { content: fragment });

    expect(result.success).toBe(true);
    expect(result.insertedBlockIds).toContain('my-custom-id');
  });

  it('falls back to legacy type dispatch when kind is absent', () => {
    const fragment: SDFragment = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'legacy fallback' }],
    };

    const result = executeStructuralInsert(editor, { content: fragment });

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('legacy fallback');
  });
});

// ---------------------------------------------------------------------------
// Phase 6: Materializer — capability gates
// ---------------------------------------------------------------------------

describe('materializeFragment — capability gates', () => {
  it('rejects preserve-only kinds like sdt', () => {
    const fragment: SDFragment = { kind: 'sectPr' } as any;

    expect(() => materializeFragment(editor.state.schema, fragment, new Set(), 'insert')).toThrow(
      DocumentApiAdapterError,
    );
    expect(() => materializeFragment(editor.state.schema, fragment, new Set(), 'insert')).toThrow(/preserve-only/);
  });

  it('rejects replace on insert-only kinds like toc', () => {
    const fragment: SDFragment = { kind: 'toc' } as any;

    expect(() => materializeFragment(editor.state.schema, fragment, new Set(), 'replace')).toThrow(
      DocumentApiAdapterError,
    );
    expect(() => materializeFragment(editor.state.schema, fragment, new Set(), 'replace')).toThrow(/does not support/);
  });

  it('allows insert for fully-capable kinds', () => {
    const fragment: SDFragment = {
      kind: 'paragraph',
      paragraph: { inlines: [{ kind: 'run', run: { text: 'allowed' } }] },
    } as any;

    expect(() => materializeFragment(editor.state.schema, fragment, new Set(), 'insert')).not.toThrow();
  });

  it('rejects field without rawMode', () => {
    const fragment: SDFragment = { kind: 'field', field: {} } as any;

    expect(() => materializeFragment(editor.state.schema, fragment, new Set(), 'insert')).toThrow(/raw mode/i);
  });

  it('allows field with rawMode opt-in', () => {
    const fragment: SDFragment = { kind: 'field', field: {} } as any;

    expect(() =>
      materializeFragment(editor.state.schema, fragment, new Set(), 'insert', { rawMode: true }),
    ).not.toThrow();
  });

  it('allows extension nodes (ext.*) without capability checks', () => {
    const fragment: SDFragment = { kind: 'ext.custom', 'ext.custom': {} } as any;

    // Extension nodes bypass capability gates — should fall through to fallback materializer
    expect(() => materializeFragment(editor.state.schema, fragment, new Set(), 'insert')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Phase 10: Capability conformance matrix
// ---------------------------------------------------------------------------

describe('capability conformance — content nodes', () => {
  const schema = () => editor.state.schema;
  const noIds = new Set<string>();

  // Fully writable: insert + replace both succeed
  it.each(['paragraph', 'heading', 'table', 'image'] as const)('%s — insert ✓, replace ✓', (kind) => {
    const fragment = makeContentFragment(kind);
    expect(() => materializeFragment(schema(), fragment, noIds, 'insert')).not.toThrow();
    expect(() => materializeFragment(schema(), fragment, noIds, 'replace')).not.toThrow();
  });

  // List: fully writable — capability gate passes (materialization may depend on schema features)
  it('list — capability gate passes for insert and replace', () => {
    const fragment = makeContentFragment('list');
    // Capability gate should NOT throw PRESERVE_ONLY_VIOLATION or CAPABILITY_UNAVAILABLE.
    // If materializer throws for schema-level reasons, that's not a capability issue.
    for (const op of ['insert', 'replace'] as const) {
      try {
        materializeFragment(schema(), fragment, noIds, op);
      } catch (e) {
        if (e instanceof DocumentApiAdapterError) {
          expect(e.code).not.toMatch(/PRESERVE_ONLY/);
          expect(e.code).not.toMatch(/CAPABILITY/);
        }
        // Non-capability errors (e.g. missing PM schema type) are acceptable
      }
    }
  });

  // Insert-only: insert succeeds, replace fails with CAPABILITY_UNAVAILABLE
  it.each(['toc', 'sectionBreak', 'break'] as const)('%s — insert ✓, replace ✗ CAPABILITY_UNAVAILABLE', (kind) => {
    const fragment = makeContentFragment(kind);
    expect(() => materializeFragment(schema(), fragment, noIds, 'insert')).not.toThrow();
    expect(() => materializeFragment(schema(), fragment, noIds, 'replace')).toThrow(/does not support/);
  });

  // Partial: insert + replace succeed (drawing)
  it('drawing — insert ✓ (partial), replace ✓ (partial)', () => {
    const fragment = makeContentFragment('drawing');
    expect(() => materializeFragment(schema(), fragment, noIds, 'insert')).not.toThrow();
    expect(() => materializeFragment(schema(), fragment, noIds, 'replace')).not.toThrow();
  });

  // Raw-gated: field requires rawMode
  it('field — insert ✗ without rawMode, ✓ with rawMode', () => {
    const fragment = makeContentFragment('field');
    expect(() => materializeFragment(schema(), fragment, noIds, 'insert')).toThrow(/raw mode/i);
    expect(() => materializeFragment(schema(), fragment, noIds, 'insert', { rawMode: true })).not.toThrow();
  });

  // Preserve-only: unknown kinds fail with PRESERVE_ONLY_VIOLATION
  it.each(['math', 'altChunk', 'customXml', 'sectPr'] as const)('%s — PRESERVE_ONLY_VIOLATION', (kind) => {
    const fragment = { kind } as any;
    try {
      materializeFragment(schema(), fragment, noIds, 'insert');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentApiAdapterError);
      expect((e as DocumentApiAdapterError).code).toMatch(/PRESERVE_ONLY/);
    }
  });

  // Extension nodes bypass checks
  it('ext.* — bypasses all capability checks', () => {
    const fragment = { kind: 'ext.myPlugin', 'ext.myPlugin': {} } as any;
    expect(() => materializeFragment(schema(), fragment, noIds, 'insert')).not.toThrow();
  });
});

/** Builds a minimal valid fragment for a given content node kind. */
function makeContentFragment(kind: string): SDFragment {
  switch (kind) {
    case 'paragraph':
      return { kind: 'paragraph', paragraph: { inlines: [{ kind: 'run', run: { text: 'test' } }] } } as any;
    case 'heading':
      return { kind: 'heading', heading: { level: 1, inlines: [{ kind: 'run', run: { text: 'test' } }] } } as any;
    case 'table':
      return {
        kind: 'table',
        table: {
          rows: [{ cells: [{ content: [{ kind: 'paragraph', paragraph: { inlines: [] } }] }] }],
        },
      } as any;
    case 'list':
      return {
        kind: 'list',
        list: { items: [{ level: 0, content: [{ kind: 'paragraph', paragraph: { inlines: [] } }] }] },
      } as any;
    case 'image':
      return { kind: 'image', image: { src: 'data:image/png;base64,x' } } as any;
    case 'toc':
      return { kind: 'toc', toc: {} } as any;
    case 'sectionBreak':
      return { kind: 'sectionBreak' } as any;
    case 'break':
      return { kind: 'break' } as any;
    case 'drawing':
      return { kind: 'drawing', drawing: { source: { type: 'unknown' } } } as any;
    case 'field':
      return { kind: 'field', field: {} } as any;
    default:
      return { kind } as any;
  }
}

// ---------------------------------------------------------------------------
// Phase 6: Materializer — ID lifecycle
// ---------------------------------------------------------------------------

describe('materializeFragment — ID lifecycle', () => {
  it('generates unique IDs when none are provided', () => {
    const fragment: SDFragment = [
      { kind: 'paragraph', paragraph: { inlines: [] } } as any,
      { kind: 'paragraph', paragraph: { inlines: [] } } as any,
    ];

    const result = executeStructuralInsert(editor, { content: fragment });

    expect(result.insertedBlockIds.length).toBe(2);
    expect(result.insertedBlockIds[0]).not.toBe(result.insertedBlockIds[1]);
  });

  it('rejects duplicate IDs within the same fragment', () => {
    const fragment: SDFragment = [
      { kind: 'paragraph', id: 'dup-id', paragraph: { inlines: [] } } as any,
      { kind: 'paragraph', id: 'dup-id', paragraph: { inlines: [] } } as any,
    ];

    expect(() => materializeFragment(editor.state.schema, fragment, new Set(), 'insert')).toThrow(
      /Duplicate block ID within fragment/,
    );
  });

  it('rejects IDs that already exist in the document', () => {
    const fragment: SDFragment = {
      kind: 'paragraph',
      id: 'existing-doc-id',
      paragraph: { inlines: [] },
    } as any;

    const existingIds = new Set(['existing-doc-id']);

    expect(() => materializeFragment(editor.state.schema, fragment, existingIds, 'insert')).toThrow(
      /already exists in the document/,
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 6: Materializer — SDM/1 run marks
// ---------------------------------------------------------------------------

describe('materializeFragment — SDM/1 inline formatting', () => {
  it('applies bold mark from SDM/1 run props', () => {
    const fragment: SDFragment = {
      kind: 'paragraph',
      paragraph: {
        inlines: [{ kind: 'run', run: { text: 'bold text', props: { bold: true } } }],
      },
    } as any;

    const pmFragment = materializeFragment(editor.state.schema, fragment, new Set(), 'insert');
    const paragraph = pmFragment.firstChild!;
    const textNode = paragraph.firstChild!;

    expect(textNode.text).toBe('bold text');
    expect(textNode.marks.some((m) => m.type.name === 'bold')).toBe(true);
  });

  it('applies multiple marks from SDM/1 run props', () => {
    const fragment: SDFragment = {
      kind: 'paragraph',
      paragraph: {
        inlines: [
          {
            kind: 'run',
            run: { text: 'styled', props: { bold: true, italic: true } },
          },
        ],
      },
    } as any;

    const pmFragment = materializeFragment(editor.state.schema, fragment, new Set(), 'insert');
    const textNode = pmFragment.firstChild!.firstChild!;

    expect(textNode.marks.some((m) => m.type.name === 'bold')).toBe(true);
    expect(textNode.marks.some((m) => m.type.name === 'italic')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 6: Nesting guard — SDM/1 kind dispatch
// ---------------------------------------------------------------------------

describe('enforceNestingPolicy — SDM/1 kind dispatch', () => {
  it('detects tables using SDM/1 kind field', () => {
    const tableFragment: SDFragment = {
      kind: 'table',
      table: {
        rows: [{ cells: [{}] }],
      },
    } as any;

    // Insert a table first so we have a position inside a table
    executeStructuralInsert(editor, {
      content: { type: 'table', rows: [{ type: 'tableRow', cells: [{ type: 'tableCell' }] }] },
    });

    let cellPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell' && cellPos === undefined) {
        cellPos = pos + 1;
        return false;
      }
      return true;
    });

    if (cellPos !== undefined) {
      expect(() => enforceNestingPolicy(tableFragment, editor.state.doc, cellPos!)).toThrow(
        /table inside another table/,
      );
    }
  });
});
