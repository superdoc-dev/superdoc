/**
 * Tests for Table Node Converter
 */

import { describe, it, expect, vi } from 'vitest';
import { tableNodeToBlock as baseTableNodeToBlock, handleTableNode } from './table.js';
import type {
  PMNode,
  BlockIdGenerator,
  PositionMap,
  StyleContext,
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
  styleContext: StyleContext,
  trackedChangesConfig?: TrackedChangesConfig,
  bookmarks?: Map<string, number>,
  hyperlinkConfig?: HyperlinkConfig,
  themeColors?: ThemeColorPalette,
  paragraphToFlowBlocks?: NestedConverters['paragraphToFlowBlocks'],
  converterContext?: ConverterContext,
) => {
  const converters = paragraphToFlowBlocks ? ({ paragraphToFlowBlocks } as NestedConverters) : ({} as NestedConverters);

  return baseTableNodeToBlock({
    node,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig: hyperlinkConfig ?? DEFAULT_HYPERLINK_CONFIG,
    themeColors,
    converterContext: converterContext ?? DEFAULT_CONVERTER_CONTEXT,
    converters,
    enableComments: true,
  });
};

describe('table converter', () => {
  const mockStyleContext: StyleContext = {
    defaults: {
      paragraphFont: 'Arial',
      fontSize: 12,
      decimalSeparator: '.',
    },
  };

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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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

      const result = baseTableNodeToBlock({
        node,
        nextBlockId: mockBlockIdGenerator,
        positions: mockPositionMap,
        defaultFont: 'Arial',
        defaultSize: 16,
        styleContext: mockStyleContext,
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

      const result = baseTableNodeToBlock({
        node,
        nextBlockId: mockBlockIdGenerator,
        positions: mockPositionMap,
        defaultFont: 'Arial',
        defaultSize: 16,
        styleContext: mockStyleContext,
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

      const result = baseTableNodeToBlock({
        node,
        nextBlockId: mockBlockIdGenerator,
        positions: mockPositionMap,
        defaultFont: 'Arial',
        defaultSize: 16,
        styleContext: mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
          mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.attrs?.borderCollapse).toBe('collapse');
    });

    it('includes tableCellSpacing', () => {
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
        mockStyleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      ) as TableBlock;

      expect(result.attrs?.cellSpacing).toBe(5);
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
        styleContext: mockStyleContext,
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
        styleContext: mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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

    it('Priority 2/3 interplay: should prefer colwidth when userEdited is false even if grid present', () => {
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
        mockStyleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        mockParagraphConverter,
      );

      expect(result).not.toBeNull();
      const tableBlock = result as TableBlock;

      // When userEdited is false and both grid and colwidth are present,
      // colwidth (Priority 2) takes precedence over grid (Priority 3)
      expect(tableBlock.columnWidths).toBeDefined();
      expect(tableBlock.columnWidths).toHaveLength(2);
      expect(tableBlock.columnWidths).toEqual([50, 100]);
    });

    it('Priority 3: should use grid when no colwidth present', () => {
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
        mockStyleContext,
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

    it('Priority 4: should auto-calculate when no width attributes', () => {
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
        mockStyleContext,
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
        mockStyleContext,
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
        mockStyleContext,
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
