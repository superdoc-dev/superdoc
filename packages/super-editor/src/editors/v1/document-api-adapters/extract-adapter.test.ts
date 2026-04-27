/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import type { Editor } from '../core/Editor.js';
import { extractAdapter } from './extract-adapter.js';
import { buildBlockIndex } from './helpers/node-address-resolver.js';

// ---------------------------------------------------------------------------
// Doc builders
//
// These use initTestEditor's schema content mode so the PM schema normalizes
// the JSON into real nodes. That gives us a realistic Editor instance while
// still letting us shape the doc to hit specific extract edge cases.
// ---------------------------------------------------------------------------

type SchemaDoc = {
  type: 'doc';
  content: unknown[];
};

function paragraph(text: string, attrs: Record<string, unknown> = {}): unknown {
  return {
    type: 'paragraph',
    attrs,
    content: text ? [{ type: 'text', text }] : [],
  };
}

function cell(content: unknown[], attrs: Record<string, unknown> = {}): unknown {
  return {
    type: 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: [100], ...attrs },
    content,
  };
}

function row(cells: unknown[]): unknown {
  return { type: 'tableRow', content: cells };
}

function table(rows: unknown[]): unknown {
  return { type: 'table', content: rows };
}

function sdt(content: unknown[], attrs: Record<string, unknown> = {}): unknown {
  return {
    type: 'structuredContentBlock',
    attrs: { id: 'sdt-1', tag: null, alias: null, sdtPr: null, ...attrs },
    content,
  };
}

