import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';

export const simpleBlock: FlowBlock = {
  kind: 'paragraph',
  id: '0-paragraph',
  runs: [
    { text: 'Hello ', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 7 },
    { text: 'world', fontFamily: 'Arial', fontSize: 16, pmStart: 7, pmEnd: 12 },
  ],
};

export const simpleMeasure: Measure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 1,
      toChar: 5,
      width: 120,
      ascent: 12,
      descent: 4,
      lineHeight: 20,
    },
  ],
  totalHeight: 20,
};

export const simpleLayout: Layout = {
  pageSize: { w: 400, h: 500 },
  pages: [
    {
      number: 1,
      fragments: [
        {
          kind: 'para',
          blockId: '0-paragraph',
          fromLine: 0,
          toLine: 1,
          x: 30,
          y: 40,
          width: 300,
          pmStart: 1,
          pmEnd: 12,
        },
      ],
    },
  ],
};

export const columnsLayout: Layout = {
  pageSize: { w: 600, h: 800 },
  columns: { count: 2, gap: 20 },
  pages: [
    {
      number: 1,
      fragments: [
        {
          kind: 'para',
          blockId: '0-paragraph',
          fromLine: 0,
          toLine: 1,
          x: 40,
          y: 40,
          width: 200,
          pmStart: 1,
          pmEnd: 12,
        },
        {
          kind: 'para',
          blockId: '0-paragraph',
          fromLine: 0,
          toLine: 1,
          x: 300,
          y: 40,
          width: 200,
          pmStart: 1,
          pmEnd: 12,
        },
      ],
    },
  ],
};

export const multiLineBlock: FlowBlock = {
  kind: 'paragraph',
  id: 'multi-block',
  runs: [
    { text: 'Line one ', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 10 },
    { text: 'line two text', fontFamily: 'Arial', fontSize: 16, pmStart: 10, pmEnd: 23 },
  ],
};

export const multiLineMeasure: Measure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 9,
      width: 200,
      ascent: 12,
      descent: 4,
      lineHeight: 20,
    },
    {
      fromRun: 1,
      fromChar: 0,
      toRun: 1,
      toChar: 13,
      width: 220,
      ascent: 12,
      descent: 4,
      lineHeight: 20,
    },
  ],
  totalHeight: 40,
};

export const multiLineLayout: Layout = {
  pageSize: { w: 400, h: 500 },
  pages: [
    {
      number: 1,
      fragments: [
        {
          kind: 'para',
          blockId: 'multi-block',
          fromLine: 0,
          toLine: 2,
          x: 30,
          y: 40,
          width: 300,
          pmStart: 1,
          pmEnd: 23,
        },
      ],
    },
  ],
};

export const blocks = [simpleBlock];
export const measures = [simpleMeasure];
export const multiBlocks = [multiLineBlock];
export const multiMeasures = [multiLineMeasure];

export const drawingBlock: FlowBlock = {
  kind: 'drawing',
  id: 'drawing-0',
  drawingKind: 'vectorShape',
  geometry: { width: 60, height: 40, rotation: 0, flipH: false, flipV: false },
  padding: undefined,
  margin: undefined,
  anchor: undefined,
  wrap: undefined,
  attrs: { pmStart: 20, pmEnd: 21 },
};

export const drawingMeasure: Measure = {
  kind: 'drawing',
  drawingKind: 'vectorShape',
  width: 60,
  height: 40,
  scale: 1,
  naturalWidth: 60,
  naturalHeight: 40,
  geometry: { width: 60, height: 40, rotation: 0, flipH: false, flipV: false },
};

export const drawingLayout: Layout = {
  pageSize: { w: 400, h: 500 },
  pages: [
    {
      number: 1,
      fragments: [
        {
          kind: 'drawing',
          blockId: 'drawing-0',
          drawingKind: 'vectorShape',
          x: 50,
          y: 80,
          width: 60,
          height: 40,
          geometry: { width: 60, height: 40, rotation: 0, flipH: false, flipV: false },
          scale: 1,
          pmStart: 20,
          pmEnd: 21,
        },
      ],
    },
  ],
};

