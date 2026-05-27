/**
 * Tests for Content Block Converter
 */

import { describe, it, expect, vi } from 'vitest';
import { contentBlockNodeToDrawingBlock } from './content-block.js';
import type { PMNode, BlockIdGenerator, PositionMap } from '../types.js';

describe('contentBlock converter', () => {
  const mockBlockIdGenerator: BlockIdGenerator = vi.fn((kind) => `test-${kind}-id`);

  it('returns null for non-horizontal rules', () => {
    const node: PMNode = {
      type: 'contentBlock',
      attrs: {
        horizontalRule: false,
        size: { width: 100, height: 2 },
      },
    };

    const result = contentBlockNodeToDrawingBlock(node, mockBlockIdGenerator, new Map());
    expect(result).toBeNull();
  });

  it('converts fixed-width horizontal rules', () => {
    const node: PMNode = {
      type: 'contentBlock',
      attrs: {
        horizontalRule: true,
        size: { width: 200, height: 3 },
        background: '#000000',
      },
    };

    const positions: PositionMap = new Map();
    positions.set(node, { start: 5, end: 6 });

    const result = contentBlockNodeToDrawingBlock(node, mockBlockIdGenerator, positions);

    expect(result?.kind).toBe('drawing');
    expect(result?.drawingKind).toBe('vectorShape');
    expect(result?.geometry.width).toBe(200);
    expect(result?.geometry.height).toBe(3);
    expect(result?.fillColor).toBe('#000000');
    expect(result?.strokeColor).toBeNull();
    expect(result?.attrs?.pmStart).toBe(5);
    expect(result?.attrs?.pmEnd).toBe(6);
  });

  it('marks full-width horizontal rules for deferred resolution', () => {
    const node: PMNode = {
      type: 'contentBlock',
      attrs: {
        horizontalRule: true,
        size: { width: '100%', height: 2 },
        background: '#a0a0a0',
      },
    };

    const result = contentBlockNodeToDrawingBlock(node, mockBlockIdGenerator, new Map());

    expect(result?.geometry.width).toBe(1);
    expect(result?.geometry.height).toBe(2);
    expect(result?.attrs?.isFullWidth).toBe(true);
  });

  it('does not promote effectExtent for horizontal rules', () => {
    const node: PMNode = {
      type: 'contentBlock',
      attrs: {
        horizontalRule: true,
        size: { width: '100%', height: 2 },
        effectExtent: { left: 4, top: 2, right: 6, bottom: 3 },
      },
    };

    const result = contentBlockNodeToDrawingBlock(node, mockBlockIdGenerator, new Map());

    // Horizontal rules are full-width vector shapes; effectExtent is not part of the drawing block.
    expect(result?.effectExtent).toBeUndefined();
  });

  it('propagates paragraph indent into drawing attrs', () => {
    const node: PMNode = {
      type: 'contentBlock',
      attrs: {
        horizontalRule: true,
        size: { width: '100%', height: 1 },
        hrIndentLeft: -12,
        hrIndentRight: 6,
      },
    };

    const result = contentBlockNodeToDrawingBlock(node, mockBlockIdGenerator, new Map());

    expect(result?.attrs?.hrIndentLeft).toBe(-12);
    expect(result?.attrs?.hrIndentRight).toBe(6);
  });

  it('returns null when height is missing or invalid', () => {
    const node: PMNode = {
      type: 'contentBlock',
      attrs: {
        horizontalRule: true,
        size: { width: 100 },
      },
    };

    const result = contentBlockNodeToDrawingBlock(node, mockBlockIdGenerator, new Map());
    expect(result).toBeNull();
  });
});
