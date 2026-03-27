import { describe, it, expect } from 'vitest';
import { getTestDataByFileName, loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { getExportedResult } from '@tests/export/export-helpers/index.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import DocxZipper from '@core/DocxZipper.js';

// Fixture captures a document whose grid widths previously collapsed after export/import.
const TEST_DOC = 'table-width-issue.docx';

const findFirstTable = (documentXml) => {
  const document =
    documentXml?.name === 'w:document' ? documentXml : documentXml?.elements?.find((el) => el.name === 'w:document');
  const body = document?.elements?.find((el) => el.name === 'w:body');
  return body?.elements?.find((el) => el.name === 'w:tbl') ?? null;
};

const getGridColumns = (tbl) => {
  const tblGrid = tbl?.elements?.find((el) => el.name === 'w:tblGrid');
  if (!tblGrid?.elements) return [];
  return tblGrid.elements
    .filter((el) => el.name === 'w:gridCol')
    .map((el) => Number(el.attributes?.['w:w']))
    .filter((value) => Number.isFinite(value));
};

const getRowCellWidths = (tbl) => {
  const rows = tbl?.elements?.filter((el) => el.name === 'w:tr') ?? [];
  return rows.map((row) => {
    const cells = row.elements?.filter((el) => el.name === 'w:tc') ?? [];
    return cells.map((cell) => {
      const tcPr = cell.elements?.find((el) => el.name === 'w:tcPr');
      const widthNode = tcPr?.elements?.find((el) => el.name === 'w:tcW');
      const rawWidth = widthNode?.attributes?.['w:w'];
      return Number(rawWidth);
    });
  });
};

// Small tolerance accounts for rounding the OOXML width units during translation.
const expectWidthsClose = (actual, expected, tolerance = 1) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((row, rowIndex) => {
    const expectedRow = expected[rowIndex];
    expect(row).toHaveLength(expectedRow.length);
    row.forEach((value, colIndex) => {
      const expectedValue = expectedRow[colIndex];
      expect(Math.abs(value - expectedValue)).toBeLessThanOrEqual(tolerance);
    });
  });
};

describe('table-width-issue round-trip', () => {
  it('preserves grid and cell widths after export', async () => {
    const originalDocx = await getTestDataByFileName(TEST_DOC);
    const exportedDocx = await getExportedResult(TEST_DOC);

    const originalTable = findFirstTable(originalDocx['word/document.xml']);
    const exportedTable = findFirstTable(exportedDocx);

    expect(exportedTable).toBeDefined();
    expect(originalTable).toBeDefined();

    const originalGrid = getGridColumns(originalTable);
    const exportedGrid = getGridColumns(exportedTable);
    expect(exportedGrid).toEqual(originalGrid);

    const originalWidths = getRowCellWidths(originalTable);
    const exportedWidths = getRowCellWidths(exportedTable);
    expectWidthsClose(exportedWidths, originalWidths);

    // Validate both the XML-only export and the zipped DOCX match the original grid measurements.
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(TEST_DOC);
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
    try {
      const exportedXmlString = await editor.exportDocx({ exportXmlOnly: true });
      const exportedXmlJson = parseXmlToJson(exportedXmlString);
      const exportedXmlTable = findFirstTable(exportedXmlJson);
      expect(exportedXmlTable).toBeDefined();
      const exportedXmlWidths = getRowCellWidths(exportedXmlTable);
      expectWidthsClose(exportedXmlWidths, originalWidths);

      const exportedDocxBuffer = await editor.exportDocx();
      // The on-disk DOCX (ZIP) path historically diverged from the XML-only export, so verify it explicitly.
      const nodeBuffer =
        exportedDocxBuffer instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(exportedDocxBuffer))
          : Buffer.from(exportedDocxBuffer);

      const zipper = new DocxZipper();
      const zipEntries = await zipper.getDocxData(nodeBuffer, true);
      const documentEntry = zipEntries.find((entry) => entry.name === 'word/document.xml');
      expect(documentEntry).toBeDefined();

      const zippedDocumentXml = parseXmlToJson(documentEntry.content);
      const zippedTable = findFirstTable(zippedDocumentXml);
      expect(zippedTable).toBeDefined();

      const zippedGrid = getGridColumns(zippedTable);
      expect(zippedGrid).toEqual(originalGrid);

      const zippedWidths = getRowCellWidths(zippedTable);
      expectWidthsClose(zippedWidths, originalWidths);
    } finally {
      editor.destroy();
    }
  });
});