const tableParagraph = {
  kind: 'paragraph',
  id: 'table-cell-para',
  runs: [{ text: 'Table text', fontFamily: 'Arial', fontSize: 14, pmStart: 1, pmEnd: 11 }],
} as const;

export const tableBlock: FlowBlock = {
  kind: 'table',
  id: 'table-0',
  rows: [
    {
      id: 'row-0',
      cells: [
        {
          id: 'cell-0',
          blocks: [tableParagraph],
          attrs: { padding: { top: 2, bottom: 2, left: 4, right: 4 } },
        },
      ],
    },
  ],
};

export const tableMeasure: Measure = {
  kind: 'table',
  rows: [
    {
      height: 24,
      cells: [
        {
          width: 120,
          height: 24,
          gridColumnStart: 0,
          blocks: [
            {
              kind: 'paragraph',
              lines: [
                {
                  fromRun: 0,
                  fromChar: 0,
                  toRun: 0,
                  toChar: 10,
                  width: 80,
                  ascent: 10,
                  descent: 4,
                  lineHeight: 18,
                },
              ],
              totalHeight: 18,
            },
          ],
        },
      ],
    },
  ],
  columnWidths: [120],
  totalWidth: 120,
  totalHeight: 24,
};

export const tableLayout: Layout = {
  pageSize: { w: 400, h: 500 },
  pages: [
    {
      number: 1,
      fragments: [
        {
          kind: 'table',
          blockId: 'table-0',
          fromRow: 0,
          toRow: 1,
          x: 30,
          y: 60,
          width: 120,
          height: 24,
        },
      ],
    },
  ],
};

// Mock data for table with rowspan (SD-1626 / IT-22)
// Table structure:
// Row 0: [Cell A (rowspan=2)] [Cell B] [Cell C]
// Row 1:                      [Cell D] [Cell E]  <- Row 1 cells start at gridColumnStart=1
const rowspanTableParagraph = {
  kind: 'paragraph',
  id: 'rowspan-cell-para',
  runs: [{ text: 'Cell', fontFamily: 'Arial', fontSize: 14, pmStart: 1, pmEnd: 5 }],
} as const;

export const rowspanTableBlock: FlowBlock = {
  kind: 'table',
  id: 'rowspan-table-0',
  rows: [
    {
      id: 'row-0',
      cells: [
        {
          id: 'cell-a',
          blocks: [rowspanTableParagraph],
          attrs: { rowspan: 2, padding: { top: 2, bottom: 2, left: 4, right: 4 } },
        },
        { id: 'cell-b', blocks: [rowspanTableParagraph], attrs: { padding: { top: 2, bottom: 2, left: 4, right: 4 } } },
        { id: 'cell-c', blocks: [rowspanTableParagraph], attrs: { padding: { top: 2, bottom: 2, left: 4, right: 4 } } },
      ],
    },
    {
      id: 'row-1',
      cells: [
        // No cell at column 0 - occupied by rowspan from above
        { id: 'cell-d', blocks: [rowspanTableParagraph], attrs: { padding: { top: 2, bottom: 2, left: 4, right: 4 } } },
        { id: 'cell-e', blocks: [rowspanTableParagraph], attrs: { padding: { top: 2, bottom: 2, left: 4, right: 4 } } },
      ],
    },
  ],
};

