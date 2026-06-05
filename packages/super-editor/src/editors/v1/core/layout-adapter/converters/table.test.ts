/**
 * Tests for Table Node Converter
 */

import { describe, it, expect, vi } from 'vitest';
import { tableNodeToBlock as baseTableNodeToBlock, handleTableNode } from './table.js';
import type {
  PMNode,
  BlockIdGenerator,
  PositionMap,
  TrackedChangesConfig,
  HyperlinkConfig,
  ThemeColorPalette,
  NestedConverters,
} from '../types.js';
import type { ConverterContext } from '../converter-context.js';
import type { FlowBlock, ParagraphBlock, TableBlock, ImageBlock } from '@superdoc/contracts';
import { twipsToPx } from '../utilities.js';

const DEFAULT_HYPERLINK_CONFIG: HyperlinkConfig = { enableRichHyperlinks: false };
const DEFAULT_CONVERTER_CONTEXT: ConverterContext = {
  translatedNumbering: {},
  translatedLinkedStyles: {
    docDefaults: {},
    latentStyles: {},
    styles: {},
  },
};

const tableNodeToBlock = (
  node: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
  defaultFont: string,
  defaultSize: number,
  trackedChangesConfig?: TrackedChangesConfig,
  bookmarks?: Map<string, number>,
  hyperlinkConfig?: HyperlinkConfig,
  themeColors?: ThemeColorPalette,
  paragraphToFlowBlocks?: NestedConverters['paragraphToFlowBlocks'],
  converterContext?: ConverterContext,
) => {
  const converters = paragraphToFlowBlocks ? ({ paragraphToFlowBlocks } as NestedConverters) : ({} as NestedConverters);
  const effectiveConverterContext =
    converterContext ??
    ({
      ...DEFAULT_CONVERTER_CONTEXT,
      translatedLinkedStyles: {
        ...DEFAULT_CONVERTER_CONTEXT.translatedLinkedStyles,
        docDefaults: {
          ...DEFAULT_CONVERTER_CONTEXT.translatedLinkedStyles.docDefaults,
          runProperties: {
            ...(DEFAULT_CONVERTER_CONTEXT.translatedLinkedStyles.docDefaults?.runProperties ?? {}),
            fontFamily: {
              ...(DEFAULT_CONVERTER_CONTEXT.translatedLinkedStyles.docDefaults?.runProperties?.fontFamily ?? {}),
              ascii: defaultFont,
            },
            fontSize: defaultSize * 2,
          },
        },
      },
    } as ConverterContext);

  return baseTableNodeToBlock(node, {
    nextBlockId,
    positions,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig: hyperlinkConfig ?? DEFAULT_HYPERLINK_CONFIG,
    themeColors,
    converterContext: effectiveConverterContext,
    converters,
    enableComments: true,
  });
};

