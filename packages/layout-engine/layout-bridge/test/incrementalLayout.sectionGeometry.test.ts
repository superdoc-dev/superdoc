import { describe, expect, it } from 'vite-plus/test';
import type {
  DrawingBlock,
  DrawingMeasure,
  FlowBlock,
  Line,
  ParagraphMeasure,
  SectionBreakBlock,
} from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout.js';

const makeLine = (lineHeight: number): Line => ({
  fromRun: 0,
  fromChar: 0,
  toRun: 0,
  toChar: 0,
  width: 100,
  ascent: lineHeight * 0.8,
  descent: lineHeight * 0.2,
  lineHeight,
});

const makeMeasure = (heights: number[]): ParagraphMeasure => ({
  kind: 'paragraph',
  lines: heights.map(makeLine),
  totalHeight: heights.reduce((sum, h) => sum + h, 0),
});

const makeDrawingMeasure = (width: number, height: number): DrawingMeasure => ({
  kind: 'drawing',
  drawingKind: 'vectorShape',
  width,
  height,
  scale: 1,
  naturalWidth: width,
  naturalHeight: height,
  geometry: { width, height },
});

describe('incrementalLayout section geometry', () => {
  it('uses leading source section geometry for page 1 with page furniture enabled', async () => {
    const sectionBreak: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb-source',
      pageSize: { w: 793.73, h: 1122.53 },
      margins: { top: 113.4, right: 75.6, bottom: 94.53, left: 75.6, header: 0, footer: 3.8 },
    };
    const paragraph: FlowBlock = { kind: 'paragraph', id: 'p1', runs: [] };

    const result = await incrementalLayout(
      [],
      null,
      [sectionBreak, paragraph],
      {
        pageSize: { w: 816, h: 1056 },
        margins: { top: 96, right: 96, bottom: 96, left: 96 },
      },
      async () => makeMeasure([20]),
      {
        constraints: {
          width: 624,
          height: 864,
          pageWidth: 816,
          pageHeight: 1056,
          margins: { top: 96, right: 96, bottom: 96, left: 96, header: 48, footer: 48 },
          overflowBaseHeight: 864,
        },
        headerBlocksByRId: new Map(),
        footerBlocksByRId: new Map(),
      },
    );

    expect(result.layout.pages[0].size).toEqual({ w: 793.73, h: 1122.53 });
    expect(result.layout.pages[0].margins).toMatchObject({
      top: 113.4,
      right: 75.6,
      bottom: 94.53,
      left: 75.6,
      header: 0,
      footer: 3.8,
    });
    expect(result.layout.pages[0].fragments[0]).toMatchObject({ blockId: 'p1', x: 75.6, y: 113.4 });
  });

  it('uses leading source section geometry before pre-registering page-relative anchors', async () => {
    const sectionBreak: SectionBreakBlock = {
      kind: 'sectionBreak',
      id: 'sb-source',
      pageSize: { w: 793.73, h: 1122.53 },
      margins: { top: 113.4, right: 75.6, bottom: 94.53, left: 75.6, header: 0, footer: 3.8 },
    };
    const anchoredDrawing: DrawingBlock = {
      kind: 'drawing',
      id: 'drawing-page-relative',
      drawingKind: 'vectorShape',
      geometry: { width: 120, height: 80 },
      anchor: {
        isAnchored: true,
        hRelativeFrom: 'page',
        vRelativeFrom: 'page',
        offsetH: 478,
        offsetV: 47.333,
      },
      wrap: { type: 'Square' },
    };
    const paragraph: FlowBlock = { kind: 'paragraph', id: 'p1', runs: [] };

    const result = await incrementalLayout(
      [],
      null,
      [sectionBreak, anchoredDrawing, paragraph],
      {
        pageSize: { w: 816, h: 1056 },
        margins: { top: 96, right: 96, bottom: 96, left: 96 },
      },
      async (block) => (block.kind === 'drawing' ? makeDrawingMeasure(120, 80) : makeMeasure([20])),
      {
        constraints: {
          width: 624,
          height: 864,
          pageWidth: 816,
          pageHeight: 1056,
          margins: { top: 96, right: 96, bottom: 96, left: 96, header: 48, footer: 48 },
          overflowBaseHeight: 864,
        },
        headerBlocksByRId: new Map(),
        footerBlocksByRId: new Map(),
      },
    );

    expect(result.layout.pages[0].size).toEqual({ w: 793.73, h: 1122.53 });
    expect(result.layout.pages[0].margins).toMatchObject({
      top: 113.4,
      right: 75.6,
      bottom: 94.53,
      left: 75.6,
      header: 0,
      footer: 3.8,
    });
    expect(
      result.layout.pages[0].fragments.find((fragment) => fragment.blockId === 'drawing-page-relative'),
    ).toMatchObject({
      x: 478,
      y: 47.333,
    });
    expect(result.layout.pages[0].fragments.find((fragment) => fragment.blockId === 'p1')).toMatchObject({
      x: 75.6,
      y: 113.4,
    });
  });
});
