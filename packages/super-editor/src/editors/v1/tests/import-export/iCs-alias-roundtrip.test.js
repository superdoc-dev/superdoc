/**
 * Roundtrip test: a run with <w:iCs/> on import should round-trip cleanly
 * through the document-api iCs alias, which maps to PM attr `italicCs`.
 * Confirms <w:iCs/> survives import -> export, and that the imported value
 * is reachable on the PM run mark via either `italicCs` or `iCs`.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { initTestEditor, getTestDataAsFileBuffer } from '../helpers/helpers.js';

const TEST_DOC = 'instrtext-angled-brackets-bug.docx';

const DOCUMENT_XML_WITH_ICS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:iCs/></w:rPr>
        <w:t>run with iCs only</w:t>
      </w:r>
      <w:r>
        <w:rPr><w:i/><w:iCs/></w:rPr>
        <w:t>run with both i and iCs</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

async function buildIcsDocx() {
  const baseBuffer = await getTestDataAsFileBuffer(TEST_DOC);
  const zip = await JSZip.loadAsync(baseBuffer);
  zip.file('word/document.xml', DOCUMENT_XML_WITH_ICS);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('iCs alias import/export roundtrip', () => {
  it('preserves <w:iCs/> through import → export', async () => {
    const buffer = await buildIcsDocx();

    const inputFiles = await new DocxZipper().getDocxData(buffer, true);
    const inputDoc = inputFiles.find((entry) => entry.name === 'word/document.xml')?.content;
    expect(inputDoc).toContain('<w:iCs/>');

    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const exportedFiles = await new DocxZipper().getDocxData(exportedBuffer, true);
    const exportedDoc = exportedFiles.find((entry) => entry.name === 'word/document.xml')?.content;

    expect(exportedDoc).toBeTruthy();
    // Both runs originally had <w:iCs/>; both should retain it on export.
    const iCsCount = (exportedDoc.match(/<w:iCs[\s/]/g) || []).length;
    expect(
      iCsCount,
      `expected at least 2 <w:iCs/> elements; exported XML: ${exportedDoc.slice(0, 1500)}`,
    ).toBeGreaterThanOrEqual(2);

    editor.destroy();
  });

  it('exposes the imported iCs as italicCs on the PM run mark (the alias direction)', async () => {
    const buffer = await buildIcsDocx();
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    // Walk the doc and find runs with italicCs on their text marks
    let foundItalicCsMark = false;
    let foundICsAttr = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name !== 'run') return;
      const runProps = node.attrs?.runProperties;
      if (runProps?.italicCs === true) foundItalicCsMark = true;
      if (runProps?.iCs === true) foundICsAttr = true;
    });

    // The new translator stores under `italicCs`. The compatibility shim in r-translator
    // also treats `iCs` as a valid input on export. Either being present is acceptable
    // for the import path; the important thing is downstream code can read the value.
    expect(foundItalicCsMark || foundICsAttr, 'imported run should have italicCs or iCs on its PM run-properties').toBe(
      true,
    );

    editor.destroy();
  });
});