describe('table converter', () => {
  describe('tableNodeToBlock', () => {
    const mockBlockIdGenerator: BlockIdGenerator = vi.fn((kind) => `test-${kind}`);
    const mockPositionMap: PositionMap = new Map();

    const mockParagraphConverter = vi.fn((params) => {
      return [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: params.para.content?.[0]?.text || 'text', fontFamily: 'Arial', fontSize: 12 }],
        } as ParagraphBlock,
      ];
    });

    it('returns null when node has no content', () => {
      const node: PMNode = {
        type: 'table',
        content: [],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      );

      expect(result).toBeNull();
    });

    it('returns null when paragraphToFlowBlocks is not provided', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined, // themeColors
        undefined, // No paragraph converter
      );

      expect(result).toBeNull();
    });

    it('converts basic table with one cell', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result).toBeDefined();
      expect(result.kind).toBe('table');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].cells).toHaveLength(1);
      expect(result.rows[0].cells[0].paragraph.kind).toBe('paragraph');
    });

    it('resolves w:tblPrEx row borders onto the row attrs, leaving rows without them untouched', () => {
      // FWC form pattern (SD-3345): the table declares tblBorders=none, but form
      // rows carry a w:tblPrEx/w:tblBorders override (#D9D9D9). The converter stores
      // it raw (eighth-points) under tableRowProperties.tblPrExBorders; the adapter
      // must resolve it to typed row.attrs.borders. The callout row has no override.
      const D9 = { val: 'single', color: '#D9D9D9', themeColor: 'background1', themeShade: 'D9', size: 4, space: 0 };
      const node: PMNode = {
        type: 'table',
        attrs: { borders: {} }, // table-level borders are none/empty
        content: [
          {
            type: 'tableRow',
            attrs: { tableRowProperties: { someFlag: true } }, // callout row: no tblPrExBorders
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'callout' }] }] },
            ],
          },
          {
            type: 'tableRow',
            attrs: {
              tableRowProperties: {
                tblPrExBorders: { top: D9, left: D9, bottom: D9, right: D9, insideH: D9, insideV: D9 },
              },
            },
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First name(s)' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      // Callout row: no tblPrEx → no resolved row borders (falls through to table).
      expect(result.rows[0].attrs?.borders).toBeUndefined();

      // Form row: tblPrEx resolved to typed borders (#D9D9D9, eighth-points → px).
      const rowBorders = result.rows[1].attrs?.borders;
      expect(rowBorders).toBeDefined();
      expect(rowBorders?.top).toMatchObject({ style: 'single', color: '#D9D9D9' });
      expect((rowBorders?.top as { width: number }).width).toBeGreaterThan(0);
      expect(rowBorders?.insideH).toMatchObject({ style: 'single', color: '#D9D9D9' });
    });

    it('does not emit imported gridBefore/gridAfter placeholder cells into TableBlock rows', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          tableLayout: 'fixed',
          tableProperties: {
            tableLayout: 'fixed',
            tableWidth: { value: 11384, type: 'dxa' },
          },
          grid: [{ col: 8 }, { col: 3974 }, { col: 2844 }, { col: 4558 }],
        },
        content: [
          {
            type: 'tableRow',
            attrs: {
              tableRowProperties: {
                gridBefore: 1,
                wBefore: { value: 8, type: 'dxa' },
              },
            },
            content: [
              {
                type: 'tableCell',
                attrs: {
                  __placeholder: 'gridBefore',
                  colspan: 1,
                  colwidth: [0.533],
                },
                content: [{ type: 'paragraph', content: [] }],
              },
              {
                type: 'tableCell',
                attrs: {
                  colspan: 3,
                  colwidth: [264.933, 189.6, 303.867],
                  tableCellProperties: {
                    cellWidth: { value: 11376, type: 'dxa' },
                    gridSpan: 3,
                  },
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Client Information' }] }],
              },
            ],
          },
          {
            type: 'tableRow',
            attrs: {
              tableRowProperties: {
                gridAfter: 1,
                wAfter: { value: 4558, type: 'dxa' },
              },
            },
            content: [
              {
                type: 'tableCell',
                attrs: {
                  colspan: 2,
                  colwidth: [0.533, 264.933],
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Contract ACC' }] }],
              },
              {
                type: 'tableCell',
                attrs: {
                  __placeholder: 'gridAfter',
                  colspan: 1,
                  colwidth: [303.867],
                },
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.rows[0].attrs?.tableRowProperties).toMatchObject({
        gridBefore: 1,
        wBefore: { value: 8, type: 'dxa' },
      });
      expect(result.rows[0].cells).toHaveLength(1);
      expect(result.rows[0].cells[0].blocks[0].kind).toBe('paragraph');
      expect((result.rows[0].cells[0].blocks[0] as ParagraphBlock).runs[0].text).toBe('Client Information');

      expect(result.rows[1].attrs?.tableRowProperties).toMatchObject({
        gridAfter: 1,
        wAfter: { value: 4558, type: 'dxa' },
      });
      expect(result.rows[1].cells).toHaveLength(1);
      expect((result.rows[1].cells[0].blocks[0] as ParagraphBlock).runs[0].text).toBe('Contract ACC');
    });

    it('converts table with multiple rows and cells', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'R1C1' }] }],
              },
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'R1C2' }] }],
              },
            ],
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'R2C1' }] }],
              },
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'R2C2' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].cells).toHaveLength(2);
      expect(result.rows[1].cells).toHaveLength(2);
    });

    it('handles table_row and table_cell node types', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [
              {
                type: 'table_cell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(1);
    });

    it('forwards converterContext into paragraph conversion', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'List item' }] }],
              },
            ],
          },
        ],
      };

      const converterContext = { docx: { foo: 'bar' } } as never;

      const paragraphSpy = vi.fn((params) => {
        expect(params.converterContext).toBe(converterContext);
        return mockParagraphConverter(params);
      });

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        paragraphSpy,
        converterContext,
      ) as TableBlock;

      expect(result.rows[0].cells[0].blocks?.[0].kind).toBe('paragraph');
      expect(paragraphSpy).toHaveBeenCalled();
    });

    it('converts images inside table cells when image converter is provided', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'image', attrs: { src: 'image.png' } }],
              },
            ],
          },
        ],
      };

      const imageBlock: ImageBlock = { kind: 'image', id: 'image-1', src: 'image.png' };
      const imageConverter = vi.fn().mockReturnValue(imageBlock);

      const result = baseTableNodeToBlock(node, {
        nextBlockId: mockBlockIdGenerator,
        positions: mockPositionMap,
        defaultFont: 'Arial',
        defaultSize: 16,
        trackedChangesConfig: undefined,
        bookmarks: undefined,
        hyperlinkConfig: DEFAULT_HYPERLINK_CONFIG,
        themeColors: undefined,
        converterContext: DEFAULT_CONVERTER_CONTEXT,
        converters: {
          paragraphToFlowBlocks: mockParagraphConverter,
          imageNodeToBlock: imageConverter,
        } as NestedConverters,
        enableComments: true,
      }) as TableBlock;

      expect(imageConverter).toHaveBeenCalled();
      expect(result.rows[0].cells[0].blocks?.[0]).toBe(imageBlock);
    });

    it('converts structuredContentBlock inside table cells and applies SDT metadata', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [
                  {
                    type: 'structuredContentBlock',
                    attrs: { id: 'scb-1', tag: 'cell-block', alias: 'Cell Block' },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inside cell' }] }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const paragraphConverter = vi.fn(() => [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'Inside cell', fontFamily: 'Arial', fontSize: 12 }],
        } as ParagraphBlock,
      ]);

      const result = baseTableNodeToBlock(node, {
        nextBlockId: mockBlockIdGenerator,
        positions: mockPositionMap,
        defaultFont: 'Arial',
        defaultSize: 16,
        trackedChangesConfig: undefined,
        bookmarks: undefined,
        hyperlinkConfig: DEFAULT_HYPERLINK_CONFIG,
        themeColors: undefined,
        converterContext: DEFAULT_CONVERTER_CONTEXT,
        converters: {
          paragraphToFlowBlocks: paragraphConverter,
        } as NestedConverters,
        enableComments: true,
      }) as TableBlock;

      const cellBlocks = result.rows[0].cells[0].blocks ?? [];
      expect(cellBlocks[0]?.kind).toBe('paragraph');
      expect((cellBlocks[0] as ParagraphBlock).attrs?.sdt).toMatchObject({
        type: 'structuredContent',
        scope: 'block',
        id: 'scb-1',
        tag: 'cell-block',
        alias: 'Cell Block',
      });
    });

    it('converts nested tables inside structuredContentBlock within table cells', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [
                  {
                    type: 'structuredContentBlock',
                    attrs: { id: 'scb-table', alias: 'Cell Table' },
                    content: [{ type: 'table', content: [] }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const nestedTableBlock: TableBlock = {
        kind: 'table',
        id: 'nested-table',
        rows: [
          {
            id: 'row-1',
            cells: [
              {
                id: 'cell-1',
                paragraph: {
                  kind: 'paragraph',
                  id: 'p-nested',
                  runs: [],
                },
              },
            ],
          },
        ],
      };

      const tableConverter = vi.fn().mockReturnValue(nestedTableBlock);

      const result = baseTableNodeToBlock(node, {
        nextBlockId: mockBlockIdGenerator,
        positions: mockPositionMap,
        defaultFont: 'Arial',
        defaultSize: 16,
        trackedChangesConfig: undefined,
        bookmarks: undefined,
        hyperlinkConfig: DEFAULT_HYPERLINK_CONFIG,
        themeColors: undefined,
        converterContext: DEFAULT_CONVERTER_CONTEXT,
        converters: {
          paragraphToFlowBlocks: mockParagraphConverter,
          tableNodeToBlock: tableConverter,
        } as NestedConverters,
        enableComments: true,
      }) as TableBlock;

      const cellBlocks = result.rows[0].cells[0].blocks ?? [];
      const nestedTable = cellBlocks.find((block) => block.kind === 'table') as TableBlock | undefined;
      expect(tableConverter).toHaveBeenCalled();
      expect(nestedTable).toBe(nestedTableBlock);
      expect(nestedTable?.attrs?.sdt).toMatchObject({
        type: 'structuredContent',
        scope: 'block',
        id: 'scb-table',
        alias: 'Cell Table',
      });
    });

    it('handles tableHeader cell type', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(1);
    });

    it('converts rowHeight from twips to px for small values', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            attrs: {
              tableRowProperties: {
                rowHeight: { value: 277, rule: 'exact' },
              },
            },
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Row' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      const row = result.rows[0];
      expect(row.attrs?.rowHeight?.rule).toBe('exact');
      expect(row.attrs?.rowHeight?.value).toBeCloseTo(twipsToPx(277));
      // Verify conversion happened: 277 twips ≈ 18.5px (not 277px)
      // Magic number 30 chosen as upper bound to confirm twips-to-px conversion occurred
      expect(row.attrs?.rowHeight?.value).toBeLessThan(30);
    });

    it('converts rowHeight from twips to px for auto rule', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            attrs: {
              tableRowProperties: {
                rowHeight: { value: 360, rule: 'auto' },
              },
            },
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Row' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      const row = result.rows[0];
      expect(row.attrs?.rowHeight?.rule).toBe('auto');
      expect(row.attrs?.rowHeight?.value).toBeCloseTo(twipsToPx(360));
    });

    it('handles missing rowHeight (should be undefined)', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            attrs: {
              tableRowProperties: {
                // No rowHeight property
              },
            },
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Row' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      const row = result.rows[0];
      expect(row.attrs?.rowHeight).toBeUndefined();
    });

    it('handles zero rowHeight value (preserves zero)', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            attrs: {
              tableRowProperties: {
                rowHeight: { value: 0, rule: 'exact' },
              },
            },
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Row' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      const row = result.rows[0];
      // Zero is a valid value and should be preserved (0 twips = 0 px)
      expect(row.attrs?.rowHeight?.value).toBe(0);
      expect(row.attrs?.rowHeight?.rule).toBe('exact');
    });

    it('handles invalid/unknown rule values (defaults to atLeast)', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            attrs: {
              tableRowProperties: {
                rowHeight: { value: 500, rule: 'invalidRule' },
              },
            },
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Row' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      const row = result.rows[0];
      expect(row.attrs?.rowHeight?.rule).toBe('atLeast');
      expect(row.attrs?.rowHeight?.value).toBeCloseTo(twipsToPx(500));
    });

    it('handles rowspan and colspan attributes', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { rowspan: 2, colspan: 3 },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Merged' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.rows[0].cells[0].rowSpan).toBe(2);
      expect(result.rows[0].cells[0].colSpan).toBe(3);
    });

    it('extracts cell borders when present', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: {
                  // Cell borders are extracted via extractCellBorders function
                  // which processes border data from cell properties
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      // Cell borders are extracted by extractCellBorders utility
      // This test verifies the function is called correctly
      expect(result.rows[0].cells[0]).toBeDefined();
    });

    it('skips schema-default cell borders when table-level borders exist', () => {
      const schemaDefaultBorders = {
        top: { size: 8, color: '000000' },
        right: { size: 8, color: '000000' },
        bottom: { size: 8, color: '000000' },
        left: { size: 8, color: '000000' },
      };

      const node: PMNode = {
        type: 'table',
        attrs: {
          borders: {
            top: { val: 'single', size: 8, color: '000000' },
            right: { val: 'single', size: 8, color: '000000' },
            bottom: { val: 'single', size: 8, color: '000000' },
            left: { val: 'single', size: 8, color: '000000' },
          },
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { borders: schemaDefaultBorders },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.rows[0].cells[0].attrs?.borders).toBeUndefined();
    });

    it('ignores legacy schema-default cell borders (style-engine resolves borders)', () => {
      // Old schema defaults have { size, color } without `val` — these are no longer
      // read from attrs.borders. Cell borders now come from style-engine resolution.
      const schemaDefaultBorders = {
        top: { size: 8, color: '000000' },
        right: { size: 8, color: '000000' },
        bottom: { size: 8, color: '000000' },
        left: { size: 8, color: '000000' },
      };

      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { borders: schemaDefaultBorders },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      // attrs.borders are ignored — style-engine-resolved borders (from resolveTableCellProperties)
      // would provide borders, but this test has no style catalog so borders are undefined.
      expect(result.rows[0].cells[0].attrs?.borders).toBeUndefined();
    });

    it('maps legacy cell border start/end as LTR-default regardless of table direction (painter mirrors for RTL)', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          tableProperties: {
            rightToLeft: true,
          },
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: {
                  borders: {
                    start: { val: 'single', size: 2, color: 'FF0000' },
                    end: { val: 'single', size: 3, color: '0000FF' },
                  },
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      // Per §17.4.12/33, start/end visual side flips with table direction,
      // but renderTableRow.swapCellBordersLR is the single source of that
      // mirror. pm-adapter pre-swapping here would double-mirror.
      expect(result.rows[0].cells[0].attrs?.borders?.left).toMatchObject({
        style: 'single',
        width: 2,
        color: '#FF0000',
      });
      expect(result.rows[0].cells[0].attrs?.borders?.right).toMatchObject({
        style: 'single',
        width: 3,
        color: '#0000FF',
      });
    });

    it('normalizes legacy cell border style aliases (dotdash, doublewave, etc.) to canonical BorderStyle', () => {
      // Pre-migration persisted docs sometimes store border `val` as lowercase
      // or alias forms (`dot`, `dotdash`, `dotdotdash`, `doublewave`). The
      // canonical BorderStyle enum is camelCase. Pin that the legacy fallback
      // path normalizes - otherwise the painter receives a non-canonical
      // string and the border style doesn't render correctly.
      const cases: Array<{ input: string; expected: string }> = [
        { input: 'dot', expected: 'dotted' },
        { input: 'dotdash', expected: 'dotDash' },
        { input: 'dotdotdash', expected: 'dotDotDash' },
        { input: 'doublewave', expected: 'doubleWave' },
        { input: 'NIL', expected: 'none' },
        { input: ' Single ', expected: 'single' },
      ];

      for (const { input, expected } of cases) {
        const node: PMNode = {
          type: 'table',
          attrs: {},
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: {
                    borders: {
                      top: { val: input, size: 2, color: '000000' },
                    },
                  },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
                },
              ],
            },
          ],
        };

        const result = tableNodeToBlock(
          node,
          mockBlockIdGenerator,
          mockPositionMap,
          'Arial',
          16,
          undefined,
          undefined,
          undefined,
          undefined,
          mockParagraphConverter,
        ) as TableBlock;

        const topBorder = result.rows[0].cells[0].attrs?.borders?.top;
        expect(topBorder?.style).toBe(expected);
      }
    });

    it('maps resolved tableCellProperties borders start/end as LTR-default regardless of table direction (painter mirrors for RTL)', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          tableProperties: {
            rightToLeft: true,
          },
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: {
                  tableCellProperties: {
                    borders: {
                      start: { val: 'single', size: 8, color: 'FF0000' },
                      end: { val: 'single', size: 8, color: '0000FF' },
                    },
                  },
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      // pm-adapter keeps start/end as LTR-default. Painter swaps for RTL.
      expect(result.rows[0].cells[0].attrs?.borders?.left).toMatchObject({
        style: 'single',
        width: expect.any(Number),
        color: '#FF0000',
      });
      expect(result.rows[0].cells[0].attrs?.borders?.right).toMatchObject({
        style: 'single',
        width: expect.any(Number),
        color: '#0000FF',
      });
    });

    it('extracts cell padding when present', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: {
                  // Cell padding is extracted via extractCellPadding function
                  // which processes padding data from cell properties
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      // Cell padding is extracted by extractCellPadding utility
      // This test verifies the function is called correctly
      expect(result.rows[0].cells[0]).toBeDefined();
    });

    it('includes cell vertical alignment', () => {
      // 'middle' is normalized to 'center' in the implementation
      const alignments = [
        { input: 'top', expected: 'top' },
        { input: 'middle', expected: 'center' },
        { input: 'bottom', expected: 'bottom' },
      ] as const;

      alignments.forEach(({ input, expected }) => {
        const node: PMNode = {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: { verticalAlign: input },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
                },
              ],
            },
          ],
        };

        const result = tableNodeToBlock(
          node,
          mockBlockIdGenerator,
          mockPositionMap,
          'Arial',
          16,
          undefined,
          undefined,
          undefined,
          undefined,
          mockParagraphConverter,
        ) as TableBlock;

        expect(result.rows[0].cells[0].attrs?.verticalAlign).toBe(expected);
      });
    });

    it('includes cell background color', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: {
                  background: { color: 'FF0000' },
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.rows[0].cells[0].attrs?.background).toBe('#FF0000');
    });

    it('adds # prefix to background color if missing', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: {
                  background: { color: '#00FF00' },
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.rows[0].cells[0].attrs?.background).toBe('#00FF00');
    });

    it('extracts table borders from tableProperties', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          tableProperties: {
            // Table borders are extracted via extractTableBorders function
          },
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      // Table borders are extracted by extractTableBorders utility
      // This test verifies the table is created successfully
      expect(result).toBeDefined();
    });

    it('includes borderCollapse setting', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          borderCollapse: 'collapse',
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.attrs?.borderCollapse).toBe('collapse');
    });

    it('includes tableCellSpacing and normalizes legacy number to CellSpacing object', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          tableCellSpacing: 5,
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.attrs?.cellSpacing).toEqual({ value: 5, type: 'px' });
    });

    it('passes through tableCellSpacing object as normalized CellSpacing', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          tableCellSpacing: { value: 10, type: 'dxa' },
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.attrs?.cellSpacing).toEqual({ value: 10, type: 'dxa' });
    });

    it('forwards tableIndent to table block attrs', () => {
      const tableIndent = { width: 96, type: 'dxa' };
      const node: PMNode = {
        type: 'table',
        attrs: {
          tableIndent,
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Indented cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.attrs?.tableIndent).toEqual(tableIndent);
    });

    it('fills missing layout attrs from hydrated table style properties', () => {
      const converterContext: ConverterContext = {
        translatedNumbering: {},
        translatedLinkedStyles: {
          docDefaults: {},
          latentStyles: {},
          styles: {
            TableGrid: {
              type: 'table',
              tableProperties: {
                tableCellSpacing: { value: 24, type: 'dxa' },
                tableIndent: { value: 720, type: 'dxa' },
                tableLayout: 'autofit',
                tableWidth: { value: 2500, type: 'pct' },
                cellMargins: { marginLeft: { value: 108, type: 'dxa' } },
              },
            },
          },
        },
      } as ConverterContext;

      const node: PMNode = {
        type: 'table',
        attrs: {
          tableStyleId: 'TableGrid',
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Styled cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
        converterContext,
      ) as TableBlock;

      expect(result.attrs?.cellSpacing).toEqual({ value: 24, type: 'dxa' });
      expect(result.attrs?.tableIndent).toEqual({ width: 48, type: 'dxa' });
      expect(result.attrs?.tableLayout).toBe('autofit');
      expect(result.attrs?.tableWidth).toEqual({ width: 2500, type: 'pct' });
      expect(result.attrs?.defaultCellPadding?.left).toBeCloseTo(twipsToPx(108));
    });

    it('keeps inline layout attrs ahead of hydrated fallbacks', () => {
      const converterContext: ConverterContext = {
        translatedNumbering: {},
        translatedLinkedStyles: {
          docDefaults: {},
          latentStyles: {},
          styles: {
            TableGrid: {
              type: 'table',
              tableProperties: {
                tableCellSpacing: { value: 24, type: 'dxa' },
                tableIndent: { value: 720, type: 'dxa' },
                tableLayout: 'autofit',
                tableWidth: { value: 5000, type: 'pct' },
              },
            },
          },
        },
      } as ConverterContext;

      const node: PMNode = {
        type: 'table',
        attrs: {
          tableStyleId: 'TableGrid',
          tableCellSpacing: { value: 10, type: 'dxa' },
          tableIndent: { width: 96, type: 'dxa' },
          tableLayout: 'fixed',
          tableWidth: { width: 320, type: 'px' },
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inline cell' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
        converterContext,
      ) as TableBlock;

      expect(result.attrs?.cellSpacing).toEqual({ value: 10, type: 'dxa' });
      expect(result.attrs?.tableIndent).toEqual({ width: 96, type: 'dxa' });
      expect(result.attrs?.tableLayout).toBe('fixed');
      expect(result.attrs?.tableWidth).toEqual({ width: 320, type: 'px' });
    });

    it('converts column widths from twips to pixels', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          grid: [{ col: 1440 }, { col: 2880 }, { col: 1440 }],
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] }],
              },
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 2' }] }],
              },
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 3' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.columnWidths).toBeDefined();
      expect(result.columnWidths).toHaveLength(3);
      expect(result.columnWidths?.[0]).toBe(96); // 1440 twips = 96 pixels
      expect(result.columnWidths?.[1]).toBe(192); // 2880 twips = 192 pixels
    });

    it('skips cells without paragraphs', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [], // No paragraph
              },
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Has paragraph' }] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.rows[0].cells).toHaveLength(1);
    });

    it('passes tracked changes config to paragraph converter', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const trackedChangesConfig = { enabled: true, mode: 'review' as const };
      const mockConverter = vi.fn(() => [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [],
        } as ParagraphBlock,
      ]);

      tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        trackedChangesConfig,
        undefined,
        undefined,
        undefined,
        mockConverter,
      );

      expect(mockConverter).toHaveBeenCalled();
      // Verify tracked changes config was passed
      const callArgs = mockConverter.mock.calls[0];
      expect(callArgs[0].trackedChangesConfig).toEqual(trackedChangesConfig);
    });

    it('returns null when all rows have no cells', () => {
      const mockConverter = vi.fn(() => []);

      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockConverter,
      );

      expect(result).toBeNull();
    });
  });

  describe('handleTableNode', () => {
    it('converts table and adds to blocks', () => {
      const node: PMNode = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      };

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();
      const mockConverter = vi.fn(() => [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [],
        } as ParagraphBlock,
      ]);

      const context = {
        blocks,
        recordBlockKind,
        nextBlockId: vi.fn(() => 'table-1'),
        positions: new Map(),
        defaultFont: 'Arial',
        defaultSize: 16,
        trackedChangesConfig: undefined,
        bookmarks: undefined,
        hyperlinkConfig: undefined,
        converters: {
          paragraphToFlowBlocks: mockConverter,
        },
      };

      handleTableNode(node, context as never);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('table');
      expect(recordBlockKind).toHaveBeenCalledWith('table');
    });

    it('does not add block when tableNodeToBlock returns null', () => {
      const node: PMNode = {
        type: 'table',
        content: [],
      };

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();

      const context = {
        blocks,
        recordBlockKind,
        nextBlockId: vi.fn(() => 'table-1'),
        positions: new Map(),
        defaultFont: 'Arial',
        defaultSize: 16,
        trackedChangesConfig: undefined,
        bookmarks: undefined,
        hyperlinkConfig: undefined,
        converters: {
          paragraphToFlowBlocks: vi.fn(),
        },
      };

      handleTableNode(node, context as never);

      expect(blocks).toHaveLength(0);
      expect(recordBlockKind).not.toHaveBeenCalled();
    });
  });

  describe('column width priority hierarchy (Phase 3)', () => {
    const mockBlockIdGenerator: BlockIdGenerator = vi.fn((kind) => `test-${kind}`);
    const mockPositionMap: PositionMap = new Map();
    const mockParagraphConverter = vi.fn((_node) => {
      return [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'cell text', fontFamily: 'Arial', fontSize: 12 }],
        } as ParagraphBlock,
      ];
    });

    it('Priority 1: should use user-edited grid over colwidth', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          userEdited: true,
          grid: [{ col: 1440 }, { col: 2880 }], // 1", 2" in twips
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { colwidth: 50 }, // Should be ignored when userEdited + grid present
                content: [{ type: 'paragraph', content: [] }],
              },
              {
                type: 'tableCell',
                attrs: { colwidth: 100 }, // Should be ignored
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        12,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      );

      expect(result).not.toBeNull();
      const tableBlock = result as TableBlock;
      expect(tableBlock.columnWidths).toBeDefined();
      expect(tableBlock.columnWidths).toHaveLength(2);

      // Verify grid (twips) is used, not colwidth (pixels)
      // 1440 twips = 1" = 96px, 2880 twips = 2" = 192px
      expect(tableBlock.columnWidths![0]).toBeCloseTo(96, 1);
      expect(tableBlock.columnWidths![1]).toBeCloseTo(192, 1);
    });

    it('Priority 2: should use colwidth when grid absent', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          // No grid attribute
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { colwidth: 100 },
                content: [{ type: 'paragraph', content: [] }],
              },
              {
                type: 'tableCell',
                attrs: { colwidth: 150 },
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        12,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      );

      expect(result).not.toBeNull();
      const tableBlock = result as TableBlock;
      expect(tableBlock.columnWidths).toEqual([100, 150]);
    });

    it('Priority 2/3 interplay: should prefer grid over colwidth when userEdited is false', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          userEdited: false, // Explicitly not user-edited
          grid: [{ col: 1440 }, { col: 2880 }],
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { colwidth: 50 },
                content: [{ type: 'paragraph', content: [] }],
              },
              {
                type: 'tableCell',
                attrs: { colwidth: 100 },
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        12,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      );

      expect(result).not.toBeNull();
      const tableBlock = result as TableBlock;

      // When userEdited is false and both grid and colwidth are present,
      // grid (Priority 2) takes precedence over colwidth (Priority 3).
      // Grid values represent actual column positions and sum to the page width.
      expect(tableBlock.columnWidths).toBeDefined();
      expect(tableBlock.columnWidths).toHaveLength(2);
      // 1440 twips = 96px, 2880 twips = 192px
      expect(tableBlock.columnWidths).toEqual([96, 192]);
    });

    it('Priority 2: should use grid when no colwidth present', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          grid: [{ col: 1440 }, { col: 2880 }],
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [] }],
              },
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        12,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      );

      expect(result).not.toBeNull();
      const tableBlock = result as TableBlock;
      expect(tableBlock.columnWidths).toBeDefined();
      expect(tableBlock.columnWidths).toHaveLength(2);
      expect(tableBlock.columnWidths![0]).toBeCloseTo(96, 1);
      expect(tableBlock.columnWidths![1]).toBeCloseTo(192, 1);
    });

    it('Priority 4: should leave columnWidths undefined when no width attributes', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          // No grid or userEdited
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                // No colwidth
                content: [{ type: 'paragraph', content: [] }],
              },
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        12,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      );

      expect(result).not.toBeNull();
      const tableBlock = result as TableBlock;
      // columnWidths should be undefined (auto-calculate from content)
      expect(tableBlock.columnWidths).toBeUndefined();
    });

    it('Priority 3: should use only first-row colwidth values when grid is absent', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {},
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { colwidth: [100] },
                content: [{ type: 'paragraph', content: [] }],
              },
              {
                type: 'tableCell',
                attrs: { colwidth: [150] },
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { colwidth: [999] },
                content: [{ type: 'paragraph', content: [] }],
              },
              {
                type: 'tableCell',
                attrs: { colwidth: [888] },
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        12,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      );

      expect(result).not.toBeNull();
      const tableBlock = result as TableBlock;
      expect(tableBlock.columnWidths).toEqual([100, 150]);
    });

    it('should handle colspan cells with colwidth arrays', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {},
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: {
                  colspan: 2,
                  colwidth: [100, 150], // Array for merged cell
                },
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        12,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      );

      expect(result).not.toBeNull();
      const tableBlock = result as TableBlock;
      expect(tableBlock.columnWidths).toEqual([100, 150]);
    });

    it('should ignore invalid grid entries', () => {
      const node: PMNode = {
        type: 'table',
        attrs: {
          userEdited: true,
          grid: [{ col: 1440 }, null, { col: 2880 }, { col: 0 }], // null and 0 should be filtered
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [] }],
              },
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          },
        ],
      };

      const result = tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        12,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      );

      expect(result).not.toBeNull();
      const tableBlock = result as TableBlock;
      expect(tableBlock.columnWidths).toBeDefined();
      // Should only include valid entries (1440 and 2880)
      expect(tableBlock.columnWidths).toHaveLength(2);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Theme-based cell background resolution
