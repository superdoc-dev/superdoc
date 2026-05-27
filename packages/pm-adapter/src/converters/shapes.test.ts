/**
 * Tests for Shape Node Converter
 */

import { describe, it, expect, vi } from 'vitest';
import {
  vectorShapeNodeToDrawingBlock,
  shapeGroupNodeToDrawingBlock,
  shapeContainerNodeToDrawingBlock,
  shapeTextboxNodeToDrawingBlock,
  handleVectorShapeNode,
  handleShapeGroupNode,
  handleShapeContainerNode,
  handleShapeTextboxNode,
} from './shapes.js';
import type { PMNode, BlockIdGenerator, PositionMap } from '../types.js';
import type { DrawingBlock } from '@superdoc/contracts';

describe('shapes converter', () => {
  const mockBlockIdGenerator: BlockIdGenerator = vi.fn((kind) => `test-${kind}-id`);
  const mockPositionMap: PositionMap = new Map();

  describe('vectorShapeNodeToDrawingBlock', () => {
    it('converts basic vector shape node', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 200,
          height: 150,
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

      expect(result).toBeDefined();
      expect(result?.kind).toBe('drawing');
      expect(result?.drawingKind).toBe('vectorShape');
      expect(result?.geometry.width).toBe(200);
      expect(result?.geometry.height).toBe(150);
      expect(result?.geometry.rotation).toBe(0);
      expect(result?.geometry.flipH).toBe(false);
      expect(result?.geometry.flipV).toBe(false);
    });

    it('expands geometry when effectExtent is provided', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 50,
          effectExtent: { left: 2, top: 4, right: 3, bottom: 5 },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.geometry.width).toBe(105);
      expect(result.geometry.height).toBe(59);
      expect(result.effectExtent).toEqual({ left: 2, top: 4, right: 3, bottom: 5 });
    });

    it('uses default dimensions when width/height are invalid', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 0,
          height: -10,
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.geometry.width).toBe(1);
      expect(result.geometry.height).toBe(1);
    });

    it('includes rotation, flip flags, and shape properties', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          rotation: 45,
          flipH: true,
          flipV: false,
          kind: 'rectangle',
          fillColor: '#FF0000',
          strokeColor: '#000000',
          strokeWidth: 2,
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.geometry.rotation).toBe(45);
      expect(result.geometry.flipH).toBe(true);
      expect(result.geometry.flipV).toBe(false);
      expect(result.shapeKind).toBe('rectangle');
      expect(result.fillColor).toBe('#FF0000');
      expect(result.strokeColor).toBe('#000000');
      expect(result.strokeWidth).toBe(2);
    });

    it('passes line end markers through to drawing block', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          lineEnds: {
            head: { type: 'triangle', width: 'sm', length: 'lg' },
          },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.lineEnds).toEqual({
        head: { type: 'triangle', width: 'sm', length: 'lg' },
      });
    });

    it('handles wrap configuration', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          wrap: {
            type: 'Square',
            attrs: {
              wrapText: 'bothSides',
              distTop: 5,
            },
          },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.wrap).toBeDefined();
      expect(result.wrap?.type).toBe('Square');
      expect(result.wrap?.wrapText).toBe('bothSides');
      expect(result.wrap?.distTop).toBe(5);
    });

    it('handles anchor data', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          anchorData: {
            hRelativeFrom: 'page',
            vRelativeFrom: 'margin',
            offsetH: 50,
            offsetV: 100,
          },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.anchor).toBeDefined();
      expect(result.anchor?.hRelativeFrom).toBe('page');
      expect(result.anchor?.vRelativeFrom).toBe('margin');
      expect(result.anchor?.offsetH).toBe(50);
      expect(result.anchor?.offsetV).toBe(100);
    });

    it('handles padding and margin', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
          marginOffset: { top: 5, left: 5 },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.padding).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
      expect(result.margin).toEqual({ top: 5, left: 5 });
    });

    it('includes drawing content snapshot', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          drawingContent: {
            name: 'w:shape',
            attributes: { id: 'shape1' },
            elements: [{ name: 'v:rect' }],
          },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.drawingContent).toBeDefined();
      expect(result.drawingContent?.name).toBe('w:shape');
      expect(result.drawingContent?.attributes).toEqual({ id: 'shape1' });
    });

    it('includes z-index when provided', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          zIndex: 10,
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.zIndex).toBe(10);
    });

    it('forces zIndex to 0 when behindDoc is true even with relativeHeight', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          anchorData: { isAnchored: true, behindDoc: true },
          originalAttributes: { relativeHeight: 251658250 },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.zIndex).toBe(0);
    });

    it('includes PM positions in attrs when available', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: { width: 100, height: 100 },
      };

      const positions = new Map();
      positions.set(node, { start: 5, end: 15 });

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, positions) as DrawingBlock;

      expect(result.attrs?.pmStart).toBe(5);
      expect(result.attrs?.pmEnd).toBe(15);
    });
  });

  describe('shapeGroupNodeToDrawingBlock', () => {
    it('converts basic shape group node', () => {
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: {
          size: { width: 300, height: 200 },
        },
      };

      const result = shapeGroupNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

      expect(result).toBeDefined();
      expect(result?.kind).toBe('drawing');
      expect(result?.drawingKind).toBe('shapeGroup');
      expect(result?.geometry.width).toBe(300);
      expect(result?.geometry.height).toBe(200);
    });

    it('uses groupTransform dimensions when size not available', () => {
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: {
          groupTransform: {
            x: 0,
            y: 0,
            width: 400,
            height: 300,
          },
        },
      };

      const result = shapeGroupNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.geometry.width).toBe(400);
      expect(result.geometry.height).toBe(300);
      expect(result.groupTransform).toBeDefined();
      expect(result.groupTransform?.width).toBe(400);
      expect(result.groupTransform?.height).toBe(300);
    });

    it('includes shape children', () => {
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: {
          size: { width: 100, height: 100 },
          shapes: [
            { shapeType: 'rectangle', width: 50, height: 50 },
            { shapeType: 'circle', radius: 25 },
          ],
        },
      };

      const result = shapeGroupNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.shapes).toHaveLength(2);
      expect(result.shapes?.[0].shapeType).toBe('rectangle');
      expect(result.shapes?.[1].shapeType).toBe('circle');
    });

    it('filters invalid shape children', () => {
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: {
          size: { width: 100, height: 100 },
          shapes: [{ shapeType: 'rectangle' }, null, { noShapeType: true }, { shapeType: 'circle' }],
        },
      };

      const result = shapeGroupNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.shapes).toHaveLength(2);
      expect(result.shapes?.[0].shapeType).toBe('rectangle');
      expect(result.shapes?.[1].shapeType).toBe('circle');
    });

    it('handles rotation and flip properties', () => {
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: {
          size: { width: 100, height: 100 },
          rotation: 90,
          flipH: 1,
          flipV: '0',
        },
      };

      const result = shapeGroupNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.geometry.rotation).toBe(90);
      expect(result.geometry.flipH).toBe(true);
      expect(result.geometry.flipV).toBe(false);
    });
  });

  describe('shapeContainerNodeToDrawingBlock', () => {
    it('converts basic shape container node', () => {
      const node: PMNode = {
        type: 'shapeContainer',
        attrs: {
          width: 250,
          height: 180,
        },
      };

      const result = shapeContainerNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

      expect(result).toBeDefined();
      expect(result?.kind).toBe('drawing');
      expect(result?.drawingKind).toBe('vectorShape');
      expect(result?.geometry.width).toBe(250);
      expect(result?.geometry.height).toBe(180);
    });

    it('includes shape properties', () => {
      const node: PMNode = {
        type: 'shapeContainer',
        attrs: {
          width: 100,
          height: 100,
          kind: 'container',
          fillColor: '#00FF00',
          strokeColor: '#0000FF',
          strokeWidth: 3,
        },
      };

      const result = shapeContainerNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.shapeKind).toBe('container');
      expect(result.fillColor).toBe('#00FF00');
      expect(result.strokeColor).toBe('#0000FF');
      expect(result.strokeWidth).toBe(3);
    });
  });

  describe('shapeTextboxNodeToDrawingBlock', () => {
    it('converts basic shape textbox node', () => {
      const node: PMNode = {
        type: 'shapeTextbox',
        attrs: {
          width: 200,
          height: 100,
        },
      };

      const result = shapeTextboxNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap);

      expect(result).toBeDefined();
      expect(result?.kind).toBe('drawing');
      expect(result?.drawingKind).toBe('vectorShape');
      expect(result?.geometry.width).toBe(200);
      expect(result?.geometry.height).toBe(100);
    });

    it('includes textbox-specific properties', () => {
      const node: PMNode = {
        type: 'shapeTextbox',
        attrs: {
          width: 150,
          height: 75,
          kind: 'textbox',
          fillColor: '#FFFFFF',
          strokeColor: '#000000',
          strokeWidth: 1,
        },
      };

      const result = shapeTextboxNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.shapeKind).toBe('textbox');
      expect(result.fillColor).toBe('#FFFFFF');
      expect(result.strokeColor).toBe('#000000');
      expect(result.strokeWidth).toBe(1);
    });
  });

  describe('handleVectorShapeNode', () => {
    it('converts vector shape and adds to blocks', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: { width: 100, height: 100 },
      };

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();

      const context = {
        blocks,
        recordBlockKind,
        nextBlockId: vi.fn(() => 'shape-1'),
        positions: new Map(),
      };

      handleVectorShapeNode(node, context as never);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('drawing');
      expect(blocks[0].drawingKind).toBe('vectorShape');
      expect(recordBlockKind).toHaveBeenCalledWith('drawing');
    });
  });

  describe('handleShapeGroupNode', () => {
    it('converts shape group and adds to blocks', () => {
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: { size: { width: 100, height: 100 } },
      };

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();

      const context = {
        blocks,
        recordBlockKind,
        nextBlockId: vi.fn(() => 'group-1'),
        positions: new Map(),
      };

      handleShapeGroupNode(node, context as never);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('drawing');
      expect(blocks[0].drawingKind).toBe('shapeGroup');
      expect(recordBlockKind).toHaveBeenCalledWith('drawing');
    });
  });

  describe('handleShapeContainerNode', () => {
    it('converts shape container and adds to blocks', () => {
      const node: PMNode = {
        type: 'shapeContainer',
        attrs: { width: 100, height: 100 },
      };

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();

      const context = {
        blocks,
        recordBlockKind,
        nextBlockId: vi.fn(() => 'container-1'),
        positions: new Map(),
      };

      handleShapeContainerNode(node, context as never);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('drawing');
      expect(recordBlockKind).toHaveBeenCalledWith('drawing');
    });
  });

  describe('handleShapeTextboxNode', () => {
    it('converts shape textbox and adds to blocks', () => {
      const node: PMNode = {
        type: 'shapeTextbox',
        attrs: { width: 100, height: 100 },
      };

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();

      const context = {
        blocks,
        recordBlockKind,
        nextBlockId: vi.fn(() => 'textbox-1'),
        positions: new Map(),
      };

      handleShapeTextboxNode(node, context as never);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('drawing');
      expect(recordBlockKind).toHaveBeenCalledWith('drawing');
    });
  });

  describe('edge cases and validation', () => {
    it('coerces string numbers to numeric values', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: '200',
          height: '150',
          rotation: '45',
          strokeWidth: '2.5',
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.geometry.width).toBe(200);
      expect(result.geometry.height).toBe(150);
      expect(result.geometry.rotation).toBe(45);
      expect(result.strokeWidth).toBe(2.5);
    });

    it('handles invalid numeric strings gracefully', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 'invalid',
          height: '',
          rotation: 'NaN',
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.geometry.width).toBe(1); // Falls back to default
      expect(result.geometry.height).toBe(1);
      expect(result.geometry.rotation).toBe(0);
    });

    it('handles various boolean formats', () => {
      const testCases = [
        { flipH: true, flipV: false },
        { flipH: 1, flipV: 0 },
        { flipH: 'true', flipV: 'false' },
        { flipH: 'yes', flipV: 'no' },
        { flipH: 'on', flipV: 'off' },
      ];

      testCases.forEach((attrs) => {
        const node: PMNode = {
          type: 'vectorShape',
          attrs: { width: 100, height: 100, ...attrs },
        };

        const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

        expect(result.geometry.flipH).toBe(true);
        expect(result.geometry.flipV).toBe(false);
      });
    });

    it('handles empty or missing shapes array in shape group', () => {
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: {
          size: { width: 100, height: 100 },
          shapes: [],
        },
      };

      const result = shapeGroupNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.shapes).toEqual([]);
    });

    it('ignores drawing content without valid name', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          drawingContent: {
            attributes: { id: 'test' },
          },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.drawingContent).toBeUndefined();
    });
  });
});
