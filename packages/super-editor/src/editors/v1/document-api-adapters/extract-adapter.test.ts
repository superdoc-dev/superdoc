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

type TextRun =
  | string
  | {
      text: string;
      marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
    };

function textNode(run: TextRun): unknown {
  if (typeof run === 'string') return { type: 'text', text: run };
  return {
    type: 'text',
    text: run.text,
    ...(run.marks ? { marks: run.marks } : {}),
  };
}

function paragraphRuns(runs: TextRun[], attrs: Record<string, unknown> = {}): unknown {
  return {
    type: 'paragraph',
    attrs,
    content: runs.map(textNode),
  };
}

function trackInsertMark(
  id: string,
  author = 'Author',
  date = '2026-01-01T00:00:00Z',
): {
  type: string;
  attrs: Record<string, unknown>;
} {
  return { type: 'trackInsert', attrs: { id, author, date } };
}

function trackDeleteMark(
  id: string,
  author = 'Author',
  date = '2026-01-01T00:00:00Z',
  attrs: Record<string, unknown> = {},
): {
  type: string;
  attrs: Record<string, unknown>;
} {
  return { type: 'trackDelete', attrs: { id, author, date, ...attrs } };
}

function trackFormatMark(
  id: string,
  author = 'Author',
  date = '2026-01-01T00:00:00Z',
): {
  type: string;
  attrs: Record<string, unknown>;
} {
  return { type: 'trackFormat', attrs: { id, author, date } };
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

describe('extract-adapter tracked-change spans', () => {
  let editor: Editor | undefined;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  it('omits textSpans on blocks with no tracked changes', async () => {
    const doc: SchemaDoc = {
      type: 'doc',
      content: [paragraph('Plain paragraph with no tracked changes.')],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const block = result.blocks[0];

    expect(block.text).toBe('Plain paragraph with no tracked changes.');
    expect(block.textSpans).toBeUndefined();
    expect(result.trackedChanges).toEqual([]);
  });

  it('disambiguates repeated words by carrying tracked-change marks per span', async () => {
    // "the the the" with only the middle "the" tracked-deleted.
    const doc: SchemaDoc = {
      type: 'doc',
      content: [paragraphRuns(['the ', { text: 'the', marks: [trackDeleteMark('raw-del-1', 'Author')] }, ' the'])],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const block = result.blocks[0];

    expect(block.text).toBe('the the the');
    expect(block.textSpans).toBeDefined();
    expect(block.textSpans!.map((s) => s.text).join('')).toBe(block.text);

    const taggedSpans = block.textSpans!.filter((s) => s.trackedChanges && s.trackedChanges.length > 0);
    expect(taggedSpans).toHaveLength(1);
    expect(taggedSpans[0].text).toBe('the');
    expect(taggedSpans[0].trackedChanges![0].type).toBe('delete');

    // The tracked-changes index lists this change once and points back at the block.
    expect(result.trackedChanges).toHaveLength(1);
    expect(result.trackedChanges[0].type).toBe('delete');
    expect(result.trackedChanges[0].blockIds).toEqual([block.nodeId]);
    expect(result.trackedChanges[0].entityId).toBe(taggedSpans[0].trackedChanges![0].entityId);
  });

  it('represents an adjacent delete + insert replacement as two separately tagged spans', async () => {
    // "The old word" -> delete "old" then insert "new" right after.
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        paragraphRuns([
          'The ',
          { text: 'old', marks: [trackDeleteMark('raw-del-2', 'Author')] },
          { text: 'new', marks: [trackInsertMark('raw-ins-2', 'Author')] },
          ' word',
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const block = result.blocks[0];

    expect(block.text).toBe('The oldnew word');
    expect(block.textSpans).toBeDefined();
    expect(block.textSpans!.map((s) => s.text).join('')).toBe(block.text);

    const taggedSpans = block.textSpans!.filter((s) => s.trackedChanges && s.trackedChanges.length > 0);
    expect(taggedSpans).toHaveLength(2);
    expect(taggedSpans.map((s) => `${s.text}:${s.trackedChanges![0].type}`)).toEqual(['old:delete', 'new:insert']);

    // Two separate entityIds since they are independent revisions.
    const [delEntity, insEntity] = taggedSpans.map((s) => s.trackedChanges![0].entityId);
    expect(delEntity).not.toBe(insEntity);

    expect(result.trackedChanges).toHaveLength(2);
    for (const tc of result.trackedChanges) {
      expect(tc.blockIds).toEqual([block.nodeId]);
    }
  });

  it('preserves overlapping insert + format marks on a single span', async () => {
    // One run carries both trackInsert and trackFormat. Span must list both.
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        paragraphRuns([
          'plain ',
          {
            text: 'styled',
            marks: [trackInsertMark('raw-ins-3', 'Author'), trackFormatMark('raw-fmt-3', 'Author')],
          },
          ' tail',
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const block = result.blocks[0];

    expect(block.text).toBe('plain styled tail');
    expect(block.textSpans).toBeDefined();
    expect(block.textSpans!.map((s) => s.text).join('')).toBe(block.text);

    const styledSpan = block.textSpans!.find((s) => s.text === 'styled');
    expect(styledSpan).toBeDefined();
    expect(styledSpan!.trackedChanges).toBeDefined();
    expect(styledSpan!.trackedChanges).toHaveLength(2);

    const types = styledSpan!.trackedChanges!.map((tc) => tc.type).sort();
    expect(types).toEqual(['format', 'insert']);

    // Both entityIds are reported in the trackedChanges index.
    const reported = result.trackedChanges.map((tc) => tc.type).sort();
    expect(reported).toEqual(['format', 'insert']);
    for (const tc of result.trackedChanges) {
      expect(tc.blockIds).toEqual([block.nodeId]);
    }
  });

  it('preserves overlapping insert + delete marks on a single span', async () => {
    const parentInsertId = 'raw-overlap-ins';
    const childDeleteId = 'raw-overlap-del';
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        paragraphRuns([
          'plain ',
          {
            text: 'review',
            marks: [
              trackInsertMark(parentInsertId, 'Insert Author'),
              trackDeleteMark(childDeleteId, 'Delete Author', '2026-01-01T00:00:00Z', {
                overlapParentId: parentInsertId,
              }),
            ],
          },
          ' tail',
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const block = result.blocks[0];

    expect(block.text).toBe('plain review tail');
    expect(block.textSpans).toBeDefined();
    expect(block.textSpans!.map((s) => s.text).join('')).toBe(block.text);

    const overlapSpan = block.textSpans!.find((s) => s.text === 'review');
    expect(overlapSpan).toBeDefined();
    expect(overlapSpan!.trackedChanges).toBeDefined();
    expect(overlapSpan!.trackedChanges).toHaveLength(2);
    expect(overlapSpan!.trackedChanges!.map((tc) => tc.type).sort()).toEqual(['delete', 'insert']);

    const entityIds = new Set(overlapSpan!.trackedChanges!.map((tc) => tc.entityId));
    expect(entityIds.size).toBe(2);
    expect(result.trackedChanges.map((tc) => tc.type).sort()).toEqual(['delete', 'insert']);
    for (const tc of result.trackedChanges) {
      expect(tc.blockIds).toEqual([block.nodeId]);
    }
  });

  it('attaches spans inside table cells without breaking tableContext', async () => {
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        table([
          row([
            cell([paragraphRuns(['hello ', { text: 'world', marks: [trackInsertMark('raw-ins-4', 'Author')] }])]),
            cell([paragraph('clean cell')]),
          ]),
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});

    const tagged = result.blocks.find((b) => b.text === 'hello world')!;
    const clean = result.blocks.find((b) => b.text === 'clean cell')!;

    expect(tagged.tableContext).toBeDefined();
    expect(tagged.tableContext!.rowIndex).toBe(0);
    expect(tagged.tableContext!.columnIndex).toBe(0);
    expect(tagged.textSpans).toBeDefined();
    expect(tagged.textSpans!.find((s) => s.text === 'world')!.trackedChanges![0].type).toBe('insert');

    expect(clean.tableContext).toBeDefined();
    expect(clean.textSpans).toBeUndefined();

    expect(result.trackedChanges).toHaveLength(1);
    expect(result.trackedChanges[0].blockIds).toEqual([tagged.nodeId]);
  });

  it('suppresses the paired replacement excerpt for in-app tracked replacements with no OOXML sourceId', async () => {
    // Reproduces the codex-bot finding on PR #2973: paired replacements
    // created via in-app tracked editing have no `sourceId` on the marks,
    // so `wordRevisionIds` is empty. Paired detection must come from the
    // span walk's observed mark types, not from wordRevisionIds.
    const sharedRawId = 'raw-paired-no-source';
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        paragraphRuns([
          'before ',
          { text: 'old', marks: [trackDeleteMark(sharedRawId, 'Author')] },
          { text: 'new', marks: [trackInsertMark(sharedRawId, 'Author')] },
          ' after',
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    expect(result.trackedChanges).toHaveLength(1);

    const entry = result.trackedChanges[0];
    expect(entry.type).toBe('replacement');
    expect(entry.wordRevisionIds).toBeUndefined();
    // The whole point: even without OOXML provenance, the concatenated
    // excerpt is suppressed because the spans showed both insert and delete.
    expect(entry.excerpt).toBeUndefined();

    // Spans still carry the per-half truth.
    const block = result.blocks[0];
    const taggedSpans = block.textSpans!.filter((s) => s.trackedChanges && s.trackedChanges.length > 0);
    expect(taggedSpans.map((s) => `${s.text}:${s.trackedChanges![0].type}`)).toEqual(['old:delete', 'new:insert']);
  });

  it('coalesces adjacent runs that carry identical tracked-change marks into one span', async () => {
    // Two separate text runs both wrapped in the same trackInsert mark must
    // collapse into a single span — otherwise consumers see fragmented spans
    // and have to re-merge in their rendering layer.
    const sharedRawId = 'raw-coalesce-1';
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        paragraphRuns([
          'plain ',
          { text: 'first', marks: [trackInsertMark(sharedRawId, 'Author')] },
          { text: 'second', marks: [trackInsertMark(sharedRawId, 'Author')] },
          ' tail',
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const block = result.blocks[0];
    expect(block.text).toBe('plain firstsecond tail');
    expect(block.textSpans).toHaveLength(3);
    expect(block.textSpans!.map((s) => s.text)).toEqual(['plain ', 'firstsecond', ' tail']);
    expect(block.textSpans![1].trackedChanges).toHaveLength(1);
    expect(block.textSpans![1].trackedChanges![0].type).toBe('insert');
  });

  it('ignores non-tracked marks (bold) when computing span boundaries', async () => {
    // A run with bold + trackInsert and an adjacent run with only bold must
    // emit separate spans because their tracked-change sets differ — even
    // though their non-tracked marks (bold) match. The walker must filter on
    // tracked marks only.
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        paragraphRuns([
          { text: 'bold-only', marks: [{ type: 'bold' }] },
          {
            text: 'bold-and-inserted',
            marks: [{ type: 'bold' }, trackInsertMark('raw-bold-ins', 'Author')],
          },
          { text: ' tail', marks: [{ type: 'bold' }] },
        ]),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const block = result.blocks[0];
    expect(block.textSpans).toBeDefined();
    expect(block.textSpans!.map((s) => s.text).join('')).toBe(block.text);

    const taggedSpans = block.textSpans!.filter((s) => s.trackedChanges && s.trackedChanges.length > 0);
    expect(taggedSpans).toHaveLength(1);
    expect(taggedSpans[0].text).toBe('bold-and-inserted');
    expect(taggedSpans[0].trackedChanges![0].type).toBe('insert');
  });

  it('lists every block that carries the same tracked change in blockIds', async () => {
    // Two separate paragraphs both share the same raw mark id - the resolver
    // groups them into one entity. blockIds should list both block nodeIds.
    const doc: SchemaDoc = {
      type: 'doc',
      content: [
        paragraphRuns(['first ', { text: 'half', marks: [trackInsertMark('raw-ins-shared', 'Author')] }]),
        paragraphRuns([{ text: 'second', marks: [trackInsertMark('raw-ins-shared', 'Author')] }, ' half']),
      ],
    };

    const ctx = await makeEditor(doc);
    editor = ctx.editor;

    const result = extractAdapter(editor, {});

    expect(result.trackedChanges).toHaveLength(1);
    const tc = result.trackedChanges[0];
    expect(tc.type).toBe('insert');
    expect(new Set(tc.blockIds)).toEqual(new Set(result.blocks.map((b) => b.nodeId)));
  });
});
