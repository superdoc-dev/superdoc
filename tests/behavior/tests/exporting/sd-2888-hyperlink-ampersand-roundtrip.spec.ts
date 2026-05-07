import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/sd-2888-hyperlink-with-ampersand.docx');

/**
 * SD-2888: A Word-authored .docx whose rels file has a hyperlink Target with
 * `&amp;` must export without losing the entity. xml-js's `xml2js` decodes
 * `&amp;` to `&` and `js2xml` did not re-escape it, so the export path that
 * rewrote the rels file (via reconcileDocumentRelationships) emitted a bare
 * `&`. Word treated the result as "unreadable content" and applied default
 * formatting during repair.
 */
test('@behavior SD-2888: Word-authored hyperlink with `&` in URL survives zero-edit export', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // Sanity: input rels has `&amp;` already (Word emits it correctly).
  const inputZip = await JSZip.loadAsync(fs.readFileSync(DOC_PATH));
  const inputRels = await inputZip.file('word/_rels/document.xml.rels')!.async('string');
  expect(inputRels).toMatch(/Target="[^"]*&amp;[^"]*"/);

  // Zero-edit export.
  const bytes: number[] = await superdoc.page.evaluate(async () => {
    const blob: Blob = await (window as any).editor.exportDocx();
    const buffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  });

  const outputZip = await JSZip.loadAsync(Buffer.from(bytes));
  const outputRels = await outputZip.file('word/_rels/document.xml.rels')!.async('string');

  // The hyperlink Target must still escape `&` as `&amp;`.
  expect(outputRels).toMatch(/Target="[^"]*&amp;[^"]*"/);

  // No bare `&` inside any attribute value (would break Word).
  expect(outputRels).not.toMatch(/="[^"]*&[^a-z#][^"]*"/);

  // The rels file must still parse as well-formed XML.
  await superdoc.page.evaluate((xml: string) => {
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    const error = parsed.querySelector('parsererror');
    if (error) throw new Error(`rels XML is malformed: ${error.textContent}`);
  }, outputRels);
});
