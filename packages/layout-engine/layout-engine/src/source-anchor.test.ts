import { describe, expect, it } from 'bun:test';
import type {
  DrawingFragment,
  FlowBlock,
  ImageFragment,
  Line,
  Measure,
  ParaFragment,
  ParagraphMeasure,
  SourceAnchor,
  TableFragment,
} from '@superdoc/contracts';
import { layoutDocument } from './index.js';

const makeLine = (lineHeight: number): Line => ({
  fromRun: 0,
  fromChar: 0,
  toRun: 0,
  toChar: 1,
  width: 20,
  ascent: lineHeight * 0.8,
  descent: lineHeight * 0.2,
  lineHeight,
});

const makeParagraphMeasure = (heights: number[]): ParagraphMeasure => ({
  kind: 'paragraph',
  lines: heights.map(makeLine),
  totalHeight: heights.reduce((sum, height) => sum + height, 0),
});

describe('layout source anchors', () => {
  it('carries FlowBlock source anchors onto emitted layout fragments', () => {
    const paragraphAnchor: SourceAnchor = {
      sourceNodeId: 'srcnode_para_1',
      occurrenceId: 'occ_para_1',
      rawFactIds: ['raw_para_1'],
      schemaQNames: [{ qName: 'w:p' }],
      anchorConfidence: 'high',
    };
    const tableAnchor: SourceAnchor = {
      sourceNodeId: 'srcnode_table_1',
      occurrenceId: 'occ_table_1',
      rawFactIds: ['raw_table_1'],
      schemaQNames: [{ qName: 'w:tbl' }],
      anchorConfidence: 'high',
    };
    const imageAnchor: SourceAnchor = {
      sourceNodeId: 'srcnode_image_1',
      occurrenceId: 'occ_image_1',
      rawFactIds: ['raw_image_1'],
      schemaQNames: [{ qName: 'w:drawing' }],
      anchorConfidence: 'high',
    };
    const drawingAnchor: SourceAnchor = {
      sourceNodeId: 'srcnode_drawing_1',
      occurrenceId: 'occ_drawing_1',
      rawFactIds: ['raw_drawing_1'],
      schemaQNames: [{ qName: 'wp:inline' }],
      anchorConfidence: 'high',
    };

    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'paragraph-1',
        runs: [{ text: 'A', fontFamily: 'Arial', fontSize: 12 }],
        sourceAnchor: paragraphAnchor,
      },
      {
        kind: 'table',
        id: 'table-1',
        sourceAnchor: tableAnchor,
        rows: [
          {
            id: 'row-1',
            cells: [
              {
                id: 'cell-1',
                paragraph: {
                  kind: 'paragraph',
                  id: 'cell-paragraph-1',
                  runs: [],
                },
              },
            ],
          },
        ],
      },
      {
        kind: 'image',
        id: 'image-1',
        src: 'data:image/png;base64,',
        width: 24,
        height: 16,
        sourceAnchor: imageAnchor,
      },
      {
        kind: 'drawing',
        id: 'drawing-1',
        drawingKind: 'vectorShape',
        sourceAnchor: drawingAnchor,
      } as FlowBlock,
    ];

    const measures: Measure[] = [
      makeParagraphMeasure([14]),
      {
        kind: 'table',
        rows: [{ height: 18, cells: [{ paragraph: makeParagraphMeasure([18]), width: 80, height: 18 }] }],
        columnWidths: [80],
        totalWidth: 80,
        totalHeight: 18,
      },
      { kind: 'image', width: 24, height: 16 },
      {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        width: 30,
        height: 20,
        scale: 1,
        naturalWidth: 30,
        naturalHeight: 20,
        geometry: { x: 0, y: 0, width: 30, height: 20 },
      } as Measure,
    ];

    const layout = layoutDocument(blocks, measures, {
      pageSize: { w: 300, h: 300 },
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    });

    const fragments = layout.pages.flatMap((page) => page.fragments);
    expect((fragments.find((fragment) => fragment.blockId === 'paragraph-1') as ParaFragment).sourceAnchor).toEqual(
      paragraphAnchor,
    );
    expect((fragments.find((fragment) => fragment.blockId === 'table-1') as TableFragment).sourceAnchor).toEqual(
      tableAnchor,
    );
    expect((fragments.find((fragment) => fragment.blockId === 'image-1') as ImageFragment).sourceAnchor).toEqual(
      imageAnchor,
    );
    expect((fragments.find((fragment) => fragment.blockId === 'drawing-1') as DrawingFragment).sourceAnchor).toEqual(
      drawingAnchor,
    );
  });
});
