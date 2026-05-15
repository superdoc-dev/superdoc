import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../tables/fixtures/sd-3152-tcmar-key-family.docx');

test.use({ config: { toolbar: 'none' } });

// SD-3152: zero-edit round-trip must preserve w:tcMar key family per side.
// Fixture has cell 1 with logical-only tcMar (w:start, w:end) and cell 2
// with physical-only tcMar (w:left, w:right). Before the fix, export merged
// physical attrs.cellMargins into tableCellProperties.cellMargins without
// reconciling the imported pair, so cell 1's exported tcMar gained
// duplicate w:left and w:right alongside the original w:start and w:end.
test('@behavior SD-3152: zero-edit round-trip preserves tcMar logical vs physical key family per side', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const bytes: number[] = await superdoc.page.evaluate(async () => {
    const blob: Blob = await (window as any).editor.exportDocx();
    const buffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  });

  const outZip = await JSZip.loadAsync(Buffer.from(bytes));
  const outXml = await outZip.file('word/document.xml')!.async('string');

  // Pull every <w:tcMar>...</w:tcMar> in document order.
  const tcMarBlocks = Array.from(outXml.matchAll(/<w:tcMar\b[^>]*>([\s\S]*?)<\/w:tcMar>/g)).map((m) => m[1]);
  expect(tcMarBlocks).toHaveLength(2);

  const childNames = (inner: string) =>
    Array.from(inner.matchAll(/<w:(top|start|left|bottom|end|right)\b/g)).map((m) => `w:${m[1]}`);

  const cell1Children = childNames(tcMarBlocks[0]);
  const cell2Children = childNames(tcMarBlocks[1]);

  // Cell 1 source had logical-only: export must stay logical-only AND in CT_TcMar sequence order.
  expect(cell1Children).toEqual(['w:top', 'w:start', 'w:bottom', 'w:end']);

  // Cell 2 source had physical-only: export must stay physical-only AND in CT_TcMar sequence order.
  expect(cell2Children).toEqual(['w:top', 'w:left', 'w:bottom', 'w:right']);

  // No cell may mix start+left or end+right in a single tcMar.
  for (const inner of tcMarBlocks) {
    const hasStart = /<w:start\b/.test(inner);
    const hasLeft = /<w:left\b/.test(inner);
    const hasEnd = /<w:end\b/.test(inner);
    const hasRight = /<w:right\b/.test(inner);
    expect(hasStart && hasLeft).toBe(false);
    expect(hasEnd && hasRight).toBe(false);
  }

  // tblCellMar (whether under tblPr §17.4.42 or tblPrEx §17.4.41) must be
  // logical-only and in CT_TblCellMar sequence order on export. If it isn't
  // re-emitted at all on export (e.g. SuperDoc drops it because cells already
  // override with inline tcMar), that's also acceptable here — the SD-3152
  // surface is tcMar key-family preservation; tblCellMar key-family is
  // covered by the unit fixture test. Whenever it IS emitted, the children
  // must be schema-ordered.
  const tblCellMarMatches = Array.from(outXml.matchAll(/<w:tblCellMar\b[^>]*>([\s\S]*?)<\/w:tblCellMar>/g)).map(
    (m) => m[1],
  );
  for (const inner of tblCellMarMatches) {
    const children = childNames(inner);
    const order = ['w:top', 'w:start', 'w:left', 'w:bottom', 'w:end', 'w:right'];
    const present = order.filter((n) => children.includes(n));
    expect(children).toEqual(present);
    expect(/<w:start\b/.test(inner) && /<w:left\b/.test(inner)).toBe(false);
    expect(/<w:end\b/.test(inner) && /<w:right\b/.test(inner)).toBe(false);
  }
});
