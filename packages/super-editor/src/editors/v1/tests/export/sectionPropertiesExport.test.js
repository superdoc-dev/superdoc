import { beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';

const FILENAME = 'missing-sectpr.docx';

describe('section properties export', () => {
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(FILENAME));
  });

  it('adds default body-level sectPr when missing in the source document', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });
      expect(updatedDocs).toHaveProperty('word/document.xml');
      const exportedDocXml = parseXmlToJson(updatedDocs['word/document.xml']);
      const documentElement = exportedDocXml?.elements?.find((el) => el.name === 'w:document');
      const body = documentElement?.elements?.find((el) => el.name === 'w:body');
      const sectPr = body?.elements?.find((el) => el.name === 'w:sectPr');
      expect(sectPr).toBeDefined();

      const pgSz = sectPr.elements?.find((el) => el.name === 'w:pgSz');
      expect(pgSz?.attributes?.['w:w']).toBeDefined();
      expect(pgSz?.attributes?.['w:h']).toBeDefined();

      const pgMar = sectPr.elements?.find((el) => el.name === 'w:pgMar');
      expect(pgMar?.attributes?.['w:top']).toBeDefined();
      expect(pgMar?.attributes?.['w:bottom']).toBeDefined();
      expect(pgMar?.attributes?.['w:left']).toBeDefined();
      expect(pgMar?.attributes?.['w:right']).toBeDefined();

      const zipped = await editor.exportDocx();
      const zipper = new DocxZipper();
      const zip = await zipper.unzip(zipped);
      const documentXml = await zip.file('word/document.xml').async('string');
      const contentTypes = await zip.file('[Content_Types].xml').async('string');
      const referencesHeader = documentXml.includes('w:headerReference');
      const referencesFooter = documentXml.includes('w:footerReference');
      if (referencesHeader) expect(contentTypes).toContain('/word/header1.xml');
      if (referencesFooter) expect(contentTypes).toContain('/word/footer1.xml');
    } finally {
      editor.destroy();
    }
  });
});
