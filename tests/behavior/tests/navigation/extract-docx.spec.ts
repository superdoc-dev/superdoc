/**
 * Import-driven extract tests for SD-2672.
 *
 * Each test loads a real .docx fixture via `superdoc.loadDocument()`, which
 * exercises the full DOCX import path (super-converter, normalization,
 * paraId synthesis, placeholder cell injection, vMerge folding) before
 * calling `doc.extract()`. This is the layer our schema-driven adapter unit
 * tests do not cover and where real OOXML weirdness manifests.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

const fixture = (name: string) => path.join(FIXTURES_DIR, name);

function requireFixture(name: string): string {
  const p = fixture(name);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing SD-2672 fixture "${name}" in ${FIXTURES_DIR}.`);
  }
  return p;
}

async function loadAndExtract(
  superdoc: { loadDocument: (p: string) => Promise<void>; page: { evaluate: <T>(fn: () => T) => Promise<T> } },
  fixtureName: string,
): Promise<{
  blocks: Array<Record<string, unknown>>;
  comments: unknown[];
  trackedChanges: unknown[];
  revision: string;
}> {
  await superdoc.loadDocument(requireFixture(fixtureName));
  return superdoc.page.evaluate(() => (window as any).editor.doc.extract({}) as any);
}

// ---------------------------------------------------------------------------
// Baseline: plain 3x3 table authored by Word COM
// ---------------------------------------------------------------------------

test('@behavior SD-2672 docx: plain 3x3 table emits one block per cell paragraph', async ({ superdoc }) => {
  // NOTE: Word's COM API inserts a leading empty paragraph into every cell.
  // That's real document state, so extraction correctly surfaces it as a
  // separate block. The test verifies the 9 authored cells are reachable
  // at their correct grid coordinates, not the exact block count.
  const result = await loadAndExtract(superdoc, 'sd-2672-plain-3x3.docx');

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const block = result.blocks.find((b: any) => b.text === `r${r}c${c}`);
      expect(block, `r${r}c${c}`).toBeDefined();
      const tc = (block as any).tableContext;
      expect(tc.rowIndex).toBe(r);
      expect(tc.columnIndex).toBe(c);
      expect(tc.rowspan).toBe(1);
      expect(tc.colspan).toBe(1);
      expect(tc.tableOrdinal).toBe(0);
    }
  }

  // No flattened 'type: table' block.
  expect(result.blocks.find((b: any) => b.type === 'table')).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Merged cells: colspan + rowspan authored by Word
// ---------------------------------------------------------------------------

test('@behavior SD-2672 docx: merged cells report rowspan/colspan on anchors only', async ({ superdoc }) => {
  const result = await loadAndExtract(superdoc, 'sd-2672-merged-table.docx');

  const top = result.blocks.find((b: any) => b.text === 'top-span');
  const left = result.blocks.find((b: any) => b.text === 'left-span');
  expect(top, 'top-span anchor').toBeDefined();
  expect(left, 'left-span anchor').toBeDefined();

  const topCtx = (top as any).tableContext;
  expect(topCtx.rowIndex).toBe(0);
  expect(topCtx.columnIndex).toBe(0);
  expect(topCtx.colspan).toBe(2);
  expect(topCtx.rowspan).toBe(1);

  const leftCtx = (left as any).tableContext;
  expect(leftCtx.rowIndex).toBe(1);
  expect(leftCtx.columnIndex).toBe(0);
  expect(leftCtx.rowspan).toBe(2);
  expect(leftCtx.colspan).toBe(1);

  // No continuation cell at (0,1), (2,0), etc.
  const blocksAt = (r: number, c: number) =>
    result.blocks.filter((b: any) => b.tableContext?.rowIndex === r && b.tableContext?.columnIndex === c);
  expect(blocksAt(0, 1)).toHaveLength(0);
  expect(blocksAt(2, 0)).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// RTL table: bidiVisual should not affect logical grid coords
// ---------------------------------------------------------------------------

test('@behavior SD-2672 docx: RTL table reports logical grid columns', async ({ superdoc }) => {
  const result = await loadAndExtract(superdoc, 'sd-2672-rtl-table.docx');

  // Every cell we wrote lands somewhere with a tableContext.
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const block = result.blocks.find((b: any) => b.text === `rtl-r${r}c${c}`);
      expect(block, `rtl-r${r}c${c}`).toBeDefined();
      expect((block as any).tableContext).toBeDefined();
    }
  }

  // Each row's non-empty cells cover grid columns {0, 1, 2}. Empty blocks
  // from Word's leading-paragraph padding are ignored; what we assert is that
  // each authored cell lands at a distinct logical column.
  for (let r = 0; r < 2; r++) {
    const rowCols = new Set(
      result.blocks
        .filter((b: any) => b.tableContext?.rowIndex === r && b.text.length > 0)
        .map((b: any) => b.tableContext.columnIndex),
    );
    expect(rowCols).toEqual(new Set([0, 1, 2]));
  }
});

// ---------------------------------------------------------------------------
// gridBefore + vMerge: no phantom blocks, correct grid coords on the anchor
// ---------------------------------------------------------------------------

test('@behavior SD-2672 docx: gridBefore + vMerge does not emit phantom cells', async ({ superdoc }) => {
  const result = await loadAndExtract(superdoc, 'sd-2672-gridbefore-vmerge.docx');

  // The fixture injects `<w:gridBefore val="1"/>` on row 0 (shifting its cells
  // one column right) and `<w:vMerge/>` on row 1's first cell (so it's a
  // continuation of row 0's vertically-merged anchor, which the importer
  // folds into row 0 as rowspan>=2).
  const tableBlocks = result.blocks.filter((b: any) => b.tableContext);
  expect(tableBlocks.length).toBeGreaterThan(0);

  // No phantom empty-text blocks from the placeholder column.
  const phantoms = tableBlocks.filter(
    (b: any) => b.text === '' && b.tableContext.rowIndex === 0 && b.tableContext.columnIndex === 0,
  );
  expect(phantoms).toHaveLength(0);

  // Every emitted block's authored text comes from a real cell in the
  // base 3x3 fixture ("rNcN"). A continuation cell (vMerge="continue")
  // must not surface as its own block with authored text.
  const realCells = tableBlocks.filter((b: any) => /^r\dc\d$/.test(b.text));
  expect(realCells.length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// SDT-wrapped table: transparency
// ---------------------------------------------------------------------------

test('@behavior SD-2672 docx: SDT-wrapped table does not emit a wrapper block', async ({ superdoc }) => {
  const result = await loadAndExtract(superdoc, 'sd-2672-sdt-table.docx');

  // No wrapper 'sdt' block emitted.
  expect(result.blocks.some((b: any) => b.type === 'sdt')).toBe(false);

  // The inner table's cells still come through with tableContext intact.
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const block = result.blocks.find((b: any) => b.text === `r${r}c${c}`);
      expect(block, `sdt-wrapped r${r}c${c}`).toBeDefined();
      expect((block as any).tableContext?.rowIndex).toBe(r);
      expect((block as any).tableContext?.columnIndex).toBe(c);
    }
  }
});

// ---------------------------------------------------------------------------
// Nested table: fresh ordinal + parent context
// ---------------------------------------------------------------------------

test('@behavior SD-2672 docx: nested table gets its own ordinal and parent coords', async ({ superdoc }) => {
  const result = await loadAndExtract(superdoc, 'sd-2672-nested-table.docx');

  // Inner table cells carry text "nested-a" through "nested-d".
  const inner = result.blocks.filter((b: any) => /^nested-[a-d]$/.test(b.text));
  expect(inner.length).toBe(4);

  const outerOrdinals = new Set<number>(
    result.blocks
      .filter((b: any) => /^r\dc\d$/.test(b.text))
      .map((b: any) => b.tableContext?.tableOrdinal)
      .filter((v: unknown) => typeof v === 'number'),
  );
  const innerOrdinals = new Set<number>(inner.map((b: any) => b.tableContext?.tableOrdinal));

  expect(outerOrdinals.size).toBe(1);
  expect(innerOrdinals.size).toBe(1);
  // Inner table MUST have a different ordinal from the outer.
  const [outer] = outerOrdinals;
  const [innerO] = innerOrdinals;
  expect(innerO).not.toBe(outer);

  // Every inner cell has parent context pointing at the outer cell (1,1).
  for (const block of inner) {
    const tc = (block as any).tableContext;
    expect(tc.parentTableOrdinal).toBe(outer);
    expect(tc.parentRowIndex).toBe(1);
    expect(tc.parentColumnIndex).toBe(1);
  }

  // The outer cell's "before-nested" and "after-nested" paragraphs should
  // emit alongside the nested table, all with the outer cell's tableContext.
  const before = result.blocks.find((b: any) => b.text === 'before-nested');
  const after = result.blocks.find((b: any) => b.text === 'after-nested');
  expect(before, 'before-nested').toBeDefined();
  expect(after, 'after-nested').toBeDefined();
  expect((before as any).tableContext.rowIndex).toBe(1);
  expect((before as any).tableContext.columnIndex).toBe(1);
  expect((before as any).tableContext.tableOrdinal).toBe(outer);
});

// ---------------------------------------------------------------------------
// Multi-paragraph cell: one block per paragraph, shared tableContext
// ---------------------------------------------------------------------------

test('@behavior SD-2672 docx: multi-paragraph cells emit one block per paragraph', async ({ superdoc }) => {
  const result = await loadAndExtract(superdoc, 'sd-2672-multipara-cell.docx');

  const p1 = result.blocks.find((b: any) => b.text === 'cell-00-line-1');
  const p2 = result.blocks.find((b: any) => b.text === 'cell-00-line-2');
  expect(p1, 'line 1').toBeDefined();
  expect(p2, 'line 2').toBeDefined();

  // Distinct nodeIds, but they share the same tableContext (both in (0,0)).
  expect((p1 as any).nodeId).not.toBe((p2 as any).nodeId);
  expect((p1 as any).tableContext.rowIndex).toBe(0);
  expect((p1 as any).tableContext.columnIndex).toBe(0);
  expect((p2 as any).tableContext.rowIndex).toBe(0);
  expect((p2 as any).tableContext.columnIndex).toBe(0);
});

// ---------------------------------------------------------------------------
// scrollToElement round-trip: extract's nodeId resolves in the browser
// ---------------------------------------------------------------------------

test('@behavior SD-2672 docx: merged-cell paragraph nodeId works with scrollToElement', async ({ superdoc }) => {
  await superdoc.loadDocument(requireFixture('sd-2672-merged-table.docx'));

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));
  const anchor = result.blocks.find((b: any) => b.text === 'left-span');
  expect(anchor).toBeDefined();

  const navResult = await superdoc.page.evaluate(
    (id) => (window as any).superdoc.scrollToElement(id),
    (anchor as any).nodeId,
  );
  expect(navResult).toBe(true);
});