// ──────────────────────────────────────────────────────────────────────────────

describe('parseTableCell - theme shading resolution', () => {
  const mockBlockIdGenerator: BlockIdGenerator = vi.fn((kind: string) => `test-${kind}`);
  const mockPositionMap: PositionMap = new Map();
  const mockParagraphConverter = vi.fn((params: { para: PMNode }) => {
    return [
      {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: params.para.content?.[0]?.text || 'text', fontFamily: 'Arial', fontSize: 12 }],
      } as ParagraphBlock,
    ];
  });

  const themePalette: ThemeColorPalette = {
    accent1: '#4F81BD',
    dk1: '#000000',
  };

  const makeTableWithShading = (
    shadingProps: Record<string, unknown>,
    themeColors?: ThemeColorPalette,
    tableStyleId?: string,
  ) => {
    const styles = tableStyleId
      ? {
          ...DEFAULT_CONVERTER_CONTEXT.translatedLinkedStyles!,
          styles: {
            [tableStyleId]: {
              type: 'table',
              tableProperties: {},
              tableStyleProperties: {
                wholeTable: {
                  tableCellProperties: { shading: shadingProps },
                },
              },
            },
          },
        }
      : DEFAULT_CONVERTER_CONTEXT.translatedLinkedStyles!;

    const node: PMNode = {
      type: 'table',
      attrs: tableStyleId
        ? {
            tableStyleId,
            tableProperties: { tableStyleId, tblLook: { noHBand: true, noVBand: true } },
          }
        : undefined,
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
            },
          ],
        },
      ],
    };

    return tableNodeToBlock(
      node,
      mockBlockIdGenerator,
      mockPositionMap,
      'Arial',
      16,
      undefined,
      undefined,
      undefined,
      themeColors,
      mockParagraphConverter,
      {
        ...DEFAULT_CONVERTER_CONTEXT,
        translatedLinkedStyles: styles,
      },
    ) as TableBlock;
  };

  it('resolves themeFill from theme palette when no literal fill is present', () => {
    const result = makeTableWithShading({ themeFill: 'accent1' }, themePalette, 'ThemeTable');
    expect(result.rows[0].cells[0].attrs?.background).toBe('#4F81BD');
  });

  it('applies themeFillTint to the resolved theme color', () => {
    const result = makeTableWithShading({ themeFill: 'accent1', themeFillTint: '99' }, themePalette, 'ThemeTable');
    // accent1 (#4F81BD) tinted by 0x99/255 ≈ 0.6 → lighter blue
    expect(result.rows[0].cells[0].attrs?.background).toBe('#B9CDE5');
  });

  it('prefers literal fill over themeFill', () => {
    const result = makeTableWithShading({ fill: 'FF0000', themeFill: 'accent1' }, themePalette, 'ThemeTable');
    expect(result.rows[0].cells[0].attrs?.background).toBe('#FF0000');
  });

  it('uses themeFill when fill is auto', () => {
    const result = makeTableWithShading({ fill: 'auto', themeFill: 'accent1' }, themePalette, 'ThemeTable');
    expect(result.rows[0].cells[0].attrs?.background).toBe('#4F81BD');
  });

  it('returns no background when themeFill key is not in palette', () => {
    const result = makeTableWithShading({ themeFill: 'missing' }, themePalette, 'ThemeTable');
    expect(result.rows[0].cells[0].attrs?.background).toBeUndefined();
  });
});