function makeEditor(doc: SchemaDoc): Promise<{ editor: Editor }> {
  return initTestEditor({ content: doc, loadFromSchema: true }) as Promise<{ editor: Editor }>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extract-adapter table handling', () => {
  let editor: Editor | undefined;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  it('skips gridBefore/gridAfter placeholder cells', async () => {
    // Row 0 starts with a gridBefore placeholder followed by two real cells.
    // Row 1 is two real cells plus a gridAfter placeholder.
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        table([
          row([
            cell([paragraph('')], { __placeholder: 'gridBefore' }),
            cell([paragraph('r0c1')]),
            cell([paragraph('r0c2')]),
          ]),
          row([
            cell([paragraph('r1c0')]),
            cell([paragraph('r1c1')]),
            cell([paragraph('')], { __placeholder: 'gridAfter' }),
          ]),
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const tableBlocks = result.blocks.filter((b) => b.tableContext);
    const byCoord = (r: number, c: number) =>
      tableBlocks.find((b) => b.tableContext!.rowIndex === r && b.tableContext!.columnIndex === c);

    // Placeholder slots do not emit blocks.
    expect(byCoord(0, 0)).toBeUndefined();
    expect(byCoord(1, 2)).toBeUndefined();

    // Real cells still emit at their logical grid columns.
    expect(byCoord(0, 1)?.text).toBe('r0c1');
    expect(byCoord(0, 2)?.text).toBe('r0c2');
    expect(byCoord(1, 0)?.text).toBe('r1c0');
    expect(byCoord(1, 1)?.text).toBe('r1c1');

    // No phantom cell from placeholder text.
    expect(
      tableBlocks.some((b) => b.text === '' && b.tableContext!.rowIndex === 0 && b.tableContext!.columnIndex === 0),
    ).toBe(false);
  });

  it('reports grid coordinates from TableMap, not cell child order, across merges', async () => {
    // Row 0: one cell with colspan=2, then a regular cell.
    // Row 1: three regular cells.
    // TableMap should place row-0 cells at columns 0 and 2; row-1 cells at 0, 1, 2.
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        table([
          row([cell([paragraph('A')], { colspan: 2 }), cell([paragraph('B')])]),
          row([cell([paragraph('C')]), cell([paragraph('D')]), cell([paragraph('E')])]),
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const tableBlocks = result.blocks.filter((b) => b.tableContext);

    const a = tableBlocks.find((b) => b.text === 'A')!;
    const b = tableBlocks.find((b) => b.text === 'B')!;
    const e = tableBlocks.find((b) => b.text === 'E')!;

    expect(a.tableContext!.columnIndex).toBe(0);
    expect(a.tableContext!.colspan).toBe(2);
    expect(b.tableContext!.columnIndex).toBe(2); // grid column, not cellChildIndex=1
    expect(e.tableContext!.columnIndex).toBe(2);
  });
});

describe('extract-adapter SDT transparency', () => {
  let editor: Editor | undefined;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  it('does not emit a wrapper block for a top-level structuredContentBlock', async () => {
    const doc: SchemaDoc = {
      type: 'doc',
      content: [sdt([paragraph('inside sdt')]), paragraph('outside')],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});

    expect(result.blocks.some((b) => b.type === 'sdt')).toBe(false);
    expect(result.blocks.find((b) => b.text === 'inside sdt')?.type).toBe('paragraph');
    expect(result.blocks.find((b) => b.text === 'outside')?.type).toBe('paragraph');
  });

  it('recurses transparently into unrecognized block containers inside a cell', async () => {
    // documentSection is a block wrapper (`content: 'block*'`) that neither
    // mapBlockNodeType nor EMITTABLE_BLOCK_TYPES recognize. The walker must
    // step through it so paragraphs inside still emit with the cell's
    // tableContext attached. The pre-SD-2672 textContent walk included
    // this text, so skipping it would be a coverage regression.
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        table([
          row([
            cell([
              {
                type: 'documentSection',
                attrs: {},
                content: [paragraph('inside section')],
              },
            ]),
            cell([paragraph('normal cell')]),
          ]),
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const wrapped = result.blocks.find((b) => b.text === 'inside section');
    const normal = result.blocks.find((b) => b.text === 'normal cell');

    expect(wrapped).toBeDefined();
    expect(wrapped!.type).toBe('paragraph');
    expect(wrapped!.tableContext).toBeDefined();
    expect(wrapped!.tableContext!.rowIndex).toBe(0);
    expect(wrapped!.tableContext!.columnIndex).toBe(0);

    expect(normal?.tableContext?.columnIndex).toBe(1);
  });

  it('does not flatten tables wrapped in an SDT', async () => {
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        sdt([
          table([
            row([cell([paragraph('x1')]), cell([paragraph('x2')])]),
            row([cell([paragraph('y1')]), cell([paragraph('y2')])]),
          ]),
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});

    expect(result.blocks.some((b) => b.type === 'sdt')).toBe(false);
    expect(result.blocks.some((b) => b.type === 'table')).toBe(false);

    // Per-cell blocks land with correct grid coordinates.
    for (const [label, r, c] of [
      ['x1', 0, 0],
      ['x2', 0, 1],
      ['y1', 1, 0],
      ['y2', 1, 1],
    ] as const) {
      const block = result.blocks.find((b) => b.text === label);
      expect(block).toBeDefined();
      expect(block!.tableContext).toBeDefined();
      expect(block!.tableContext!.rowIndex).toBe(r);
      expect(block!.tableContext!.columnIndex).toBe(c);
    }
  });
});

describe('extract-adapter fallback path consistency with buildBlockIndex', () => {
  let editor: Editor | undefined;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  it('produces nodeIds that resolve through buildBlockIndex for paragraphs in merged tables', async () => {
    // Paragraphs get paraId / sdBlockId from the schema / plugins. We don't
    // try to strip them here - the assertion is that whatever ID strategy
    // the resolver picks, extract and buildBlockIndex agree on the result.
    // If they diverge, the scrollToElement-from-extract path breaks.
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        table([
          // Row 0: one colspan=2 cell followed by a regular cell. Physical
          // cell indexes 0 and 1 but logical grid columns 0 and 2 - exactly
          // the case where logical-vs-physical path divergence used to break
          // fallback ID hashing.
          row([cell([paragraph('merged')], { colspan: 2 }), cell([paragraph('right')])]),
          row([cell([paragraph('a')]), cell([paragraph('b')]), cell([paragraph('c')])]),
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const index = buildBlockIndex(editor);
    const byKey = new Map(index.candidates.map((c) => [`${c.nodeType}:${c.nodeId}`, c]));

    const cellBlocks = result.blocks.filter((b) => b.tableContext);
    expect(cellBlocks.length).toBe(5);

    for (const block of cellBlocks) {
      const key = `${block.type}:${block.nodeId}`;
      expect(byKey.has(key), `extract nodeId ${key} should resolve through buildBlockIndex`).toBe(true);
    }
  });
});
