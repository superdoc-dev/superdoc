// @ts-check
/**
 * End-to-end round-trip integration test for cell-level SDT (CT_SdtCell)
 * preservation. SD-3289 / IT-1119.
 *
 * Drives a real `<w:tbl>` containing `<w:tr><w:sdt><w:sdtContent><w:tc/></w:sdtContent></w:sdt></w:tr>`
 * through the real v3 table importer (no translator mocks), then exports the
 * resulting PM tree via the production `exportSchemaToJson` router, and asserts
 * the `<w:sdt>` wrapper plus its `w:date` metadata survive both legs.
 *
 * Distinct from `tr-translator.cell-sdt.test.js`, which mocks `tcTranslator`
 * and `translateChildNodes` to unit-test the row translator's logic. This file
 * runs the real chain so we catch schema-level losses (PM attr persistence,
 * cross-translator wiring) that unit mocks would miss.
 */
import { describe, it, expect } from 'vitest';
import { translator as tblTranslator } from '../tbl/tbl-translator.js';
import { exportSchemaToJson } from '../../../../exporter.js';
import { defaultNodeListHandler } from '../../../../v2/importer/docxImporter.js';

const DATE_TEXT = '18 January 2025';
const LABEL_TEXT = 'COMMENCEMENT DATE';

const SDT_PR = {
  name: 'w:sdtPr',
  elements: [
    { name: 'w:id', attributes: { 'w:val': '849213029' } },
    {
      name: 'w:date',
      attributes: { 'w:fullDate': '2025-01-18T00:00:00Z' },
      elements: [
        { name: 'w:dateFormat', attributes: { 'w:val': 'd MMMM yyyy' } },
        { name: 'w:lid', attributes: { 'w:val': 'en-AU' } },
        { name: 'w:storeMappedDataAs', attributes: { 'w:val': 'dateTime' } },
        { name: 'w:calendar', attributes: { 'w:val': 'gregorian' } },
      ],
    },
  ],
};

const buildIT1119Table = () => ({
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
      name: 'w:tr',
      elements: [
        {
          name: 'w:tc',
          elements: [
            {
              name: 'w:tcPr',
              elements: [{ name: 'w:tcW', attributes: { 'w:w': '3260', 'w:type': 'dxa' } }],
            },
            {
              name: 'w:p',
              elements: [
                {
                  name: 'w:r',
                  elements: [{ name: 'w:t', elements: [{ type: 'text', text: LABEL_TEXT }] }],
                },
              ],
            },
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
                  name: 'w:tc',
                  elements: [
                    {
                      name: 'w:tcPr',
                      elements: [{ name: 'w:tcW', attributes: { 'w:w': '5920', 'w:type': 'dxa' } }],
                    },
                    {
                      name: 'w:p',
                      elements: [
                        {
                          name: 'w:r',
                          elements: [{ name: 'w:t', elements: [{ type: 'text', text: DATE_TEXT }] }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
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

const collectText = (pmNode) => {
  if (!pmNode) return '';
  if (pmNode.type === 'text') return pmNode.text || '';
  return (pmNode.content || []).map(collectText).join('');
};

const collectXmlText = (xml) => {
  if (!xml) return '';
  if (xml.type === 'text') return xml.text || '';
  return (xml.elements || []).map(collectXmlText).join('');
};

describe('cell-level SDT round-trip (SD-3289 / IT-1119)', () => {
  it('imports and exports a CT_SdtCell-wrapped table cell with date metadata intact', () => {
    const tbl = buildIT1119Table();
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

    // Import-side assertions ---------------------------------------------------
    expect(tablePm).toBeTruthy();
    expect(tablePm.type).toBe('table');
    const rows = (tablePm.content || []).filter((n) => n.type === 'tableRow');
    expect(rows).toHaveLength(1);
    const cells = (rows[0].content || []).filter((n) => n.type === 'tableCell');
    expect(cells.length).toBeGreaterThanOrEqual(2);

    const labelCell = cells[0];
    const dateCell = cells[1];

    // First cell: no cellSdt; carries the label text.
    expect(labelCell.attrs?.cellSdt ?? null).toBeNull();
    expect(collectText(labelCell)).toContain(LABEL_TEXT);

    // Second cell: cellSdt populated, date text preserved.
    expect(dateCell.attrs?.cellSdt).toBeTruthy();
    expect(dateCell.attrs.cellSdt.scope).toBe('cell');
    expect(dateCell.attrs.cellSdt.sdtPr?.name).toBe('w:sdtPr');
    expect(collectText(dateCell)).toContain(DATE_TEXT);

    // The preserved sdtPr carries the `w:date` element with the original
    // fullDate attribute and child elements (dateFormat / lid / calendar).
    const dateEl = (dateCell.attrs.cellSdt.sdtPr.elements || []).find((el) => el.name === 'w:date');
    expect(dateEl).toBeTruthy();
    expect(dateEl.attributes['w:fullDate']).toBe('2025-01-18T00:00:00Z');
    const dateFormat = (dateEl.elements || []).find((el) => el.name === 'w:dateFormat');
    expect(dateFormat?.attributes['w:val']).toBe('d MMMM yyyy');

    // Export-side assertions ---------------------------------------------------
    const exported = exportSchemaToJson({ node: tablePm });
    expect(exported).toBeTruthy();

    const trEl = findFirst(exported, 'w:tr');
    expect(trEl).toBeTruthy();

    // Row must contain a direct <w:tc> (the label cell) AND a <w:sdt> wrapper
    // (the date cell). Order must be preserved.
    const trChildren = (trEl.elements || []).filter((el) => el?.name === 'w:tc' || el?.name === 'w:sdt');
    expect(trChildren.map((el) => el.name)).toEqual(['w:tc', 'w:sdt']);

    const sdtEl = trChildren[1];
    const sdtChildNames = (sdtEl.elements || []).map((el) => el?.name);
    expect(sdtChildNames).toContain('w:sdtPr');
    expect(sdtChildNames).toContain('w:sdtContent');

    // Reconstructed sdtPr preserves the date metadata.
    const reSdtPr = (sdtEl.elements || []).find((el) => el.name === 'w:sdtPr');
    const reDateEl = findFirst(reSdtPr, 'w:date');
    expect(reDateEl?.attributes?.['w:fullDate']).toBe('2025-01-18T00:00:00Z');

    // sdtContent wraps a single <w:tc> carrying the date text.
    const reSdtContent = (sdtEl.elements || []).find((el) => el.name === 'w:sdtContent');
    const wrappedTc = (reSdtContent.elements || []).find((el) => el.name === 'w:tc');
    expect(wrappedTc).toBeTruthy();
    expect(collectXmlText(wrappedTc)).toContain(DATE_TEXT);

    // The exported tree must not also emit the date cell as a bare <w:tc>
    // sibling — exactly one cell carries the date text.
    const allCellsInRow = findAll(trEl, 'w:tc');
    const cellsWithDate = allCellsInRow.filter((tc) => collectXmlText(tc).includes(DATE_TEXT));
    expect(cellsWithDate).toHaveLength(1);
  });
});
