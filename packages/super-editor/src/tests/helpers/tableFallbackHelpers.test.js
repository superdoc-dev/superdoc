import {
  buildFallbackGridForTable,
  countColumnsInRow,
  resolveMeasurementWidthPx,
  DEFAULT_CONTENT_WIDTH_TWIPS,
} from '@core/super-converter/helpers/tableFallbackHelpers.js';

const createCell = (gridSpan) => {
  const tcPrElements = gridSpan
    ? [
        {
          name: 'w:gridSpan',
          attributes: { 'w:val': String(gridSpan) },
        },
      ]
    : [];

  const tcPr = tcPrElements.length
    ? {
        name: 'w:tcPr',
        elements: tcPrElements,
      }
    : null;

  return {
    name: 'w:tc',
    elements: tcPr ? [tcPr] : [],
  };
};

const createRow = (spans = [1, 1]) => ({
  name: 'w:tr',
  elements: spans.map((span) => createCell(span)),
});

const baseParams = {
  params: {
    editor: {
      schema: {
        nodes: {
          tableCell: {
            spec: {
              attrs: {
                colwidth: {
                  default: [100],
                },
              },
            },
          },
        },
      },
    },
  },
};

describe('tableFallbackHelpers', () => {
  it('counts columns including grid spans', () => {
    const row = createRow([1, 2]);
    expect(countColumnsInRow(row)).toBe(3);
  });

  it('builds fallback grid using provided table width', () => {
    const rows = [createRow([1, 1])];

    const result = buildFallbackGridForTable({
      ...baseParams,
      rows,
      tableWidth: { width: 400 },
    });

    expect(result).not.toBeNull();
    expect(result.grid).toHaveLength(2);
    result.grid.forEach((column) => {
      expect(column.col).toBeCloseTo((200 / 96) * 1440, 0); // px -> twips
    });
    result.columnWidths.forEach((widthPx) => {
      expect(widthPx).toBeCloseTo(200, 0);
    });
  });

  it('derives fallback grid from pct measurement when width missing', () => {
    const rows = [createRow([1, 1])];

    const result = buildFallbackGridForTable({
      ...baseParams,
      rows,
      tableWidth: { width: 0 },
      tableWidthMeasurement: { value: 5000, type: 'pct' },
    });

    expect(result).not.toBeNull();
    const totalTwips = result.grid.reduce((sum, col) => sum + col.col, 0);
    expect(totalTwips).toBeCloseTo(DEFAULT_CONTENT_WIDTH_TWIPS, 0);
  });

  it('returns null when no table cells present', () => {
    const rows = [
      {
        name: 'w:tr',
        elements: [],
      },
    ];

    const result = buildFallbackGridForTable({ ...baseParams, rows });
    expect(result).toBeNull();
  });

  it('defaults to page content width when no width info available', () => {
    const rows = [createRow([1, 1, 1])];

    const result = buildFallbackGridForTable({ ...baseParams, rows });

    expect(result).not.toBeNull();
    const totalTwips = result.grid.reduce((sum, col) => sum + col.col, 0);
    expect(totalTwips).toBeCloseTo(DEFAULT_CONTENT_WIDTH_TWIPS, 0);
    // 3 equal columns spanning page width
    result.columnWidths.forEach((widthPx) => {
      expect(widthPx).toBeCloseTo((totalTwips / 3 / 1440) * 96, 0);
    });
  });

  it('resolves measurement width from dxa values', () => {
    const measurement = { value: 1440, type: 'dxa' }; // 1"
    expect(resolveMeasurementWidthPx(measurement)).toBeCloseTo(96, 3);
  });
});
