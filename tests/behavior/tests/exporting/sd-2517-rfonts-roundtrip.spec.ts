import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/sd-2517-localized-heading-styles.docx');

test.use({ config: { toolbar: 'none' } });

/**
 * SD-2517: Zero-edit round-trip must not inject w:rFonts into heading runs.
 *
 * The reproduction document uses localized Portuguese heading styles (Ttulo1,
 * Ttulo2) with per-script fonts (ascii=Arial, cs=Times New Roman). Heading
 * runs have no inline w:rPr — they inherit from the paragraph style.
 *
 * Before the fix, the round-trip injected 197 extra w:rFonts elements.
 */
test('@behavior SD-2517: zero-edit round-trip does not inject w:rFonts into heading runs', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // Count rFonts in the INPUT document
  const inputZip = await JSZip.loadAsync(fs.readFileSync(DOC_PATH));
  const inputDocXml = await inputZip.file('word/document.xml')!.async('string');
  const inputRFonts = (inputDocXml.match(/<w:rFonts/g) || []).length;

  // Export without making any edits
  const bytes: number[] = await superdoc.page.evaluate(async () => {
    const blob: Blob = await (window as any).editor.exportDocx();
    const buffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  });

  // Parse the exported DOCX
  const outputZip = await JSZip.loadAsync(Buffer.from(bytes));
  const outputDocXml = await outputZip.file('word/document.xml')!.async('string');
  const outputRFonts = (outputDocXml.match(/<w:rFonts/g) || []).length;

  // The output should not have significantly more rFonts than the input.
  // A small delta (±10) is acceptable from per-script font encoding, but
  // the 197-injection regression must not recur.
  const delta = outputRFonts - inputRFonts;
  expect(delta).toBeLessThan(10);
  expect(delta).toBeGreaterThan(-20);
});
