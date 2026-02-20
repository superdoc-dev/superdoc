import { getExportedResult, getExportedResultWithDocContent } from './export-helpers/index.js';
import { twipsToPixels, pixelsToTwips } from '../../core/super-converter/helpers.js';

describe('test table export', async () => {
  const fileName = 'table-merged-cells.docx';
  const result = await getExportedResult(fileName);

  const body = {};

  beforeEach(() => {
    Object.assign(
      body,
      result.elements?.find((el) => el.name === 'w:body'),
    );
  });

  it('correctly gets w:tblGrid', () => {
    const tableGrid = body.elements[0].elements[1].elements;
    const gridCol1 = twipsToPixels(tableGrid[0].attributes['w:w']);
    const gridCol2 = twipsToPixels(tableGrid[1].attributes['w:w']);
    const gridCol3 = twipsToPixels(tableGrid[2].attributes['w:w']);

    expect(gridCol1).toBeCloseTo(94.2, 1);
    expect(gridCol2).toBeCloseTo(330.733, 3);
    expect(gridCol3).toBeCloseTo(176.133, 3);
  });
});

describe('tableHeader export', () => {
  it('exports tables with tableHeader nodes to valid OOXML structure', async () => {
    const tableWithHeaders = {
      type: 'table',
      attrs: {
        grid: [{ col: 1500 }, { col: 1500 }],
        tableProperties: {},
      },
      content: [
        {
          type: 'tableRow',
          attrs: {},
          content: [
            {
              type: 'tableHeader',
              attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
              content: [
                {
                  type: 'paragraph',
                  attrs: {},
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Header 1' }] }],
                },
              ],
            },
            {
              type: 'tableHeader',
              attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
              content: [
                {
                  type: 'paragraph',
                  attrs: {},
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Header 2' }] }],
                },
              ],
            },
          ],
        },
        {
          type: 'tableRow',
          attrs: {},
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
              content: [
                {
                  type: 'paragraph',
                  attrs: {},
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Cell 1' }] }],
                },
              ],
            },
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
              content: [
                {
                  type: 'paragraph',
                  attrs: {},
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Cell 2' }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = await getExportedResultWithDocContent([tableWithHeaders]);

    const body = result.elements.find((el) => el.name === 'w:body');
    expect(body).toBeDefined();

    const tbl = body.elements.find((el) => el.name === 'w:tbl');
    expect(tbl).toBeDefined();

    const tblGrid = tbl.elements.find((el) => el.name === 'w:tblGrid');
    expect(tblGrid).toBeDefined();
    const gridCols = tblGrid.elements.filter((el) => el.name === 'w:gridCol');
    expect(gridCols.length).toBeGreaterThan(0);

    const rows = tbl.elements.filter((el) => el.name === 'w:tr');
    expect(rows.length).toBe(2);

    const firstRowCells = rows[0].elements.filter((el) => el.name === 'w:tc');
    expect(firstRowCells.length).toBe(2);

    const secondRowCells = rows[1].elements.filter((el) => el.name === 'w:tc');
    expect(secondRowCells.length).toBe(2);
  });

  it('exports mixed tableHeader and tableCell in same row', async () => {
    const tableWithMixedCells = {
      type: 'table',
      attrs: {
        grid: [{ col: 1500 }, { col: 1500 }],
        tableProperties: {},
      },
      content: [
        {
          type: 'tableRow',
          attrs: {},
          content: [
            {
              type: 'tableHeader',
              attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
              content: [{ type: 'paragraph', attrs: {}, content: [] }],
            },
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
              content: [{ type: 'paragraph', attrs: {}, content: [] }],
            },
          ],
        },
      ],
    };

    const result = await getExportedResultWithDocContent([tableWithMixedCells]);

    const body = result.elements.find((el) => el.name === 'w:body');
    const tbl = body.elements.find((el) => el.name === 'w:tbl');
    const rows = tbl.elements.filter((el) => el.name === 'w:tr');
    const cells = rows[0].elements.filter((el) => el.name === 'w:tc');

    expect(cells.length).toBe(2);
  });

  it('IT-550: tableHeader and tableCell emit identical w:tcW for same colwidth', async () => {
    const expectedTwips = String(pixelsToTwips(100));
    const tableWithHeaders = {
      type: 'table',
      attrs: {
        grid: [{ col: 1500 }, { col: 1500 }],
        tableProperties: {},
      },
      content: [
        {
          type: 'tableRow',
          attrs: {},
          content: [
            {
              type: 'tableHeader',
              attrs: { colspan: 1, rowspan: 1, colwidth: [100], widthUnit: 'px' },
              content: [
                {
                  type: 'paragraph',
                  attrs: {},
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Header' }] }],
                },
              ],
            },
            {
              type: 'tableHeader',
              attrs: { colspan: 1, rowspan: 1, colwidth: [100], widthUnit: 'px' },
              content: [
                {
                  type: 'paragraph',
                  attrs: {},
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Header 2' }] }],
                },
              ],
            },
          ],
        },
        {
          type: 'tableRow',
          attrs: {},
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [100], widthUnit: 'px' },
              content: [
                {
                  type: 'paragraph',
                  attrs: {},
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Cell' }] }],
                },
              ],
            },
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [100], widthUnit: 'px' },
              content: [
                {
                  type: 'paragraph',
                  attrs: {},
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Cell 2' }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = await getExportedResultWithDocContent([tableWithHeaders]);
    const body = result.elements.find((el) => el.name === 'w:body');
    const tbl = body.elements.find((el) => el.name === 'w:tbl');
    const rows = tbl.elements.filter((el) => el.name === 'w:tr');

    // Extract w:tcW from both header and body cells
    const getTcW = (cell) => {
      const tcPr = cell.elements.find((el) => el.name === 'w:tcPr');
      return tcPr?.elements?.find((el) => el.name === 'w:tcW');
    };

    const headerCell = rows[0].elements.filter((el) => el.name === 'w:tc')[0];
    const bodyCell = rows[1].elements.filter((el) => el.name === 'w:tc')[0];

    const headerTcW = getTcW(headerCell);
    const bodyTcW = getTcW(bodyCell);

    // Assert exact expected value (1500 twips = pixelsToTwips(100))
    expect(headerTcW.attributes['w:w']).toBe(expectedTwips);
    expect(bodyTcW.attributes['w:w']).toBe(expectedTwips);
  });
});
