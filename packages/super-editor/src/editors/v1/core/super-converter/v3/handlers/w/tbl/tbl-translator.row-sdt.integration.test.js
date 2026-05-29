// @ts-check
import { describe, it, expect } from 'vitest';
import { translator as tblTranslator } from './tbl-translator.js';
import { exportSchemaToJson } from '../../../../exporter.js';
import { defaultNodeListHandler } from '../../../../v2/importer/docxImporter.js';

const WRAPPED_ROW_TEXT = 'Row inside SDT';
const WRAPPED_ROW_CELL_TEXT = 'Another cell';
const BARE_ROW_TEXT = 'Another row';
const BARE_ROW_CELL_TEXT = 'Hello';

const SDT_PR = {
  name: 'w:sdtPr',
  elements: [
    { name: 'w:rPr', elements: [{ name: 'w:rFonts', attributes: { 'w:cs': 'Arial' } }] },
    { name: 'w:id', attributes: { 'w:val': '849213029' } },
    {
      name: 'w:date',
      elements: [
        { name: 'w:dateFormat', attributes: { 'w:val': 'd MMMM yyyy' } },
        { name: 'w:lid', attributes: { 'w:val': 'en-AU' } },
        { name: 'w:storeMappedDataAs', attributes: { 'w:val': 'dateTime' } },
        { name: 'w:calendar', attributes: { 'w:val': 'gregorian' } },
      ],
    },
  ],
};

const textCell = (width, text) => ({
  name: 'w:tc',
  elements: [
    {
      name: 'w:tcPr',
      elements: [{ name: 'w:tcW', attributes: { 'w:w': width, 'w:type': 'dxa' } }],
    },
    {
      name: 'w:p',
      elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text }] }] }],
    },
  ],
});

const buildFixtureTable = () => ({
  name: 'w:tbl',
  elements: [
    {
      name: 'w:tblPr',
      elements: [
        { name: 'w:tblW', attributes: { 'w:w': '9180', 'w:type': 'dxa' } },
        { name: 'w:tblLayout', attributes: { 'w:type': 'fixed' } },
      ],
    },
    {
      name: 'w:tblGrid',
      elements: [
        { name: 'w:gridCol', attributes: { 'w:w': '3260' } },
        { name: 'w:gridCol', attributes: { 'w:w': '5920' } },
      ],
    },
    {
      name: 'w:sdt',
      elements: [
        SDT_PR,
        {
          name: 'w:sdtContent',
          elements: [
            {
              name: 'w:tr',
              elements: [textCell('3260', WRAPPED_ROW_TEXT), textCell('5920', WRAPPED_ROW_CELL_TEXT)],
            },
          ],
        },
      ],
    },
    {
      name: 'w:tr',
      elements: [textCell('3260', BARE_ROW_TEXT), textCell('5920', BARE_ROW_CELL_TEXT)],
    },
  ],
});

const minimalDocx = {
  'word/styles.xml': { elements: [{ name: 'w:styles', elements: [] }] },
};

const editorStub = {
  schema: {
    nodes: {
      doc: { spec: { group: 'block' } },
      paragraph: { spec: { group: 'block' } },
      run: { isInline: true, spec: { group: 'inline' } },
      text: { isInline: true, spec: { group: 'inline' } },
      table: { spec: { group: 'block' } },
      tableRow: { spec: { group: 'block' } },
      tableCell: { spec: { group: 'block' } },
    },
  },
  converter: { addedMediaFiles: {} },
};

const findFirst = (xml, name) => {
  if (!xml) return null;
  if (xml.name === name) return xml;
  for (const child of xml.elements || []) {
    const hit = findFirst(child, name);
    if (hit) return hit;
  }
  return null;
};

const findAll = (xml, name) => {
  if (!xml) return [];
  const acc = [];
  if (xml.name === name) acc.push(xml);
  for (const child of xml.elements || []) acc.push(...findAll(child, name));
  return acc;
};

const collectText = (node) => {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(collectText).join('');
};

const collectXmlText = (xml) => {
  if (!xml) return '';
  if (xml.type === 'text') return xml.text || '';
  return (xml.elements || []).map(collectXmlText).join('');
};

describe('row-level SDT round-trip (SD-3291)', () => {
  it('imports and exports a CT_SdtRow-wrapped table row with metadata intact', () => {
    const tbl = buildFixtureTable();
    const { handler, handlerEntities } = defaultNodeListHandler();

    const tablePm = tblTranslator.encode(
      {
        nodes: [tbl],
        docx: minimalDocx,
        nodeListHandler: { handler, handlerEntities },
        editor: editorStub,
        path: [],
      },
      {},
    );

    expect(tablePm).toBeTruthy();
    expect(tablePm.type).toBe('table');
    const rows = (tablePm.content || []).filter((node) => node.type === 'tableRow');
    expect(rows).toHaveLength(2);
    expect(collectText(rows[0])).toContain(WRAPPED_ROW_TEXT);
    expect(collectText(rows[0])).toContain(WRAPPED_ROW_CELL_TEXT);
    expect(collectText(rows[1])).toContain(BARE_ROW_TEXT);
    expect(collectText(rows[1])).toContain(BARE_ROW_CELL_TEXT);

    expect(rows[0].attrs?.rowSdt).toBeTruthy();
    expect(rows[0].attrs.rowSdt.scope).toBe('row');
    expect(rows[0].attrs.rowSdt.sdtPr?.name).toBe('w:sdtPr');
    expect(findFirst(rows[0].attrs.rowSdt.sdtPr, 'w:date')).toBeTruthy();
    expect(rows[1].attrs?.rowSdt ?? null).toBeNull();

    const exported = exportSchemaToJson({ node: tablePm });
    const tblEl = findFirst(exported, 'w:tbl');
    const rowChildren = (tblEl.elements || []).filter((el) => el?.name === 'w:sdt' || el?.name === 'w:tr');
    expect(rowChildren.map((el) => el.name)).toEqual(['w:sdt', 'w:tr']);

    const sdtEl = rowChildren[0];
    expect((sdtEl.elements || []).map((el) => el.name)).toEqual(['w:sdtPr', 'w:sdtContent']);
    expect(findFirst(sdtEl, 'w:date')).toBeTruthy();

    const sdtContent = (sdtEl.elements || []).find((el) => el.name === 'w:sdtContent');
    const wrappedRows = (sdtContent.elements || []).filter((el) => el.name === 'w:tr');
    expect(wrappedRows).toHaveLength(1);
    expect(collectXmlText(wrappedRows[0])).toContain(WRAPPED_ROW_TEXT);
    expect(collectXmlText(wrappedRows[0])).toContain(WRAPPED_ROW_CELL_TEXT);

    const allRows = findAll(tblEl, 'w:tr');
    const rowsWithWrappedText = allRows.filter((row) => collectXmlText(row).includes(WRAPPED_ROW_TEXT));
    expect(rowsWithWrappedText).toHaveLength(1);
  });
});
