import { describe, it, expect } from 'vitest';
import { planRequiredFontFaces } from './font-load-planner';
import type { FlowBlock } from '@superdoc/contracts';

const text = (fontFamily: string, opts: { bold?: boolean; italic?: boolean } = {}) => ({
  kind: 'text' as const,
  text: 'x',
  fontFamily,
  fontSize: 12,
  ...opts,
});

const para = (id: string, runs: ReturnType<typeof text>[]): FlowBlock =>
  ({ kind: 'paragraph', id, runs }) as unknown as FlowBlock;

const keyset = (reqs: ReturnType<typeof planRequiredFontFaces>) =>
  new Set(reqs.map((r) => `${r.family}|${r.weight}|${r.style}`));

describe('planRequiredFontFaces', () => {
  it('emits one physical face per used weight/style, resolved logical -> physical', () => {
    const blocks = [
      para('p', [
        text('Calibri'),
        text('Calibri', { bold: true }),
        text('Calibri', { italic: true }),
        text('Calibri', { bold: true, italic: true }),
      ]),
    ];
    expect(keyset(planRequiredFontFaces(blocks))).toEqual(
      new Set(['Carlito|400|normal', 'Carlito|700|normal', 'Carlito|400|italic', 'Carlito|700|italic']),
    );
  });

  it('only emits faces for fonts actually rendered (declared-but-unused never appears)', () => {
    // A doc whose runs use only Calibri -> only Carlito faces, regardless of what the
    // fontTable declared (the planner never sees the fontTable).
    const reqs = planRequiredFontFaces([para('p', [text('Calibri'), text('Calibri', { bold: true })])]);
    expect(keyset(reqs)).toEqual(new Set(['Carlito|400|normal', 'Carlito|700|normal']));
  });

  it('dedupes repeated faces across runs and blocks', () => {
    const reqs = planRequiredFontFaces([
      para('a', [text('Arial'), text('Arial')]),
      para('b', [text('Arial', { bold: true }), text('Arial', { bold: true })]),
    ]);
    expect(reqs).toHaveLength(2);
    expect(keyset(reqs)).toEqual(new Set(['Liberation Sans|400|normal', 'Liberation Sans|700|normal']));
  });

  it('walks table cells (paragraph and multi-block content)', () => {
    const table = {
      kind: 'table',
      id: 't',
      rows: [
        {
          id: 'r',
          cells: [
            { id: 'c1', paragraph: para('cp', [text('Times New Roman', { italic: true })]) },
            { id: 'c2', blocks: [para('cb', [text('Courier New')])] },
          ],
        },
      ],
    } as unknown as FlowBlock;
    expect(keyset(planRequiredFontFaces([table]))).toEqual(
      new Set(['Liberation Serif|400|italic', 'Liberation Mono|400|normal']),
    );
  });

  it('walks list item paragraphs', () => {
    const list = {
      kind: 'list',
      id: 'l',
      listType: 'bullet',
      items: [{ id: 'i', marker: { kind: 'bullet', text: '•', level: 0 }, paragraph: para('ip', [text('Cambria')]) }],
    } as unknown as FlowBlock;
    expect(keyset(planRequiredFontFaces([list]))).toEqual(new Set(['Caladea|400|normal']));
  });

  it('passes an unmapped family through as-is (no substitute)', () => {
    const reqs = planRequiredFontFaces([para('p', [text('Aptos', { bold: true })])]);
    expect(keyset(reqs)).toEqual(new Set(['Aptos|700|normal']));
  });

  it('resolves a CSS stack to its primary physical family', () => {
    const reqs = planRequiredFontFaces([para('p', [text('Calibri, sans-serif')])]);
    expect(keyset(reqs)).toEqual(new Set(['Carlito|400|normal']));
  });

  it('collects the word-layout marker run font (measured separately from item text)', () => {
    // A list paragraph whose marker glyph uses a bold mapped family distinct from the text.
    const block = {
      kind: 'paragraph',
      id: 'p',
      runs: [text('Calibri')],
      attrs: { wordLayout: { marker: { markerText: '1.', run: { fontFamily: 'Arial', fontSize: 12, bold: true } } } },
    } as unknown as FlowBlock;
    expect(keyset(planRequiredFontFaces([block]))).toEqual(
      new Set(['Carlito|400|normal', 'Liberation Sans|700|normal']),
    );
  });

  it('collects the drop-cap descriptor run font (measured separately, distinct face)', () => {
    // A paragraph with an Arial body and a Cambria(->Caladea) drop cap whose text lives in
    // attrs.dropCapDescriptor.run, not in `runs`.
    const block = {
      kind: 'paragraph',
      id: 'p',
      runs: [text('Arial')],
      attrs: { dropCapDescriptor: { run: { text: 'A', fontFamily: 'Cambria', fontSize: 117 }, lines: 3 } },
    } as unknown as FlowBlock;
    expect(keyset(planRequiredFontFaces([block]))).toEqual(
      new Set(['Liberation Sans|400|normal', 'Caladea|400|normal']),
    );
  });

  it('plans Arial for a field annotation with no explicit font (matches the measurer default)', () => {
    // FieldAnnotationRun.fontFamily is optional; the measurer measures a fontless pill
    // against 'Arial' (-> Liberation Sans), so the planner must await that face.
    const block = {
      kind: 'paragraph',
      id: 'p',
      runs: [{ kind: 'fieldAnnotation', text: 'x', fontSize: 12 }],
    } as unknown as FlowBlock;
    expect(keyset(planRequiredFontFaces([block]))).toEqual(new Set(['Liberation Sans|400|normal']));
  });

  it('ignores runs with no fontFamily and empty input', () => {
    expect(planRequiredFontFaces([])).toEqual([]);
    expect(planRequiredFontFaces(null)).toEqual([]);
    const reqs = planRequiredFontFaces([para('p', [{ kind: 'text', text: 'x', fontSize: 12 } as never])]);
    expect(reqs).toEqual([]);
  });
});
