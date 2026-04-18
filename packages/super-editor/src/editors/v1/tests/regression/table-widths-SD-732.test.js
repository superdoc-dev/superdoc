import { describe, it, expect } from 'vitest';
import { getTestDataByFileName } from '@tests/helpers/helpers.js';
import { getExportedResult } from '@tests/export/export-helpers/index.js';
import { getTextFromNode } from '../export/export-helpers';

// Fixture captures a document with various fixed and relative table widths
const TEST_DOC = 'table-widths-SD-732.docx';

/**
 * Find a table in the document by the text of the heading preceding it.
 */
const findTable = (documentXml, heading) => {
  const document =
    documentXml.name === 'w:document' ? documentXml : documentXml.elements.find((el) => el.name === 'w:document');
  const body = document.elements.find((el) => el.name === 'w:body');

  const matchingParagraphs = body.elements.filter((el) => el.name === 'w:p' && getTextFromNode(el)?.includes(heading));
  if (matchingParagraphs.length === 0) {
    throw new Error(`Can't find heading in document: ${heading}`);
  }
  if (matchingParagraphs.length > 1) {
    throw new Error(`Multiple matches for heading in document: ${heading}`);
  }

  const paragraph = matchingParagraphs[0];
  const paragraphIndex = body.elements.indexOf(paragraph);
  const table = body.elements.find((el, index) => index > paragraphIndex && el.name === 'w:tbl');
  if (!table) {
    throw new Error(`Can't find table after heading: ${heading}`);
  }

  return table;
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

const TEST_LABELS = [
  'Test 1 – Fixed Width Table (4.17in)',
  'Test 2 – Fixed Width Table (8.33in)',
  'Test 3 – Relative Width Table (60%)',
  'Test 4 – Relative Width Table (100%)',
  'Test 5 – Relative Width Table (200%)',
  'Test 6 – Fixed Width Table with overridden cell widths',
  // TODO: Auto width tables not yet supported
  // 'Test 7 – Auto Width Table',
  'Test 8 – Fixed Width Table (4.17in) with custom margins',
];

describe('table widths', () => {
  TEST_LABELS.forEach((label) => {
    describe(label, async () => {
      it('persists table measurements across import/export', async () => {
        const originalDocx = await getTestDataByFileName(TEST_DOC);
        const exportedDocx = await getExportedResult(TEST_DOC);

        const originalTable = findTable(originalDocx['word/document.xml'], label);
        const exportedTable = findTable(exportedDocx, label);

        const originalGrid = getGridColumns(originalTable);
        const exportedGrid = getGridColumns(exportedTable);
        expect(exportedGrid).toEqual(originalGrid);

        const originalWidths = getRowCellWidths(originalTable);
        const exportedWidths = getRowCellWidths(exportedTable);
        expect(exportedWidths).toEqual(originalWidths);
      });
    });
  });
});
