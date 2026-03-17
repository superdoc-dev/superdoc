/**
 * Tests for Chart Node Converter
 */

import { describe, it, expect, vi } from 'vitest';
import { chartNodeToDrawingBlock, handleChartNode } from './chart.js';
import type { PMNode, BlockIdGenerator, PositionMap, NodeHandlerContext } from '../types.js';
import type { ChartDrawing } from '@superdoc/contracts';

const mockBlockIdGenerator: BlockIdGenerator = vi.fn((kind) => `test-${kind}-id`);
const mockPositionMap: PositionMap = new Map();

function makeNode(attrs: Record<string, unknown> = {}): PMNode {
  return { type: 'chart', attrs };
}

describe('chartNodeToDrawingBlock', () => {
  it('produces a chart drawing block with valid chartData', () => {
    const chartData = { chartType: 'barChart', series: [{ name: 'S1', categories: ['A'], values: [10] }] };
    const node = makeNode({
      chartData,
      width: 500,
      height: 400,
      chartRelId: 'rId1',
      chartPartPath: 'word/charts/chart1.xml',
    });

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

    expect(result.kind).toBe('drawing');
    expect(result.drawingKind).toBe('chart');
    expect(result.chartData).toBe(chartData);
    expect(result.chartRelId).toBe('rId1');
    expect(result.chartPartPath).toBe('word/charts/chart1.xml');
    expect(result.geometry.width).toBe(500);
    expect(result.geometry.height).toBe(400);
  });

  it('uses EMPTY_CHART_DATA sentinel when chartData is null', () => {
    const node = makeNode({ chartData: null, width: 300, height: 200 });

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

    expect(result.drawingKind).toBe('chart');
    expect(result.chartData.chartType).toBe('unknown');
    expect(result.chartData.series).toEqual([]);
  });

  it('uses EMPTY_CHART_DATA sentinel when chartData is not an object', () => {
    const node = makeNode({ chartData: 'invalid' });

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

    expect(result.chartData.chartType).toBe('unknown');
  });

  it('defaults width to 400 and height to 300 when not provided', () => {
    const node = makeNode({ chartData: { chartType: 'pieChart', series: [] } });

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

    expect(result.geometry.width).toBe(400);
    expect(result.geometry.height).toBe(300);
  });

  it('coerces invalid width/height to defaults', () => {
    const node = makeNode({ chartData: { chartType: 'lineChart', series: [] }, width: -10, height: 'bad' });

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

    expect(result.geometry.width).toBe(400);
    expect(result.geometry.height).toBe(300);
  });

  it('omits chartRelId and chartPartPath when not strings', () => {
    const node = makeNode({ chartData: { chartType: 'barChart', series: [] }, chartRelId: 123, chartPartPath: null });

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

    expect(result.chartRelId).toBeUndefined();
    expect(result.chartPartPath).toBeUndefined();
  });

  it('normalizes wrap configuration', () => {
    const node = makeNode({
      chartData: { chartType: 'barChart', series: [] },
      wrap: { type: 'Square', attrs: { wrapText: 'bothSides', distTop: 10 } },
      isAnchor: true,
    });

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

    expect(result.wrap).toBeDefined();
    expect(result.wrap!.type).toBe('Square');
    expect(result.wrap!.wrapText).toBe('bothSides');
    expect(result.wrap!.distTop).toBe(10);
  });

  it('ignores Inline wrap type', () => {
    const node = makeNode({
      chartData: { chartType: 'barChart', series: [] },
      wrap: { type: 'Inline', attrs: {} },
    });

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

    expect(result.wrap).toBeUndefined();
  });

  it('normalizes anchor data with marginOffset for offsetH/offsetV', () => {
    const node = makeNode({
      chartData: { chartType: 'barChart', series: [] },
      isAnchor: true,
      anchorData: { hRelativeFrom: 'column', vRelativeFrom: 'paragraph' },
      marginOffset: { horizontal: 72, top: 36 },
    });

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

    expect(result.anchor).toBeDefined();
    expect(result.anchor!.isAnchored).toBe(true);
    expect(result.anchor!.hRelativeFrom).toBe('column');
    expect(result.anchor!.vRelativeFrom).toBe('paragraph');
    expect(result.anchor!.offsetH).toBe(72);
    expect(result.anchor!.offsetV).toBe(36);
  });

  it('produces no anchor when anchorData is absent and isAnchor is false', () => {
    const node = makeNode({ chartData: { chartType: 'barChart', series: [] } });

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

    expect(result.anchor).toBeUndefined();
  });

  it('converts marginOffset to margin BoxSpacing', () => {
    const node = makeNode({
      chartData: { chartType: 'barChart', series: [] },
      marginOffset: { horizontal: 50, top: 25 },
    });

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

    expect(result.margin).toBeDefined();
  });

  it('includes pmStart/pmEnd when position is available', () => {
    const node = makeNode({ chartData: { chartType: 'barChart', series: [] } });
    const posMap: PositionMap = new Map([[node, { start: 10, end: 11 }]]);

    const result = chartNodeToDrawingBlock(node, mockBlockIdGenerator, posMap);

    expect(result.attrs.pmStart).toBe(10);
    expect(result.attrs.pmEnd).toBe(11);
  });
});

describe('handleChartNode', () => {
  it('pushes a chart drawing block to context.blocks', () => {
    const blocks: ChartDrawing[] = [];
    const recordBlockKind = vi.fn();
    const context = {
      blocks,
      recordBlockKind,
      nextBlockId: mockBlockIdGenerator,
      positions: mockPositionMap,
    } as unknown as NodeHandlerContext;

    const node = makeNode({ chartData: { chartType: 'barChart', series: [] } });
    handleChartNode(node, context);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].drawingKind).toBe('chart');
    expect(recordBlockKind).toHaveBeenCalledWith('drawing');
  });
});
