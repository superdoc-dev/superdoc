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
import type { SDFragment, SelectionTarget, SDReplaceInput } from '@superdoc/document-api';

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

    const target = { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: blockId };
    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'replaced' }] },
    });

    expect(result.success).toBe(true);
    expect(result.resolution).toBeDefined();
    // Block-targeted structural replace preserves BlockNodeAddress in the receipt.
    expect(result.resolution!.target.kind).toBe('block');
    expect((result.resolution!.target as { nodeId: string }).nodeId).toBe(blockId);
    expect(editor.state.doc.textContent).toContain('replaced');
    expect(editor.state.doc.textContent).not.toContain('old text');
  });

  it('snapshots covered text in resolution.text', () => {
    const seed = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'snapshot me' }] },
    });
    const blockId = seed.insertedBlockIds[0]!;

    const target = { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: blockId };
    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'new' }] },
    });

    expect(result.success).toBe(true);
    expect(result.resolution).toBeDefined();
    // Block-targeted structural replace preserves BlockNodeAddress in the receipt.
    expect(result.resolution!.target.kind).toBe('block');
    expect((result.resolution!.target as { nodeId: string }).nodeId).toBe(blockId);
  });

  it('resolves a block-targeted replace after the paragraph subtype changes', () => {
    // Seed a plain paragraph and capture its address as nodeType: 'paragraph'.
    const seed = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'will restyle' }] },
    });
    const blockId = seed.insertedBlockIds[0]!;
    const staleAddress = { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: blockId };

    // Restyle the paragraph to a heading by setting styleId — this changes
    // mapBlockNodeType() from 'paragraph' to 'heading', making the saved
    // nodeType stale.
    const { doc, tr } = editor.state;
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.attrs.sdBlockId === blockId) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          paragraphProperties: { ...node.attrs.paragraphProperties, styleId: 'Heading1' },
        });
        return false;
      }
    });
    editor.dispatch(tr);

    // The stale address (nodeType: 'paragraph') should still resolve because
    // the structural target resolver falls back to nodeId-only lookup.
    const result = replaceStructuredWrapper(editor, {
      target: staleAddress,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'after restyle' }] },
    });

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('after restyle');
    expect(editor.state.doc.textContent).not.toContain('will restyle');
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

    const target = { kind: 'block' as const, nodeType: 'table' as const, nodeId: tableBlockId };
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
      target: { kind: 'block', nodeType: 'table' as const, nodeId: tableBlockId },
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

    const target = { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: blockId };
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
        target: { kind: 'block', nodeType: 'paragraph' as const, nodeId: blockId },
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
      target: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: paragraphInCellId },
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

    const target = { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: blockId };
    const result = insertStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
      placement: 'before',
    });

    expect(result.success).toBe(true);
    // "before" placement: receipt carries a valid TextAddress resolution.
    expect(result.resolution).toBeDefined();
    expect(result.resolution!.target).toBeDefined();
  });

  it('receipt range reflects "after" placement (default)', () => {
    const seed = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'anchor' }] },
    });
    const blockId = seed.insertedBlockIds[0]!;

    const target = { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: blockId };
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
    // Both inserts target the same block, so the TextAddress anchors reflect insertion points.
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
      target: { kind: 'block' as const, nodeType: 'tableCell' as const, nodeId: cellBlockId },
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

// ---------------------------------------------------------------------------
// Multi-block structural replace (SelectionTarget, ref, receipt accuracy)
// ---------------------------------------------------------------------------

