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

// Regression coverage for SD-2534: in the collab-joiner path, the original
// bodyNode sectPr can be stale (missing first-page header/footer references
// added during collaboration). converter.bodySectPr holds the live version
// and must take precedence over bodyNode.sectPr when present.
describe('section properties export — bodySectPr precedence', () => {
  it('uses converter.bodySectPr over the body node sectPr when both are present', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('basic-paragraph.docx');
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      // Simulate the collab-hydrated state: live sectPr carries a marker the
      // body node does not. If the export uses the body node sectPr instead,
      // this marker will be missing from the output.
      editor.converter.bodySectPr = {
        type: 'element',
        name: 'w:sectPr',
        attributes: { 'w:rsidR': 'LIVESECTPR' },
        elements: [
          { type: 'element', name: 'w:pgSz', attributes: { 'w:w': '12240', 'w:h': '15840' } },
          {
            type: 'element',
            name: 'w:pgMar',
            attributes: { 'w:top': '1440', 'w:right': '1440', 'w:bottom': '1440', 'w:left': '1440' },
          },
          { type: 'element', name: 'w:titlePg' },
        ],
      };

      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });
      const documentXml = updatedDocs['word/document.xml'];
      expect(documentXml).toContain('LIVESECTPR');
      expect(documentXml).toContain('w:titlePg');
    } finally {
      editor.destroy();
    }
  });

  it('falls back to body node sectPr when converter.bodySectPr is null', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('basic-paragraph.docx');
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      editor.converter.bodySectPr = null;

      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });
      const exportedDocXml = parseXmlToJson(updatedDocs['word/document.xml']);
      const body = exportedDocXml?.elements?.[0]?.elements?.find((el) => el.name === 'w:body');
      const sectPr = body?.elements?.find((el) => el.name === 'w:sectPr');
      expect(sectPr).toBeDefined();
      // The body node sectPr (or default) should still produce a valid sectPr.
      const pgSz = sectPr.elements?.find((el) => el.name === 'w:pgSz');
      expect(pgSz).toBeDefined();
    } finally {
      editor.destroy();
    }
  });

  it('treats non-object converter.bodySectPr as missing', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('basic-paragraph.docx');
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      // typeof check guards against truthy non-objects
      editor.converter.bodySectPr = 'not-an-object';

      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });
      const documentXml = updatedDocs['word/document.xml'];
      // Should not crash and should not include the bogus value
      expect(documentXml).not.toContain('not-an-object');
    } finally {
      editor.destroy();
    }
  });
});