export const rowspanTableMeasure: Measure = {
  kind: 'table',
  rows: [
    {
      height: 24,
      cells: [
        {
          width: 100,
          height: 48,
          gridColumnStart: 0,
          colSpan: 1,
          rowSpan: 2,
          blocks: [
            {
              kind: 'paragraph',
              lines: [
                { fromRun: 0, fromChar: 0, toRun: 0, toChar: 4, width: 40, ascent: 10, descent: 4, lineHeight: 18 },
              ],
              totalHeight: 18,
            },
          ],
        },
        {
          width: 100,
          height: 24,
          gridColumnStart: 1,
          blocks: [
            {
              kind: 'paragraph',
              lines: [
                { fromRun: 0, fromChar: 0, toRun: 0, toChar: 4, width: 40, ascent: 10, descent: 4, lineHeight: 18 },
              ],
              totalHeight: 18,
            },
          ],
        },
        {
          width: 100,
          height: 24,
          gridColumnStart: 2,
          blocks: [
            {
              kind: 'paragraph',
              lines: [
                { fromRun: 0, fromChar: 0, toRun: 0, toChar: 4, width: 40, ascent: 10, descent: 4, lineHeight: 18 },
              ],
              totalHeight: 18,
            },
          ],
        },
      ],
    },
    {
      height: 24,
      cells: [
        // Row 1 cells start at gridColumnStart=1 (column 0 is occupied by rowspan)
        {
          width: 100,
          height: 24,
          gridColumnStart: 1,
          blocks: [
            {
              kind: 'paragraph',
              lines: [
                { fromRun: 0, fromChar: 0, toRun: 0, toChar: 4, width: 40, ascent: 10, descent: 4, lineHeight: 18 },
              ],
              totalHeight: 18,
            },
          ],
        },
        {
          width: 100,
          height: 24,
          gridColumnStart: 2,
          blocks: [
            {
              kind: 'paragraph',
              lines: [
                { fromRun: 0, fromChar: 0, toRun: 0, toChar: 4, width: 40, ascent: 10, descent: 4, lineHeight: 18 },
              ],
              totalHeight: 18,
            },
          ],
        },
      ],
    },
  ],
  columnWidths: [100, 100, 100],
  totalWidth: 300,
  totalHeight: 48,
};

export const rowspanTableLayout: Layout = {
  pageSize: { w: 400, h: 500 },
  pages: [
    {
      number: 1,
      fragments: [
        {
          kind: 'table',
          blockId: 'rowspan-table-0',
          fromRow: 0,
          toRow: 2,
          x: 30,
          y: 60,
          width: 300,
          height: 48,
        },
      ],
    },
  ],
};

/**
 * Builds table test fixtures with customizable dimensions.
 * Reduces duplication between clickToPosition and dom-mapping table tests.
 *
 * @param opts - Optional table geometry and PM range overrides for the fixture.
 * @returns A table `FlowBlock` and matching `Measure` used by click-mapping tests.
 */
export function buildTableFixtures(
  opts: {
    cellWidth?: number;
    cellHeight?: number;
    lineHeight?: number;
    pmStart?: number;
    pmEnd?: number;
    text?: string;
    blockId?: string;
  } = {},
): { block: FlowBlock; measure: Measure } {
  const {
    cellWidth = 200,
    cellHeight = 80,
    lineHeight = 18,
    pmStart = 50,
    pmEnd = 59,
    text = 'Cell text',
    blockId = 'table-block',
  } = opts;

  const block: FlowBlock = {
    kind: 'table',
    id: blockId,
    rows: [
      {
        id: 'row-0',
        cells: [
          {
            id: 'cell-0',
            blocks: [
              {
                kind: 'paragraph' as const,
                id: `${blockId}-para`,
                runs: [{ text, fontFamily: 'Arial', fontSize: 14, pmStart, pmEnd }],
              },
            ],
            attrs: { padding: { top: 2, bottom: 2, left: 4, right: 4 } },
          },
        ],
      },
    ],
  };

  const measure: Measure = {
    kind: 'table',
    rows: [
      {
        height: cellHeight,
        cells: [
          {
            width: cellWidth,
            height: cellHeight,
            gridColumnStart: 0,
            blocks: [
              {
                kind: 'paragraph',
                lines: [
                  {
                    fromRun: 0,
                    fromChar: 0,
                    toRun: 0,
                    toChar: text.length,
                    width: 70,
                    ascent: 10,
                    descent: 4,
                    lineHeight,
                  },
                ],
                totalHeight: lineHeight,
              },
            ],
          },
        ],
      },
    ],
    columnWidths: [cellWidth],
    totalWidth: cellWidth,
    totalHeight: cellHeight,
  };

  return { block, measure };
}

/**
 * Builds table fixtures where the cell contains a list paragraph (wordLayout marker).
 * Exercises the DOM shape that changes during PRs 5–6 (shared flow migration).
 *
 * @param opts - Optional marker, cell geometry, and PM range overrides for the fixture.
 * @returns A table `FlowBlock` and matching `Measure` with list-marker paragraph data.
 */