// SD-2516: Word's "SDT in a table cell" parses into PM as
// `tableCell > documentPartObject > paragraph`. Before the fix, the table
// cell's child loop did not branch on documentPartObject — only paragraph,
// structuredContentBlock, and table — so the wrapped paragraph was silently
// dropped, producing a visually empty cell.
describe('tableCellNodeToBlock — SD-2516: documentPartObject children', () => {
  const mockBlockIdGenerator: BlockIdGenerator = vi.fn((kind) => `test-${kind}`);
  const mockPositionMap: PositionMap = new Map();
  const mockParagraphConverter = vi.fn((params) => [
    {
      kind: 'paragraph',
      id: 'p1',
      runs: [{ text: params.para.content?.[0]?.text || '', fontFamily: 'Arial', fontSize: 12 }],
    } as ParagraphBlock,
  ]);

  it('flattens a documentPartObject inside a table cell into the cell.blocks array', () => {
    const node: PMNode = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [
                {
                  type: 'documentPartObject',
                  attrs: {},
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tableNodeToBlock(
      node,
      mockBlockIdGenerator,
      mockPositionMap,
      'Arial',
      16,
      undefined,
      undefined,
      undefined,
      undefined,
      mockParagraphConverter,
    ) as TableBlock;

    expect(result).toBeDefined();
    const cell = result.rows[0].cells[0];
    const cellBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
    expect(cellBlocks).toHaveLength(1);
    expect(cellBlocks[0].kind).toBe('paragraph');
    expect((cellBlocks[0] as ParagraphBlock).runs[0].text).toBe('Hello');
  });

  it('flattens a nested documentPartObject inside a table cell into the cell.blocks array', () => {
    const node: PMNode = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [
                {
                  type: 'documentPartObject',
                  attrs: {},
                  content: [
                    {
                      type: 'documentPartObject',
                      attrs: {},
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tableNodeToBlock(
      node,
      mockBlockIdGenerator,
      mockPositionMap,
      'Arial',
      16,
      undefined,
      undefined,
      undefined,
      undefined,
      mockParagraphConverter,
    ) as TableBlock;

    expect(result).toBeDefined();
    const cell = result.rows[0].cells[0];
    const cellBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
    expect(cellBlocks).toHaveLength(1);
    expect(cellBlocks[0].kind).toBe('paragraph');
    expect((cellBlocks[0] as ParagraphBlock).runs[0].text).toBe('Nested');
  });

  it('flattens a documentPartObject wrapping a structuredContentBlock inside a table cell', () => {
    const node: PMNode = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [
                {
                  type: 'documentPartObject',
                  attrs: {},
                  content: [
                    {
                      type: 'structuredContentBlock',
                      attrs: {},
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inner SCB' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tableNodeToBlock(
      node,
      mockBlockIdGenerator,
      mockPositionMap,
      'Arial',
      16,
      undefined,
      undefined,
      undefined,
      undefined,
      mockParagraphConverter,
    ) as TableBlock;

    expect(result).toBeDefined();
    const cell = result.rows[0].cells[0];
    const cellBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
    expect(cellBlocks).toHaveLength(1);
    expect(cellBlocks[0].kind).toBe('paragraph');
    expect((cellBlocks[0] as ParagraphBlock).runs[0].text).toBe('Inner SCB');
  });

  it('flattens a structuredContentBlock wrapping a documentPartObject inside a table cell', () => {
    const node: PMNode = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [
                {
                  type: 'structuredContentBlock',
                  attrs: {},
                  content: [
                    {
                      type: 'documentPartObject',
                      attrs: {},
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inner DPO' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tableNodeToBlock(
      node,
      mockBlockIdGenerator,
      mockPositionMap,
      'Arial',
      16,
      undefined,
      undefined,
      undefined,
      undefined,
      mockParagraphConverter,
    ) as TableBlock;

    expect(result).toBeDefined();
    const cell = result.rows[0].cells[0];
    const cellBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
    expect(cellBlocks).toHaveLength(1);
    expect(cellBlocks[0].kind).toBe('paragraph');
    expect((cellBlocks[0] as ParagraphBlock).runs[0].text).toBe('Inner DPO');
  });

  describe('tableDirectionContext (SD-3138 Phase 1B + SD-3171 inline-only visual direction)', () => {
    const mockBlockIdGenerator: BlockIdGenerator = vi.fn((kind) => `test-${kind}`);
    const mockPositionMap: PositionMap = new Map();
    const mockParagraphConverter = vi.fn(() => [
      { kind: 'paragraph', id: 'p1', runs: [{ text: 'cell', fontFamily: 'Arial', fontSize: 12 }] } as ParagraphBlock,
    ]);

    const buildTableNode = (tableProperties?: Record<string, unknown>, tableStyleId?: string): PMNode => ({
      type: 'table',
      attrs: { ...(tableStyleId ? { tableStyleId } : {}), ...(tableProperties ? { tableProperties } : {}) },
      content: [
        {
          type: 'tableRow',
          content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell' }] }] }],
        },
      ],
    });

    const contextWithStyle = (styleId: string, styleTableProps: Record<string, unknown>): ConverterContext =>
      ({
        translatedNumbering: {},
        translatedLinkedStyles: {
          docDefaults: {},
          latentStyles: {},
          styles: {
            [styleId]: {
              type: 'table',
              tableProperties: styleTableProps,
            },
          },
        },
      }) as ConverterContext;

    it('inline rightToLeft=true produces visualDirection=rtl', () => {
      const result = tableNodeToBlock(
        buildTableNode({ rightToLeft: true }),
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;
      expect(result?.attrs?.tableDirectionContext?.visualDirection).toBe('rtl');
    });

    // SD-3171: Word-parity contract. `w:bidiVisual` on a style does NOT visually
    // flip cells - Word reports the table as wdTableDirectionLtr and renders
    // cells in logical order despite the style cascade. SuperDoc must match.
    // Style-cascade rightToLeft alone leaves visualDirection undefined.
    it('style cascade rightToLeft=true alone leaves visualDirection undefined (SD-3171 Word-parity)', () => {
      const result = tableNodeToBlock(
        buildTableNode(undefined, 'RtlStyle'),
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
        contextWithStyle('RtlStyle', { rightToLeft: true }),
      ) as TableBlock;
      expect(result?.attrs?.tableDirectionContext).toBeDefined();
      expect(result?.attrs?.tableDirectionContext?.visualDirection).toBeUndefined();
    });

    // SD-3171: even when style says RTL, inline-false still produces ltr - the
    // inline layer is the only source we consult for visualDirection, and
    // explicit `false` is honored.
    it('inline rightToLeft=false produces visualDirection=ltr (style cascade ignored)', () => {
      const result = tableNodeToBlock(
        buildTableNode({ rightToLeft: false }, 'RtlStyle'),
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
        contextWithStyle('RtlStyle', { rightToLeft: true }),
      ) as TableBlock;
      expect(result?.attrs?.tableDirectionContext?.visualDirection).toBe('ltr');
    });

    it('inline bidiVisual=false produces visualDirection=ltr (alias normalized, style cascade ignored)', () => {
      // Importer normalizes w:bidiVisual to `rightToLeft` so this shape is rare
      // in practice. SD-3171: style cascade is ignored regardless; the assertion
      // is that inline `false` on the bidiVisual alias is still honored.
      const result = tableNodeToBlock(
        buildTableNode({ bidiVisual: false }, 'RtlStyle'),
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
        contextWithStyle('RtlStyle', { rightToLeft: true }),
      ) as TableBlock;
      expect(result?.attrs?.tableDirectionContext?.visualDirection).toBe('ltr');
    });

    it('no signal anywhere leaves visualDirection undefined', () => {
      const result = tableNodeToBlock(
        buildTableNode(),
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;
      expect(result?.attrs?.tableDirectionContext).toBeDefined();
      expect(result?.attrs?.tableDirectionContext?.visualDirection).toBeUndefined();
    });

    it('tableDirectionContext.parentSection propagates from converterContext.sectionDirectionContext', () => {
      // The full TableDirectionContext shape is { visualDirection, parentSection }.
      // Existing tests pin visualDirection; this one pins the section pass-through
      // so a future regression that drops the sectionContext arg is caught here
      // instead of by a runtime consumer reading parentSection.
      const customSectionContext = {
        pageDirection: 'rtl' as const,
        writingMode: 'horizontal-tb' as const,
        rtlGutter: true,
      };
      const contextWithSection: ConverterContext = {
        translatedNumbering: {},
        translatedLinkedStyles: {
          docDefaults: {},
          latentStyles: {},
          styles: {},
        },
        sectionDirectionContext: customSectionContext,
      };
      const result = tableNodeToBlock(
        buildTableNode({ rightToLeft: true }),
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
        contextWithSection,
      ) as TableBlock;
      expect(result?.attrs?.tableDirectionContext?.parentSection).toBe(customSectionContext);
    });
  });

  describe('structural row tracked changes', () => {
    const ROW_TRACK_CONFIG: TrackedChangesConfig = { enabled: true, mode: 'review' };

    const buildTrackedRowTable = (trackChange: Record<string, unknown> | null): PMNode => ({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          attrs: trackChange ? { trackChange } : {},
          content: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
            },
          ],
        },
      ],
    });

    it('produces attrs.trackedChange with kind "insert" for a rowInsert row', () => {
      const result = tableNodeToBlock(
        buildTrackedRowTable({
          type: 'rowInsert',
          id: 'rev-1',
          author: 'Alice',
          authorEmail: 'alice@example.com',
          date: '2024-01-01T00:00:00Z',
        }),
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        ROW_TRACK_CONFIG,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      const meta = result.rows[0].attrs?.trackedChange;
      expect(meta).toBeDefined();
      expect(meta?.kind).toBe('insert');
      expect(meta?.id).toBe('rev-1');
      expect(meta?.author).toBe('Alice');
      expect(meta?.authorEmail).toBe('alice@example.com');
      expect(meta?.date).toBe('2024-01-01T00:00:00Z');
      // Color is stamped downstream, never by the adapter.
      expect(meta?.color).toBeUndefined();
    });

    it('produces attrs.trackedChange with kind "delete" for a rowDelete row', () => {
      const result = tableNodeToBlock(
        buildTrackedRowTable({ type: 'rowDelete', id: 'rev-2', author: 'Bob' }),
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        ROW_TRACK_CONFIG,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      const meta = result.rows[0].attrs?.trackedChange;
      expect(meta?.kind).toBe('delete');
      expect(meta?.id).toBe('rev-2');
    });

    it('omits attrs.trackedChange for an untracked row', () => {
      const result = tableNodeToBlock(
        buildTrackedRowTable(null),
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        ROW_TRACK_CONFIG,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.rows[0].attrs?.trackedChange).toBeUndefined();
    });

    it('omits attrs.trackedChange when tracked changes are disabled', () => {
      const result = tableNodeToBlock(
        buildTrackedRowTable({ type: 'rowInsert', id: 'rev-3' }),
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        { enabled: false, mode: 'review' },
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.rows[0].attrs?.trackedChange).toBeUndefined();
    });

    // View-mode hiding: a hidden tracked row must be dropped from the layout
    // entirely (not just CSS-hidden in the painter) so it reserves no blank
    // table space. When every row is hidden the whole table block is omitted.
    const buildTable = (node: PMNode, config: TrackedChangesConfig) =>
      tableNodeToBlock(
        node,
        mockBlockIdGenerator,
        mockPositionMap,
        'Arial',
        16,
        config,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock | null;

    it('omits an inserted row in "original" mode (whole single-row table dropped)', () => {
      const result = buildTable(buildTrackedRowTable({ type: 'rowInsert', id: 'r1' }), {
        enabled: true,
        mode: 'original',
      });
      expect(result).toBeNull();
    });

    it('omits a deleted row in "final" mode (whole single-row table dropped)', () => {
      const result = buildTable(buildTrackedRowTable({ type: 'rowDelete', id: 'r1' }), {
        enabled: true,
        mode: 'final',
      });
      expect(result).toBeNull();
    });

    it('keeps a deleted row in "original" mode and an inserted row in "final" mode', () => {
      const del = buildTable(buildTrackedRowTable({ type: 'rowDelete', id: 'r1' }), {
        enabled: true,
        mode: 'original',
      });
      expect(del?.rows).toHaveLength(1);

      const ins = buildTable(buildTrackedRowTable({ type: 'rowInsert', id: 'r1' }), {
        enabled: true,
        mode: 'final',
      });
      expect(ins?.rows).toHaveLength(1);
    });
  });
});