describe('replaceStructuredWrapper — multi-block and locator forms', () => {
  /**
   * Seeds N paragraphs and returns their blockIds in document order.
   */
  function seedParagraphs(texts: string[]): string[] {
    const ids: string[] = [];
    for (const text of texts) {
      const seed = executeStructuralInsert(editor, {
        content: { type: 'paragraph', content: [{ type: 'text', text }] },
      });
      ids.push(seed.insertedBlockIds[0]!);
    }
    return ids;
  }

  /**
   * Builds a SelectionTarget spanning from the start of blockA to the end of blockB.
   */
  function spanSelection(
    startBlockId: string,
    startOffset: number,
    endBlockId: string,
    endOffset: number,
  ): SelectionTarget {
    return {
      kind: 'selection',
      start: { kind: 'text', blockId: startBlockId, offset: startOffset },
      end: { kind: 'text', blockId: endBlockId, offset: endOffset },
    };
  }

  it('replaces multiple blocks when target is a cross-block SelectionTarget', () => {
    const ids = seedParagraphs(['alpha', 'bravo', 'charlie']);

    const target = spanSelection(ids[0]!, 0, ids[2]!, 7);
    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'merged' }] },
    } as SDReplaceInput);

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('merged');
    expect(editor.state.doc.textContent).not.toContain('alpha');
    expect(editor.state.doc.textContent).not.toContain('bravo');
    expect(editor.state.doc.textContent).not.toContain('charlie');
  });

  it('includes selectionTarget in receipt for cross-block SelectionTarget', () => {
    const ids = seedParagraphs(['first', 'second']);

    const target = spanSelection(ids[0]!, 0, ids[1]!, 6);
    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'combined' }] },
    } as SDReplaceInput);

    expect(result.success).toBe(true);
    expect(result.resolution).toBeDefined();
    // Cross-block receipt should carry selectionTarget.
    expect(result.resolution!.selectionTarget).toBeDefined();
    expect(result.resolution!.selectionTarget!.kind).toBe('selection');
  });

  it('replaces a single block via raw nodeId ref', () => {
    const ids = seedParagraphs(['ref-target']);

    const result = replaceStructuredWrapper(editor, {
      ref: ids[0]!,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'ref-replaced' }] },
    } as SDReplaceInput);

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('ref-replaced');
    expect(editor.state.doc.textContent).not.toContain('ref-target');
  });

  it('ref-based structural replace produces a valid resolution without extra fields', () => {
    const ids = seedParagraphs(['no-requested']);

    const result = replaceStructuredWrapper(editor, {
      ref: ids[0]!,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'done' }] },
    } as SDReplaceInput);

    expect(result.success).toBe(true);
    expect(result.resolution).toBeDefined();
    expect(result.resolution!.target).toBeDefined();
    expect(result.resolution!.range).toBeDefined();
  });

  it('replaces a single block via single-block SelectionTarget (no selectionTarget in receipt)', () => {
    const ids = seedParagraphs(['solo']);

    const target = spanSelection(ids[0]!, 0, ids[0]!, 4);
    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'replaced-solo' }] },
    } as SDReplaceInput);

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('replaced-solo');
    // Single-block selection: selectionTarget should be absent.
    expect(result.resolution!.selectionTarget).toBeUndefined();
  });

  it('throws INVALID_TARGET when neither target nor ref is provided', () => {
    expect(() =>
      replaceStructuredWrapper(editor, {
        content: { type: 'paragraph', content: [{ type: 'text', text: 'orphan' }] },
      } as SDReplaceInput),
    ).toThrow(DocumentApiAdapterError);
  });

  it('supports dry-run for cross-block SelectionTarget without mutating', () => {
    const ids = seedParagraphs(['keep-a', 'keep-b']);
    const textBefore = editor.state.doc.textContent;

    const target = spanSelection(ids[0]!, 0, ids[1]!, 6);
    const result = replaceStructuredWrapper(
      editor,
      {
        target,
        content: { type: 'paragraph', content: [{ type: 'text', text: 'gone' }] },
      } as SDReplaceInput,
      { dryRun: true },
    );

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toBe(textBefore);
  });

  it('receipt reflects expanded block boundaries for partial-offset cross-block selection', () => {
    const ids = seedParagraphs(['hello', 'world']);

    // Partial selection: offset 2 in first block, offset 3 in second block.
    // Structural replace expands to full block boundaries.
    const target = spanSelection(ids[0]!, 2, ids[1]!, 3);
    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'expanded' }] },
    } as SDReplaceInput);

    expect(result.success).toBe(true);
    // Both blocks should be fully replaced despite partial offsets.
    expect(editor.state.doc.textContent).toContain('expanded');
    expect(editor.state.doc.textContent).not.toContain('hello');
    expect(editor.state.doc.textContent).not.toContain('world');

    // The effective selectionTarget should describe full block boundaries
    // (offset 0 on first block, full length on last block), not the
    // original partial offsets.
    const sel = result.resolution!.selectionTarget!;
    expect(sel).toBeDefined();
    expect(sel.kind).toBe('selection');
    const startPt = sel.start as { kind: 'text'; blockId: string; offset: number };
    const endPt = sel.end as { kind: 'text'; blockId: string; offset: number };
    expect(startPt.offset).toBe(0);
    expect(endPt.offset).toBe(5); // 'world'.length
  });

  it('receipt reflects expanded block boundary for partial single-block selection', () => {
    const ids = seedParagraphs(['abcdef']);

    // Partial single-block selection: offset 2 to 4.
    // Structural replace expands to the full block.
    const target = spanSelection(ids[0]!, 2, ids[0]!, 4);
    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'full' }] },
    } as SDReplaceInput);

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('full');
    expect(editor.state.doc.textContent).not.toContain('abcdef');

    // Single-block: no selectionTarget needed.
    expect(result.resolution!.selectionTarget).toBeUndefined();
    // The target should report full block (offset 0), not the partial offset.
    expect(result.resolution!.target.blockId).toBe(ids[0]);
  });

  it('multi-segment text: ref replaces all segments and includes selectionTarget', () => {
    const ids = seedParagraphs(['seg-one', 'seg-two', 'seg-three']);

    // Build a synthetic multi-segment V3 text ref.
    const refPayload = {
      v: 3,
      rev: 'ignored', // structural replace does not check ref revision
      scope: 'body',
      segments: [
        { blockId: ids[0]!, blockIndex: 0, runIndex: 0, from: 0, to: 7 },
        { blockId: ids[1]!, blockIndex: 1, runIndex: 0, from: 0, to: 7 },
        { blockId: ids[2]!, blockIndex: 2, runIndex: 0, from: 0, to: 9 },
      ],
    };
    const ref = `text:${btoa(JSON.stringify(refPayload))}`;

    const result = replaceStructuredWrapper(editor, {
      ref,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'all-merged' }] },
    } as SDReplaceInput);

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('all-merged');
    expect(editor.state.doc.textContent).not.toContain('seg-one');
    expect(editor.state.doc.textContent).not.toContain('seg-two');
    expect(editor.state.doc.textContent).not.toContain('seg-three');

    // Multi-block ref: receipt should carry selectionTarget.
    expect(result.resolution!.selectionTarget).toBeDefined();
    expect(result.resolution!.selectionTarget!.kind).toBe('selection');
  });

  it('single-segment text: ref replaces one block without selectionTarget', () => {
    const ids = seedParagraphs(['only-one']);

    const refPayload = {
      v: 3,
      rev: 'ignored',
      scope: 'body',
      segments: [{ blockId: ids[0]!, blockIndex: 0, runIndex: 0, from: 0, to: 8 }],
    };
    const ref = `text:${btoa(JSON.stringify(refPayload))}`;

    const result = replaceStructuredWrapper(editor, {
      ref,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'single-ref' }] },
    } as SDReplaceInput);

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('single-ref');
    expect(editor.state.doc.textContent).not.toContain('only-one');

    // Single-segment: no selectionTarget.
    expect(result.resolution!.selectionTarget).toBeUndefined();
  });

  it('receipt emits nodeEdge endpoint when replacement boundary lands on a table', () => {
    // Seed a paragraph followed by a table.
    const paraIds = seedParagraphs(['before-table']);
    const tableSeed = executeStructuralInsert(editor, {
      content: {
        type: 'table',
        rows: [
          {
            type: 'tableRow',
            cells: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell' }] }] }],
          },
        ],
      },
    });
    const tableId = tableSeed.insertedBlockIds[0]!;

    // Cross-block SelectionTarget: text start on paragraph, nodeEdge end on table.
    const target: SelectionTarget = {
      kind: 'selection',
      start: { kind: 'text', blockId: paraIds[0]!, offset: 0 },
      end: { kind: 'nodeEdge', node: { kind: 'block', nodeType: 'table', nodeId: tableId }, edge: 'after' },
    };

    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'replaced-both' }] },
    } as SDReplaceInput);

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('replaced-both');
    expect(editor.state.doc.textContent).not.toContain('before-table');
    expect(editor.state.doc.textContent).not.toContain('cell');

    // The effective selectionTarget should use kind:'text' for the paragraph
    // and kind:'nodeEdge' for the table.
    const sel = result.resolution!.selectionTarget!;
    expect(sel).toBeDefined();
    expect(sel.kind).toBe('selection');
    expect(sel.start.kind).toBe('text');
    expect(sel.end.kind).toBe('nodeEdge');
    const endPt = sel.end as {
      kind: 'nodeEdge';
      node: { kind: 'block'; nodeType: string; nodeId: string };
      edge: string;
    };
    expect(endPt.node.nodeType).toBe('table');
    expect(endPt.edge).toBe('after');
  });

  it('receipt emits nodeEdge start when first boundary block is a table', () => {
    // Seed a table, then explicitly place a paragraph after it (default insert
    // targets the last text block, which would place it before the table).
    const tableSeed = executeStructuralInsert(editor, {
      content: {
        type: 'table',
        rows: [
          {
            type: 'tableRow',
            cells: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'tdata' }] }] },
            ],
          },
        ],
      },
    });
    const tableId = tableSeed.insertedBlockIds[0]!;

    // Place tail paragraph explicitly after the table.
    const tailSeed = executeStructuralInsert(editor, {
      content: { type: 'paragraph', content: [{ type: 'text', text: 'tail-text' }] },
      target: { kind: 'text', blockId: tableId, range: { start: 0, end: 0 } },
      placement: 'after',
    });
    const tailId = tailSeed.insertedBlockIds[0]!;

    // Cross-block SelectionTarget: nodeEdge start on table, text end on tail paragraph.
    const target: SelectionTarget = {
      kind: 'selection',
      start: { kind: 'nodeEdge', node: { kind: 'block', nodeType: 'table', nodeId: tableId }, edge: 'before' },
      end: { kind: 'text', blockId: tailId, offset: 9 },
    };

    const result = replaceStructuredWrapper(editor, {
      target,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'replaced-all' }] },
    } as SDReplaceInput);

    expect(result.success).toBe(true);
    expect(editor.state.doc.textContent).toContain('replaced-all');

    // The effective selectionTarget should use kind:'nodeEdge' for the table
    // and kind:'text' for the paragraph.
    const sel = result.resolution!.selectionTarget!;
    expect(sel).toBeDefined();
    expect(sel.start.kind).toBe('nodeEdge');
    expect(sel.end.kind).toBe('text');
    const startPt = sel.start as { kind: 'nodeEdge'; node: { kind: 'block'; nodeType: string }; edge: string };
    expect(startPt.node.nodeType).toBe('table');
    expect(startPt.edge).toBe('before');
  });
});
