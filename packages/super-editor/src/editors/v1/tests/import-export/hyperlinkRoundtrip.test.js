import { describe, it, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '../helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { Editor } from '@core/Editor.js';

const collectHyperlinks = (body) => {
  if (!body?.elements) return [];
  const hyperlinks = [];
  body.elements.forEach((paragraph) => {
    if (!paragraph?.elements) return;
    paragraph.elements.forEach((child) => {
      if (child?.name === 'w:hyperlink') hyperlinks.push(child);
    });
  });
  return hyperlinks;
};

describe('hyperlink-exported.docx round trip', () => {
  it('re-exports as a Word-compatible DOCX with intact hyperlinks', async () => {
    const fileName = 'hyperlink-exported.docx';
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(fileName);
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const byteLength = exportedBuffer?.byteLength ?? exportedBuffer?.length ?? 0;
    expect(byteLength).toBeGreaterThan(0);

    const zipper = new DocxZipper();
    const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
    const documentXmlEntry = exportedFiles.find((entry) => entry.name === 'word/document.xml');
    expect(documentXmlEntry).toBeDefined();

    const documentJson = parseXmlToJson(documentXmlEntry.content);
    const documentNode = documentJson.elements?.find((el) => el.name === 'w:document');
    const body = documentNode?.elements?.find((el) => el.name === 'w:body');
    expect(body).toBeDefined();

    const hyperlinks = collectHyperlinks(body);
    expect(hyperlinks.length).toBeGreaterThan(0);

    const [roundTripFiles] = await Editor.loadXmlData(exportedBuffer, true);
    const roundTripDocEntry = roundTripFiles.find((entry) => entry.name === 'word/document.xml');
    expect(roundTripDocEntry).toBeDefined();

    editor.destroy();
  });
});
