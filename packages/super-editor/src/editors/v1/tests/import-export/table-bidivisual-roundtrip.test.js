import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { initTestEditor, getTestDataAsFileBuffer } from '../helpers/helpers.js';

const TEST_DOC = 'table-width-issue.docx';

async function buildDocxWithBidiVisualTable() {
  const baseBuffer = await getTestDataAsFileBuffer(TEST_DOC);
  const zip = await JSZip.loadAsync(baseBuffer);
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) throw new Error('word/document.xml not found in fixture.');

  const documentXml = await documentEntry.async('string');
  const patchedDocumentXml = documentXml.replace(/<w:tblPr>/, '<w:tblPr><w:bidiVisual/>');

  if (patchedDocumentXml === documentXml) {
    throw new Error('Could not inject <w:bidiVisual/> into first table.');
  }

  zip.file('word/document.xml', patchedDocumentXml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('table bidiVisual import/export roundtrip', () => {
  it('preserves w:bidiVisual in word/document.xml on export', async () => {
    const patchedBuffer = await buildDocxWithBidiVisualTable();
    const inputFiles = await new DocxZipper().getDocxData(patchedBuffer, true);
    const inputDocument = inputFiles.find((entry) => entry.name === 'word/document.xml')?.content;
    expect(inputDocument).toContain('<w:bidiVisual');

    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(patchedBuffer, true);
    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const exportedFiles = await new DocxZipper().getDocxData(exportedBuffer, true);
    const exportedDocument = exportedFiles.find((entry) => entry.name === 'word/document.xml')?.content;

    expect(exportedDocument).toBeTruthy();
    expect(exportedDocument).toContain('<w:bidiVisual');

    editor.destroy();
  });
});
