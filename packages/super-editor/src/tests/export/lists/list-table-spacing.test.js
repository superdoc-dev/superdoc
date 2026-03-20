import { describe, it, expect } from 'vitest';
import { getExportedResult } from '@tests/export/export-helpers/index.js';

const findFirst = (elements, name) => elements?.find((element) => element.name === name);

const collectRunsWithBreak = (paragraph) => {
  if (!paragraph?.elements) return [];
  return paragraph.elements.filter((element) => {
    if (element.name !== 'w:r') return false;
    return element.elements?.some((child) => child.name === 'w:br');
  });
};

const findFirstTableCellParagraph = (table) => {
  const firstRow = table?.elements?.find((el) => el.name === 'w:tr');
  const firstCell = firstRow?.elements?.find((el) => el.name === 'w:tc');
  return firstCell?.elements?.find((el) => el.name === 'w:p');
};

describe('list item tables', () => {
  it('does not emit a manual line break before a table in a list item', async () => {
    const exportResult = await getExportedResult('list-with-table-break.docx');

    const body = findFirst(exportResult.elements, 'w:body');
    expect(body).toBeDefined();

    const paragraph = findFirst(body.elements, 'w:p');
    expect(paragraph).toBeDefined();

    const table = findFirst(body.elements, 'w:tbl');
    expect(table).toBeDefined();

    const runsWithBreak = collectRunsWithBreak(paragraph);
    expect(runsWithBreak.length).toBe(1);

    const tableCellParagraph = findFirstTableCellParagraph(table);
    expect(tableCellParagraph).toBeDefined();

    const cellPPr = tableCellParagraph.elements?.find((el) => el.name === 'w:pPr');
    const indent = cellPPr?.elements?.find((el) => el.name === 'w:ind');
    expect(indent).toBeUndefined();
  });
});
