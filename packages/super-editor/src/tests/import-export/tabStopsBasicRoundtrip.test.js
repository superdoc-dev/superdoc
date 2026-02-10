import { describe, it, expect } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor } from '../helpers/helpers.js';
import { loadUnpackedDocx } from '../helpers/loadUnpackedDocx.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const findParagraph = (elements, index) => {
  let count = -1;
  for (const element of elements) {
    if (element.name === 'w:p') count += 1;
    if (count === index) return element;
  }
  return null;
};

describe('tab_stops_basic_test roundtrip', () => {
  it('exports custom tab stops as left/right aligned tabs', async () => {
    const [docx, media, mediaFiles, fonts] = await loadUnpackedDocx(join(__dirname, '../data/tab_stops_basic_test'));
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    expect(exportedBuffer?.byteLength || exportedBuffer?.length || 0).toBeGreaterThan(0);

    const zipper = new DocxZipper();
    const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
    const documentXmlEntry = exportedFiles.find((entry) => entry.name === 'word/document.xml');
    expect(documentXmlEntry).toBeDefined();

    const documentJson = parseXmlToJson(documentXmlEntry.content);
    const documentNode = documentJson.elements.find((el) => el.name === 'w:document');
    const body = documentNode?.elements?.find((el) => el.name === 'w:body');
    expect(body).toBeDefined();

    // Paragraph index 3 contains left tab stops at 2.5" and 3"
    const thirdParagraph = findParagraph(body.elements || [], 3);
    expect(thirdParagraph).toBeDefined();
    const thirdPr = thirdParagraph.elements?.find((el) => el.name === 'w:pPr');
    const thirdTabs = thirdPr?.elements?.find((el) => el.name === 'w:tabs');
    expect(thirdTabs?.elements?.length).toBe(1);
    const [firstTab] = thirdTabs.elements;
    expect(firstTab.attributes['w:val']).toBe('left');
    expect(firstTab.attributes['w:pos']).toBe('4320');

    // Paragraph index 5 contains another left-aligned stop custom 5"
    const fifthParagraph = findParagraph(body.elements || [], 5);
    expect(fifthParagraph).toBeDefined();
    const fifthPr = fifthParagraph.elements?.find((el) => el.name === 'w:pPr');
    const fifthTabs = fifthPr?.elements?.find((el) => el.name === 'w:tabs');
    expect(fifthTabs?.elements?.length).toBe(1);
    const [secondTab] = fifthTabs.elements;
    expect(secondTab.attributes['w:val']).toBe('left');
    expect(secondTab.attributes['w:pos']).toBe('5760');

    editor.destroy();
  });
});
