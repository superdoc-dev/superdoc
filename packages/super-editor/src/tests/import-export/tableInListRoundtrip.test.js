import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'path';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor } from '../helpers/helpers.js';
import { loadUnpackedDocx } from '../helpers/loadUnpackedDocx.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const findFirst = (elements = [], name) => elements.find((element) => element.name === name);
const collectRunsWithBreak = (paragraph) => {
  if (!paragraph?.elements) return [];
  return paragraph.elements.filter(
    (element) => element.name === 'w:r' && element.elements?.some((child) => child.name === 'w:br'),
  );
};
const findFirstTableCellParagraph = (table) => {
  const firstRow = table?.elements?.find((el) => el.name === 'w:tr');
  const firstCell = firstRow?.elements?.find((el) => el.name === 'w:tc');
  return firstCell?.elements?.find((el) => el.name === 'w:p');
};

describe('table_in_list roundtrip', () => {
  it('exports list/table structure with expected spacing and cell indent', async () => {
    const folderPath = join(__dirname, '../data/table_in_list');
    const [docx, media, mediaFiles, fonts] = await loadUnpackedDocx(folderPath);
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    expect(exportedBuffer?.byteLength || exportedBuffer?.length || 0).toBeGreaterThan(0);

    const zipper = new DocxZipper();
    const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
    const documentXmlEntry = exportedFiles.find((entry) => entry.name === 'word/document.xml');
    expect(documentXmlEntry).toBeDefined();

    const documentJson = parseXmlToJson(documentXmlEntry.content);
    const documentNode = findFirst(documentJson.elements, 'w:document');
    const body = findFirst(documentNode?.elements, 'w:body');
    expect(body).toBeDefined();

    const firstParagraph = findFirst(body?.elements, 'w:p');
    expect(firstParagraph).toBeDefined();
    const runsWithBreak = collectRunsWithBreak(firstParagraph);
    expect(runsWithBreak.length).toBe(1);

    const firstTable = findFirst(body?.elements, 'w:tbl');
    expect(firstTable).toBeDefined();

    const tableCellParagraph = findFirstTableCellParagraph(firstTable);
    expect(tableCellParagraph).toBeDefined();

    const cellPPr = tableCellParagraph.elements?.find((el) => el.name === 'w:pPr');
    const indent = cellPPr?.elements?.find((el) => el.name === 'w:ind');
    expect(indent?.attributes?.['w:left']).toBeDefined();
    expect(Number(indent?.attributes?.['w:left'])).toBe(0);

    editor.destroy();
  });
});