export function buildTableWithListFixtures(
  opts: {
    markerText?: string;
    markerWidth?: number;
    cellWidth?: number;
    pmStart?: number;
    pmEnd?: number;
    text?: string;
    blockId?: string;
  } = {},
): { block: FlowBlock; measure: Measure } {
  const {
    markerText = '1.',
    markerWidth = 18,
    cellWidth = 200,
    pmStart = 50,
    pmEnd = 59,
    text = 'List text',
    blockId = 'table-list-block',
  } = opts;

  const block: FlowBlock = {
    kind: 'table',
    id: blockId,
    rows: [
      {
        id: 'row-0',
        cells: [
          {
            id: 'cell-0',
            blocks: [
              {
                kind: 'paragraph' as const,
                id: `${blockId}-para`,
                runs: [{ text, fontFamily: 'Arial', fontSize: 14, pmStart, pmEnd }],
                attrs: {
                  wordLayout: {
                    marker: {
                      markerText,
                      justification: 'right',
                      suffix: 'tab' as const,
                      run: { fontFamily: 'Arial', fontSize: 14, bold: false, italic: false },
                    },
                    gutter: { widthPx: markerWidth },
                  },
                  indent: { left: 36, hanging: markerWidth },
                },
              },
            ],
            attrs: { padding: { top: 2, bottom: 2, left: 4, right: 4 } },
          },
        ],
      },
    ],
  };

  const measure: Measure = {
    kind: 'table',
    rows: [
      {
        height: 24,
        cells: [
          {
            width: cellWidth,
            height: 24,
            gridColumnStart: 0,
            blocks: [
              {
                kind: 'paragraph',
                lines: [
                  {
                    fromRun: 0,
                    fromChar: 0,
                    toRun: 0,
                    toChar: text.length,
                    width: 70,
                    ascent: 10,
                    descent: 4,
                    lineHeight: 18,
                  },
                ],
                totalHeight: 18,
              },
            ],
          },
        ],
      },
    ],
    columnWidths: [cellWidth],
    totalWidth: cellWidth,
    totalHeight: 24,
  };

  return { block, measure };
}

/**
 * Builds table fixtures where the cell contains an SDT-wrapped paragraph.
 * Exercises the DOM shape for SDT-inside-table-cell mapping.
 *
 * @param opts - Optional cell geometry and PM range overrides for the SDT fixture.
 * @returns A table `FlowBlock` and matching `Measure` with SDT inline run data.
 */
export function buildTableWithSdtFixtures(
  opts: {
    cellWidth?: number;
    pmStart?: number;
    pmEnd?: number;
    text?: string;
    blockId?: string;
  } = {},
): { block: FlowBlock; measure: Measure } {
  const { cellWidth = 200, pmStart = 50, pmEnd = 59, text = 'SDT text', blockId = 'table-sdt-block' } = opts;

  const block: FlowBlock = {
    kind: 'table',
    id: blockId,
    rows: [
      {
        id: 'row-0',
        cells: [
          {
            id: 'cell-0',
            blocks: [
              {
                kind: 'paragraph' as const,
                id: `${blockId}-para`,
                runs: [
                  {
                    text,
                    fontFamily: 'Arial',
                    fontSize: 14,
                    pmStart,
                    pmEnd,
                    sdt: { id: 'sdt-1', tag: 'field', alias: 'Field' },
                  },
                ],
              },
            ],
            attrs: { padding: { top: 2, bottom: 2, left: 4, right: 4 } },
          },
        ],
      },
    ],
  };

  const measure: Measure = {
    kind: 'table',
    rows: [
      {
        height: 24,
        cells: [
          {
            width: cellWidth,
            height: 24,
            gridColumnStart: 0,
            blocks: [
              {
                kind: 'paragraph',
                lines: [
                  {
                    fromRun: 0,
                    fromChar: 0,
                    toRun: 0,
                    toChar: text.length,
                    width: 60,
                    ascent: 10,
                    descent: 4,
                    lineHeight: 18,
                  },
                ],
                totalHeight: 18,
              },
            ],
          },
        ],
      },
    ],
    columnWidths: [cellWidth],
    totalWidth: cellWidth,
    totalHeight: 24,
  };

  return { block, measure };
}
