import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor, getTestDataAsFileBuffer } from '../helpers/helpers.js';

const TEST_DOC = 'blank-doc.docx';

async function buildDocxWithDocumentBackground() {
  const baseBuffer = await getTestDataAsFileBuffer(TEST_DOC);
  const zip = await JSZip.loadAsync(baseBuffer);
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) throw new Error('word/document.xml not found in fixture.');

  const documentXml = await documentEntry.async('string');
  const patchedDocumentXml = documentXml.replace(
    /<w:body>/,
    '<w:background w:color="EEEEEE" w:themeColor="accent3"/><w:body>',
  );
  zip.file('word/document.xml', patchedDocumentXml);

  return zip.generateAsync({ type: 'nodebuffer' });
}

function getDocumentBackground(xml) {
  const documentJson = parseXmlToJson(xml);
  const documentNode = documentJson?.elements?.find((el) => el?.name === 'w:document');
  return documentNode?.elements?.find((el) => el?.name === 'w:background') ?? null;
}

describe('document background roundtrip', () => {
  it('preserves imported w:background metadata on export', async () => {
    const patchedBuffer = await buildDocxWithDocumentBackground();
    const inputFiles = await new DocxZipper().getDocxData(patchedBuffer, true);
    const inputDocument = inputFiles.find((entry) => entry.name === 'word/document.xml')?.content;

    expect(inputDocument).toBeTruthy();
    expect(getDocumentBackground(inputDocument)?.attributes).toMatchObject({
      'w:color': 'EEEEEE',
      'w:themeColor': 'accent3',
    });

    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(patchedBuffer, true);
    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    try {
      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });
      expect(getDocumentBackground(updatedDocs['word/document.xml'])?.attributes).toMatchObject({
        'w:color': 'EEEEEE',
        'w:themeColor': 'accent3',
      });

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const zipper = new DocxZipper();
      const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
      const exportedDocument = exportedFiles.find((entry) => entry.name === 'word/document.xml')?.content;

      expect(exportedDocument).toBeTruthy();
      expect(getDocumentBackground(exportedDocument)?.attributes).toMatchObject({
        'w:color': 'EEEEEE',
        'w:themeColor': 'accent3',
      });
    } finally {
      editor.destroy();
    }
  });
});
