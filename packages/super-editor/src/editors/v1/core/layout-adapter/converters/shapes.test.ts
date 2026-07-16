/**
 * Tests for Shape Node Converter
 */

import { describe, it, expect, vi } from 'vitest';
import {
  vectorShapeNodeToDrawingBlock,
  shapeGroupNodeToDrawingBlock,
  shapeContainerNodeToDrawingBlock,
  shapeTextboxNodeToDrawingBlock,
  hydrateTextboxDrawingContent,
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

    it('supplements standalone vector shape effect extent for centered strokes', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 50,
          fillColor: '#f2f2f2',
          strokeColor: '#111111',
          strokeWidth: 2,
          effectExtent: { left: 0, top: 0, right: 2, bottom: 3 },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.geometry.width).toBe(103);
      expect(result.geometry.height).toBe(54);
      expect(result.effectExtent).toEqual({ left: 1, top: 1, right: 2, bottom: 3 });
    });

    it('supplements standalone vector shape effect extent for outer shadows', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 50,
          fillColor: '#f2f2f2',
          strokeColor: null,
          effects: {
            outerShadow: {
              type: 'outerShadow',
              blurRadius: 6.6667,
              distance: 6.6667,
              direction: 45,
              color: '#757574',
              opacity: 0.4,
            },
          },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.effectExtent?.left).toBeCloseTo(5.286);
      expect(result.effectExtent?.top).toBeCloseTo(5.286);
      expect(result.effectExtent?.right).toBeCloseTo(14.714);
      expect(result.effectExtent?.bottom).toBeCloseTo(14.714);
      expect(result.geometry.width).toBeCloseTo(120);
      expect(result.geometry.height).toBeCloseTo(70);
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

    it('forwards valid shape effects to drawing block', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          effects: {
            outerShadow: {
              type: 'outerShadow',
              blurRadius: 6.6667,
              distance: 6.6667,
              direction: 45,
              color: '#a6a6a6',
              opacity: 0.4,
            },
          },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.effects).toEqual({
        outerShadow: {
          type: 'outerShadow',
          blurRadius: 6.6667,
          distance: 6.6667,
          direction: 45,
          color: '#a6a6a6',
          opacity: 0.4,
        },
      });
    });

    it('omits invalid shape effects from drawing block', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          effects: {
            outerShadow: {
              type: 'outerShadow',
              blurRadius: -1,
              distance: 6.6667,
              direction: 45,
              color: '#a6a6a6',
              opacity: 0.4,
            },
          },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.effects).toBeUndefined();
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

    it('fills wrap distances from padding when wrap attrs omit them', () => {
      const node: PMNode = {
        type: 'vectorShape',
        attrs: {
          width: 100,
          height: 100,
          padding: { top: 4, bottom: 6, left: 12, right: 15 },
          wrap: {
            type: 'Square',
            attrs: {
              wrapText: 'bothSides',
            },
          },
        },
      };

      const result = vectorShapeNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.wrap?.distTop).toBe(4);
      expect(result.wrap?.distBottom).toBe(6);
      expect(result.wrap?.distLeft).toBe(12);
      expect(result.wrap?.distRight).toBe(15);
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

    it('expands geometry when effectExtent is provided', () => {
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: {
          size: { width: 100, height: 50 },
          groupTransform: {
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          },
          effectExtent: { left: 2, top: 4, right: 3, bottom: 5 },
        },
      };

      const result = shapeGroupNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.geometry.width).toBe(105);
      expect(result.geometry.height).toBe(59);
      expect(result.groupTransform?.width).toBe(100);
      expect(result.groupTransform?.height).toBe(50);
      expect(result.effectExtent).toEqual({ left: 2, top: 4, right: 3, bottom: 5 });
    });

    it('supplements group effect extent when child stroke exceeds the imported value', () => {
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: {
          size: { width: 100, height: 50 },
          groupTransform: {
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          },
          effectExtent: { top: 1 },
          shapes: [
            {
              shapeType: 'vectorShape',
              attrs: {
                x: 10,
                y: 0,
                width: 20,
                height: 20,
                fillColor: null,
                strokeColor: '#111111',
                strokeWidth: 2.25,
              },
            },
          ],
        },
      };

      const result = shapeGroupNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.effectExtent?.top).toBeCloseTo(1.125);
      expect(result.geometry.height).toBeCloseTo(51.125);
      expect(result.groupTransform?.height).toBe(50);
    });

    it('supplements group effect extent when child shadow exceeds the imported value', () => {
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: {
          size: { width: 505, height: 62 },
          groupTransform: {
            x: 0,
            y: 0,
            width: 505,
            height: 62,
          },
          effectExtent: { left: 0, top: 0, right: 13, bottom: 12 },
          shapes: [
            {
              shapeType: 'vectorShape',
              attrs: {
                x: 7,
                y: 11,
                width: 497,
                height: 50,
                fillColor: '#616565',
                strokeColor: null,
                effects: {
                  outerShadow: {
                    type: 'outerShadow',
                    blurRadius: 6.6667,
                    distance: 6.6667,
                    direction: 45,
                    color: '#757574',
                    opacity: 0.4,
                  },
                },
              },
            },
          ],
        },
      };

      const result = shapeGroupNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.effectExtent?.left).toBe(0);
      expect(result.effectExtent?.top).toBe(0);
      expect(result.effectExtent?.right).toBeCloseTo(13.714);
      expect(result.effectExtent?.bottom).toBeCloseTo(13.714);
      expect(result.geometry.width).toBeCloseTo(518.714);
      expect(result.geometry.height).toBeCloseTo(75.714);
      expect(result.groupTransform?.height).toBe(62);
    });

    it('measures child stroke overflow in group transform coordinates when size differs', () => {
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: {
          size: { width: 200, height: 100 },
          groupTransform: {
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          },
          shapes: [
            {
              shapeType: 'vectorShape',
              attrs: {
                x: 98,
                y: 10,
                width: 2,
                height: 10,
                fillColor: null,
                strokeColor: '#111111',
                strokeWidth: 4,
              },
            },
          ],
        },
      };

      const result = shapeGroupNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.effectExtent?.right).toBe(2);
      expect(result.geometry.width).toBe(202);
      expect(result.groupTransform?.width).toBe(100);
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

    it('preserves vector child shape effects', () => {
      const effects = {
        outerShadow: {
          type: 'outerShadow',
          blurRadius: 6.6667,
          distance: 6.6667,
          direction: 45,
          color: '#a6a6a6',
          opacity: 0.4,
        },
      };
      const node: PMNode = {
        type: 'shapeGroup',
        attrs: {
          size: { width: 100, height: 100 },
          shapes: [
            {
              shapeType: 'vectorShape',
              attrs: {
                width: 50,
                height: 50,
                effects,
              },
            },
          ],
        },
      };

      const result = shapeGroupNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.shapes?.[0]).toMatchObject({
        shapeType: 'vectorShape',
        attrs: { effects },
      });
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
      expect(result?.drawingKind).toBe('textboxShape');
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

    it('extracts textbox text from nested shapeTextbox content', () => {
      const node: PMNode = {
        type: 'shapeContainer',
        attrs: {
          width: 240,
          height: 80,
        },
        content: [
          {
            type: 'shapeTextbox',
            attrs: {
              attributes: {
                inset: '0pt,0pt,0pt,0pt',
                style: 'v-text-anchor:middle',
              },
            },
            content: [
              {
                type: 'paragraph',
                attrs: {
                  paragraphProperties: {
                    justification: 'center',
                  },
                },
                content: [
                  { type: 'text', text: 'Hello ' },
                  { type: 'text', text: 'World', marks: [{ type: 'bold' }] },
                ],
              },
            ],
          },
        ],
      };

      const result = shapeContainerNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.textContent).toEqual({
        horizontalAlign: 'center',
        parts: [{ text: 'Hello ' }, { text: 'World', formatting: { bold: true } }],
      });
      expect(result.textVerticalAlign).toBe('center');
      expect(result.textInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it('forwards textbox shape effects to drawing block', () => {
      const node: PMNode = {
        type: 'shapeContainer',
        attrs: {
          width: 200,
          height: 100,
          isTextBox: true,
          effects: {
            outerShadow: {
              type: 'outerShadow',
              blurRadius: 6.6667,
              distance: 6.6667,
              direction: 45,
              color: '#a6a6a6',
              opacity: 0.4,
            },
          },
        },
      };

      const result = shapeContainerNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.drawingKind).toBe('textboxShape');
      expect(result.effects).toEqual({
        outerShadow: {
          type: 'outerShadow',
          blurRadius: 6.6667,
          distance: 6.6667,
          direction: 45,
          color: '#a6a6a6',
          opacity: 0.4,
        },
      });
    });

    it('derives inlineParagraphAlignment from a centered wrapper paragraph for inline textboxes', () => {
      // A real import stores alignment only as the raw `w:jc` value on
      // `paragraphProperties.justification`; the wrapper paragraph has no top-level `textAlign`.
      const node: PMNode = {
        type: 'shapeContainer',
        attrs: {
          width: 199,
          height: 191,
          wrap: { type: 'Inline' },
          wrapperParagraph: {
            paragraphProperties: { justification: 'center' },
          },
        },
      };

      const result = shapeContainerNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock & {
        attrs?: Record<string, unknown>;
      };

      expect(result.attrs?.inlineParagraphAlignment).toBe('center');
    });

    it('derives inlineParagraphAlignment "right" from a right-aligned wrapper paragraph', () => {
      const node: PMNode = {
        type: 'shapeContainer',
        attrs: {
          width: 199,
          height: 191,
          wrap: { type: 'Inline' },
          wrapperParagraph: {
            paragraphProperties: { justification: 'right' },
          },
        },
      };

      const result = shapeContainerNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock & {
        attrs?: Record<string, unknown>;
      };

      expect(result.attrs?.inlineParagraphAlignment).toBe('right');
    });

    it('derives wrapper paragraph indents with inlineParagraphAlignment for centered inline textboxes', () => {
      const node: PMNode = {
        type: 'shapeContainer',
        attrs: {
          width: 199,
          height: 191,
          wrap: { type: 'Inline' },
          wrapperParagraph: {
            paragraphProperties: {
              justification: 'center',
              indent: { left: 720, right: 360 },
            },
          },
        },
      };

      const result = shapeContainerNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock & {
        attrs?: Record<string, unknown>;
      };

      expect(result.attrs?.inlineParagraphAlignment).toBe('center');
      expect(result.attrs?.paragraphIndentLeft).toBe(48);
      expect(result.attrs?.paragraphIndentRight).toBe(24);
    });

    it('derives inlineParagraphAlignment "center" from a distribute wrapper paragraph', () => {
      const node: PMNode = {
        type: 'shapeContainer',
        attrs: {
          width: 199,
          height: 191,
          wrap: { type: 'Inline' },
          wrapperParagraph: {
            paragraphProperties: { justification: 'distribute' },
          },
        },
      };

      const result = shapeContainerNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock & {
        attrs?: Record<string, unknown>;
      };

      expect(result.attrs?.inlineParagraphAlignment).toBe('center');
    });

    it('does not derive inlineParagraphAlignment for non-inline (anchored) textboxes', () => {
      const node: PMNode = {
        type: 'shapeContainer',
        attrs: {
          width: 199,
          height: 191,
          wrap: { type: 'Square' },
          wrapperParagraph: {
            paragraphProperties: { justification: 'center' },
          },
        },
      };

      const result = shapeContainerNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock & {
        attrs?: Record<string, unknown>;
      };

      expect(result.attrs?.inlineParagraphAlignment).toBeUndefined();
    });

    it('does not derive inlineParagraphAlignment for left-aligned wrapper paragraphs', () => {
      const node: PMNode = {
        type: 'shapeContainer',
        attrs: {
          width: 199,
          height: 191,
          wrap: { type: 'Inline' },
          wrapperParagraph: {
            paragraphProperties: { justification: 'left' },
          },
        },
      };

      const result = shapeContainerNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock & {
        attrs?: Record<string, unknown>;
      };

      expect(result.attrs?.inlineParagraphAlignment).toBeUndefined();
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
      expect(result?.drawingKind).toBe('textboxShape');
      expect(result?.geometry.width).toBe(200);
      expect(result?.geometry.height).toBe(100);
      expect((result as DrawingBlock & { contentBlocks?: unknown[] }).contentBlocks).toEqual([]);
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

    it('serializes paragraph children into textContent parts', () => {
      const node: PMNode = {
        type: 'shapeTextbox',
        attrs: {
          width: 150,
          height: 75,
          attributes: {
            inset: '3pt,6pt,9pt,12pt',
          },
        },
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Line 1' },
              { type: 'lineBreak' },
              { type: 'text', text: 'Line 2' },
              { type: 'tab' },
              { type: 'page-number', attrs: { pageNumberFormat: 'upperRoman' } },
            ],
          },
          {
            type: 'paragraph',
            content: [],
          },
        ],
      };

      const result = shapeTextboxNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;

      expect(result.textContent).toEqual({
        parts: [
          { text: 'Line 1' },
          { text: '\n', isLineBreak: true },
          { text: 'Line 2' },
          { text: '\t' },
          { text: '', fieldType: 'PAGE', pageNumberFormat: 'upperRoman' },
          { text: '\n', isLineBreak: true, isEmptyParagraph: true },
        ],
      });
      expect(result.textInsets).toEqual({
        top: 8,
        right: 12,
        bottom: 16,
        left: 4,
      });
      expect(result.drawingKind).toBe('textboxShape');
      expect((result as DrawingBlock & { contentBlocks?: unknown[] }).contentBlocks).toEqual([]);
    });

    it('hydrates paragraph children into contentBlocks for textbox drawings', () => {
      const node: PMNode = {
        type: 'shapeTextbox',
        attrs: {
          width: 150,
          height: 75,
        },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Line 1' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Line 2' }],
          },
        ],
      };

      const drawingBlock = shapeTextboxNodeToDrawingBlock(node, mockBlockIdGenerator, mockPositionMap) as DrawingBlock;
      const paragraphToFlowBlocks = vi
        .fn()
        .mockImplementation(({ para }: { para: PMNode }) => [{ kind: 'paragraph', id: para.content?.[0]?.text }]);

      const hydrated = hydrateTextboxDrawingContent(node, drawingBlock, {
        nextBlockId: mockBlockIdGenerator,
        positions: mockPositionMap,
        converters: {
          paragraphToFlowBlocks,
        } as never,
        converterContext: {} as never,
        trackedChangesConfig: { enabled: false, mode: 'review' },
        bookmarks: new Map(),
        hyperlinkConfig: { enableRichHyperlinks: false },
        enableComments: false,
      });

      expect(hydrated.drawingKind).toBe('textboxShape');
      expect((hydrated as DrawingBlock & { contentBlocks?: Array<{ id: string }> }).contentBlocks).toEqual([
        { kind: 'paragraph', id: 'Line 1' },
        { kind: 'paragraph', id: 'Line 2' },
      ]);
      expect(paragraphToFlowBlocks).toHaveBeenCalledTimes(2);
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
