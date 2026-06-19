import type { FlowBlock } from '@superdoc/contracts';
import { createFontResolver } from '@superdoc/font-system';
import { describe, expect, it } from 'vitest';
import { planFontFaces, planRequiredFontFaces } from './font-load-planner';

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

describe('planFontFaces (face-aware single plan)', () => {
  const keyset = (reqs: { family: string; weight: string; style: string }[]) =>
    new Set(reqs.map((r) => `${r.family}|${r.weight}|${r.style}`));

  it('custom map with one registered target face: Bold queues the logical family, and usedFaces keeps both', () => {
    const resolver = createFontResolver();
    resolver.map('Georgia', 'Gelasio'); // custom target with Regular only registered in this test
    const hasFace = (_f: string, w: '400' | '700', s: 'normal' | 'italic') => w === '400' && s === 'normal';
    const blocks = [para('p', [text('Georgia'), text('Georgia', { bold: true })])];
    const plan = planFontFaces(blocks, resolver, hasFace);
    // Gate awaits: Gelasio Regular (substituted) + Georgia Bold (passed through, not Gelasio Bold).
    expect(keyset(plan.requiredFaces)).toEqual(new Set(['Gelasio|400|normal', 'Georgia|700|normal']));
    // Report inputs keep the logical family + face for both.
    expect(plan.usedFaces).toEqual([
      { logicalFamily: 'Georgia', weight: '400', style: 'normal' },
      { logicalFamily: 'Georgia', weight: '700', style: 'normal' },
    ]);
    // effectiveSignature records each face's resolution (incl. source face + reason), excluding load
    // status, as collision-safe JSON tuples.
    expect(plan.effectiveSignature).toContain('["georgia","400","normal","gelasio","400","normal","custom_mapping"]');
    expect(plan.effectiveSignature).toContain(
      '["georgia","700","normal","georgia","700","normal","fallback_face_absent"]',
    );
  });

  it('treats a quoted primary family as the same used face as its bare form', () => {
    const resolver = createFontResolver();
    // '"Calibri"' (quoted) and 'Calibri' (bare) are ONE logical family: primaryFamily strips
    // surrounding quotes like the resolver, so they collapse to a single used face / signature
    // entry instead of two divergent rows.
    const plan = planFontFaces([para('p', [text('"Calibri"'), text('Calibri')])], resolver);
    expect(plan.usedFaces).toEqual([{ logicalFamily: 'Calibri', weight: '400', style: 'normal' }]);
  });

  it('effectiveSignature changes when face availability changes for the SAME family map', () => {
    const resolver = createFontResolver();
    resolver.map('Georgia', 'Gelasio');
    const blocks = [para('p', [text('Georgia', { bold: true })])];
    const regularOnly = (_f: string, w: '400' | '700') => w === '400';
    const allFaces = () => true;
    // Same blocks + same map, but a fonts.add() makes Bold available -> resolution flips ->
    // the cache identity MUST differ (resolver.signature alone would not capture this).
    const sigBefore = planFontFaces(blocks, resolver, regularOnly).effectiveSignature;
    const sigAfter = planFontFaces(blocks, resolver, allFaces).effectiveSignature;
    expect(sigBefore).not.toBe(sigAfter);
  });

  it('four-face clone: all faces resolve to the substitute (requiredFaces unchanged vs family-level)', () => {
    const resolver = createFontResolver();
    // Only the bundled CLONE (Carlito) is registered - the normal substitute case. An all-true oracle
    // would mark Calibri itself registered, so provider precedence would (correctly) resolve it to
    // `registered_face` (Calibri) instead of the clone - which is a different scenario.
    const cloneFaces = (f: string) => f.replace(/^["']|["']$/g, '').toLowerCase() === 'carlito';
    const blocks = [
      para('p', [
        text('Calibri'),
        text('Calibri', { bold: true }),
        text('Calibri', { italic: true }),
        text('Calibri', { bold: true, italic: true }),
      ]),
    ];
    expect(keyset(planFontFaces(blocks, resolver, cloneFaces).requiredFaces)).toEqual(
      new Set(['Carlito|400|normal', 'Carlito|700|normal', 'Carlito|400|italic', 'Carlito|700|italic']),
    );
  });

  it('DocFonts synthetic face: Cooper Black Bold queues Caprasimo Regular as the source face', () => {
    const resolver = createFontResolver();
    const caprasimoRegular = (f: string, w: '400' | '700', s: 'normal' | 'italic') =>
      f.replace(/^["']|["']$/g, '').toLowerCase() === 'caprasimo' && w === '400' && s === 'normal';
    const plan = planFontFaces([para('p', [text('Cooper Black', { bold: true })])], resolver, caprasimoRegular);
    expect(keyset(plan.requiredFaces)).toEqual(new Set(['Caprasimo|400|normal']));
    expect(plan.effectiveSignature).toContain(
      '["cooper black","700","normal","caprasimo","400","normal","bundled_substitute"]',
    );
  });

  it('DocFonts synthetic face: a real requested substitute face is queued before the synthetic source', () => {
    const resolver = createFontResolver();
    const caprasimoRegularAndBold = (f: string, w: '400' | '700', s: 'normal' | 'italic') =>
      f.replace(/^["']|["']$/g, '').toLowerCase() === 'caprasimo' && (w === '400' || w === '700') && s === 'normal';
    const plan = planFontFaces([para('p', [text('Cooper Black', { bold: true })])], resolver, caprasimoRegularAndBold);
    expect(keyset(plan.requiredFaces)).toEqual(new Set(['Caprasimo|700|normal']));
    expect(plan.effectiveSignature).toContain(
      '["cooper black","700","normal","caprasimo","700","normal","bundled_substitute"]',
    );
  });

  it('a quoted registered family produces a BARE required face (Calibri|..., not "Calibri"|...)', () => {
    const resolver = createFontResolver();
    // A run whose CSS family is quoted (`"Calibri"`) and whose real face is registered. The required
    // face the gate awaits must be the bare `Calibri|400|normal`; a quoted `"Calibri"|400|normal` would
    // re-quote in the probe and never match the registered face.
    const registeredCalibri = (f: string) => f.replace(/^["']|["']$/g, '').toLowerCase() === 'calibri';
    const reqs = planFontFaces([para('p', [text('"Calibri"')])], resolver, registeredCalibri).requiredFaces;
    expect(keyset(reqs)).toEqual(new Set(['Calibri|400|normal']));
  });
});
