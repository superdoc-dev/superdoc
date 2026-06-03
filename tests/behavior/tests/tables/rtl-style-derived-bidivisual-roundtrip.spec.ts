import fs from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({ config: { toolbar: 'full', showSelection: true } });

// SD-3171 round-trip guard: the production fix narrows what visualDirection
// consults to inline-only, but says nothing about whether the importer/
// exporter still preserves a style-cascade `w:bidiVisual` in the exported XML.
// A future commit that "cleans up" the unused property could silently strip it
// from the style definition; renders would still pass (because we no longer
// read it), but round-trip integrity would be gone and a Word user opening the
// re-exported file would lose the property.
//
// This test pins both halves of the contract:
//   1. Re-importing the exported file still renders A B C (the fix holds).
//   2. The exported XML still contains a `w:bidiVisual` element somewhere in
//      the style or document parts (the property survives export).

async function readCellLayout(superdoc: SuperDocFixture): Promise<Array<{ text: string; relLeft: number }> | null> {
  return superdoc.page.evaluate(() => {
    const fragment = document.querySelector('.superdoc-table-fragment');
    if (!fragment) return null;
    const fragRect = fragment.getBoundingClientRect();
    const cells = Array.from(fragment.children).filter((el) => (el as HTMLElement).style?.position === 'absolute');
    if (cells.length === 0) return null;
    return cells
      .map((cell) => {
        const rect = (cell as HTMLElement).getBoundingClientRect();
        return { text: (cell.textContent ?? '').trim(), relLeft: rect.left - fragRect.left };
      })
      .filter((c) => c.text === 'A' || c.text === 'B' || c.text === 'C')
      .sort((a, b) => a.relLeft - b.relLeft);
  });
}

async function exportCurrentDocument(superdoc: SuperDocFixture, outputPath: string): Promise<void> {
  const exportedBytes = await superdoc.page.evaluate(async () => {
    const exported = await (window as any).editor.exportDocx({ isFinalDoc: false });
    if (exported instanceof Blob) {
      return Array.from(new Uint8Array(await exported.arrayBuffer()));
    }
    if (exported instanceof ArrayBuffer) {
      return Array.from(new Uint8Array(exported));
    }
    if (ArrayBuffer.isView(exported)) {
      return Array.from(new Uint8Array(exported.buffer, exported.byteOffset, exported.byteLength));
    }
    throw new Error(`Unexpected exportDocx() result: ${Object.prototype.toString.call(exported)}`);
  });
  await writeFile(outputPath, Buffer.from(exportedBytes));
}

/**
 * Return the `w:bidiVisual` element (if any) inside the `<w:tblPr>` of the
 * named style in `word/styles.xml`, plus whether it resolves to a truthy
 * OOXML boolean per §17.17.4 (missing `w:val` attribute, or `w:val` in
 * {"1","true","on"} case-insensitive).
 *
 * Scoping to a specific styleId is what distinguishes "style cascade
 * preserved" from "any bidiVisual present anywhere" — the latter would also
 * pass if export stripped the style value and emitted an explicit-false
 * inline element instead.
 */
async function readStyleBidiVisual(
  docxPath: string,
  styleId: string,
): Promise<{ found: boolean; truthy: boolean; raw: string | null }> {
  const zip = await JSZip.loadAsync(await readFile(docxPath));
  const stylesXml = (await zip.file('word/styles.xml')?.async('string')) ?? '';
  const styleStart = stylesXml.indexOf(`w:styleId="${styleId}"`);
  if (styleStart < 0) return { found: false, truthy: false, raw: null };
  const styleEnd = stylesXml.indexOf('</w:style>', styleStart);
  const block = stylesXml.slice(styleStart, styleEnd >= 0 ? styleEnd : undefined);
  const match = block.match(/<w:bidiVisual\b([^/>]*)\/?>/);
  if (!match) return { found: false, truthy: false, raw: null };
  const attrs = match[1] ?? '';
  const valMatch = attrs.match(/\bw:val="([^"]*)"/);
  const val = valMatch ? valMatch[1].toLowerCase() : null;
  const truthy = val === null || val === '1' || val === 'true' || val === 'on';
  return { found: true, truthy, raw: match[0] };
}

test('style-cascade bidiVisual survives DOCX export and continues to render in logical order', async ({
  superdoc,
}, testInfo) => {
  const fixturePath = path.resolve(__dirname, 'fixtures/rtl-style-derived-bidivisual.docx');
  expect(fs.existsSync(fixturePath)).toBe(true);

  await superdoc.loadDocument(fixturePath);
  await superdoc.waitForStable();

  const originalLayout = await readCellLayout(superdoc);
  expect(originalLayout).not.toBeNull();
  expect(originalLayout!.map((c) => c.text)).toEqual(['A', 'B', 'C']);

  const exportedPath = testInfo.outputPath('rtl-style-derived-bidivisual-roundtrip.docx');
  await exportCurrentDocument(superdoc, exportedPath);

  // The exported file must still carry `w:bidiVisual` as a truthy property on
  // the same style entry it came in on (`RtlStyleTable`). Scoping to the
  // specific style — and validating the boolean per §17.17.4 — prevents a
  // regression where export strips the style value and emits an explicit
  // `<w:bidiVisual w:val="0"/>` inline; the re-import would still render
  // A B C (explicit-false produces no flip) and a substring check would still
  // pass, but the property would no longer be preserved for a Word consumer.
  const styleBidi = await readStyleBidiVisual(exportedPath, 'RtlStyleTable');
  expect(styleBidi.found).toBe(true);
  expect(styleBidi.truthy).toBe(true);

  await superdoc.loadDocument(exportedPath);
  await superdoc.waitForStable();

  const roundTrippedLayout = await readCellLayout(superdoc);
  expect(roundTrippedLayout).not.toBeNull();
  // The Word-parity contract must hold on re-import: style-cascade bidiVisual
  // does NOT visually flip cells. A regression here would mean the fix
  // accidentally promoted the style cascade through export (e.g., baked it
  // into the table's inline tblPr) and the flip came back.
  expect(roundTrippedLayout!.map((c) => c.text)).toEqual(['A', 'B', 'C']);
});
