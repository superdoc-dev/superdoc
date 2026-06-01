import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/sd-2647-smarttag-roundtrip.docx');

test.use({ config: { toolbar: 'none' } });

/**
 * SD-2647: Word-authored content wrapped in <w:smartTag> must render visibly
 * and round-trip back to the same OOXML on zero-edit export.
 *
 * Fixture is a sanitized subset of the IT-945 customer file (USPTO IDS
 * instructions): a short paragraph carrying <w:smartTagPr> + the first six
 * rows of the WIPO ST.3 country-region table where each country name is
 * wrapped in <w:smartTag w:element="country-region">.
 *
 * Fixture was produced by OOXML surgery on the customer .docx, NOT by
 * routing through SuperDoc's own save path - laundering the input through
 * the implementation under test would defeat the round-trip assertion.
 */
test('@behavior SD-2647: w:smartTag content renders and round-trips through zero-edit export', async ({ superdoc }) => {
  // Sanity: input fixture already carries the constructs we are about to assert.
  const inputZip = await JSZip.loadAsync(fs.readFileSync(DOC_PATH));
  const inputXml = await inputZip.file('word/document.xml')!.async('string');
  expect(inputXml).toMatch(/<w:tc\b/);
  expect(inputXml).toMatch(/<w:smartTag\b/);
  expect(inputXml).toMatch(/w:element="country-region"/);
  expect(inputXml).toMatch(/<w:smartTagPr\b/);

  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // Render assertion: country names wrapped in <w:smartTag> are visible in the
  // body text. Before SD-2647 these fell into hidden passthroughInline spans
  // and disappeared.
  const bodyText: string = await superdoc.page.evaluate(() => document.body.innerText);
  expect(bodyText).toMatch(/AFGHANISTAN/);
  expect(bodyText).toMatch(/ALBANIA/);
  expect(bodyText).toMatch(/ALGERIA/);

  // Zero-edit export.
  const bytes: number[] = await superdoc.page.evaluate(async () => {
    const blob: Blob = await (window as any).editor.exportDocx();
    const buffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  });

  const outZip = await JSZip.loadAsync(Buffer.from(bytes));
  const outXml = await outZip.file('word/document.xml')!.async('string');

  // Export assertion 1: w:smartTag wrappers survive with their w:element value
  // and at least one country-region instance is present in the output.
  expect(outXml).toMatch(/<w:smartTag\b/);
  expect(outXml).toMatch(/w:element="country-region"/);

  // Export assertion 2: smartTag-wrapped country text round-trips. We assert
  // on AFGHANISTAN specifically as the first WIPO ST.3 entry.
  expect(outXml).toMatch(/AFGHANISTAN/);

  // Export assertion 3: <w:smartTagPr> property metadata is preserved on
  // export, not silently dropped (the round-trip half of SD-2647 + the SDT
  // flatten fix in convertSdtContentToRuns).
  expect(outXml).toMatch(/<w:smartTagPr\b/);
});
