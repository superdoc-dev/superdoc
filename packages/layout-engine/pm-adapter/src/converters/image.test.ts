/**
 * Tests for Image Node Converter
 */

import { describe, it, expect, vi } from 'vitest';
import { imageNodeToBlock, handleImageNode } from './image.js';
import type { PMNode, BlockIdGenerator, PositionMap } from '../types.js';
import type { ImageBlock } from '@superdoc/contracts';

describe('image converter', () => {
  describe('imageNodeToBlock', () => {
    const mockBlockIdGenerator: BlockIdGenerator = vi.fn((kind) => `test-${kind}-id`);
    const mockPositionMap: PositionMap = new Map();

    it('returns null when node has no src', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {},
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap);

      expect(result).toBeNull();
    });

    it('returns null when src is not a string', () => {
      const node: PMNode = {
        type: 'image',
        attrs: { src: 123 },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap);

      expect(result).toBeNull();
    });

    it('converts basic image node with src', () => {
      const node: PMNode = {
        type: 'image',
        attrs: { src: 'https://example.com/image.png' },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap);

      expect(result).toBeDefined();
      expect(result?.kind).toBe('image');
      expect(result?.src).toBe('https://example.com/image.png');
      expect(result?.id).toBe('test-image-id');
      expect(result?.display).toBe('block');
      expect(result?.objectFit).toBe('contain');
    });

    it('includes width and height when provided', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          size: { width: 300, height: 200 },
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.width).toBe(300);
      expect(result.height).toBe(200);
    });

    it('excludes non-finite width/height values', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          size: { width: Infinity, height: NaN },
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.width).toBeUndefined();
      expect(result.height).toBeUndefined();
    });

    it('includes alt and title when provided', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          alt: 'Alt text',
          title: 'Image title',
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.alt).toBe('Alt text');
      expect(result.title).toBe('Image title');
    });

    it('sets display to inline when inline attribute is true', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          inline: true,
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.display).toBe('inline');
      expect(result.objectFit).toBe('scale-down');
    });

    it('respects explicit display attribute', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          display: 'inline',
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.display).toBe('inline');
    });

    it('respects explicit objectFit attribute', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          objectFit: 'cover',
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.objectFit).toBe('cover');
    });

    /**
     * shouldCover tests - Critical for OOXML image stretch/clip behavior
     *
     * In OOXML, images can have:
     * - <a:stretch><a:fillRect/></a:stretch>: Scale image to fill extent rectangle
     * - <a:srcRect>: Specifies source cropping/extension
     *
     * srcRect attribute behavior:
     * - Positive values (e.g., r="84800"): Crop percentage from that edge (84.8% from right)
     * - Negative values (e.g., b="-3978"): Extend/pad the source mapping
     * - Empty/no srcRect: No pre-adjustment
     *
     * shouldCover is set to true when:
     * - stretch+fillRect is present AND
     * - srcRect has no negative values (meaning we need CSS to handle clipping)
     *
     * This matches MS Word behavior where stretched images with positive srcRect
     * values are clipped to fit the extent rectangle.
     */
    describe('shouldCover (OOXML stretch/clip behavior)', () => {
      it('sets objectFit to cover when shouldCover is true (stretch with empty srcRect)', () => {
        // Simulates: <a:stretch><a:fillRect/></a:stretch> with empty <a:srcRect/>
        // Example: whalar header2.xml - logo needs to be scaled and clipped
        const node: PMNode = {
          type: 'image',
          attrs: {
            src: 'image.jpg',
            shouldCover: true,
          },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.objectFit).toBe('cover');
      });

      it('sets objectFit to cover when shouldCover is true (stretch with positive srcRect)', () => {
        // Simulates: <a:stretch><a:fillRect/></a:stretch> with <a:srcRect r="84800"/>
        // Example: whalar header1.xml - 84.8% cropped from right, needs CSS clipping
        // Since we don't implement actual srcRect cropping, CSS cover handles it
        const node: PMNode = {
          type: 'image',
          attrs: {
            src: 'image.jpg',
            shouldCover: true,
          },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.objectFit).toBe('cover');
      });

      it('does not set objectFit to cover when shouldCover is false (negative srcRect)', () => {
        // Simulates: <a:stretch><a:fillRect/></a:stretch> with <a:srcRect b="-3978"/>
        // Example: certn header2.xml - negative value means Word extended the mapping
        // The image should NOT be clipped because Word already adjusted it
        const node: PMNode = {
          type: 'image',
          attrs: {
            src: 'image.jpg',
            shouldCover: false,
            isAnchor: true,
          },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.objectFit).toBe('contain');
      });

      it('does not set objectFit to cover when shouldCover is false (no stretch)', () => {
        // No <a:stretch><a:fillRect/></a:stretch> present
        const node: PMNode = {
          type: 'image',
          attrs: {
            src: 'image.jpg',
            shouldCover: false,
          },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.objectFit).toBe('contain');
      });

      it('explicit objectFit overrides shouldCover', () => {
        const node: PMNode = {
          type: 'image',
          attrs: {
            src: 'image.jpg',
            shouldCover: true,
            objectFit: 'fill',
          },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.objectFit).toBe('fill');
      });
    });

    it('handles wrap configuration', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          wrap: {
            type: 'Square',
            attrs: {
              wrapText: 'bothSides',
              distTop: 10,
              distBottom: 10,
              distLeft: 5,
              distRight: 5,
            },
          },
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.wrap).toBeDefined();
      expect(result.wrap?.type).toBe('Square');
      expect(result.wrap?.wrapText).toBe('bothSides');
      expect(result.wrap?.distTop).toBe(10);
      expect(result.wrap?.distBottom).toBe(10);
      expect(result.wrap?.distLeft).toBe(5);
      expect(result.wrap?.distRight).toBe(5);
    });

    it('handles wrap with polygon', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          wrap: {
            type: 'Tight',
            attrs: {
              polygon: [
                [0, 0],
                [100, 0],
                [100, 100],
                [0, 100],
              ],
            },
          },
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.wrap?.polygon).toEqual([
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ]);
    });

    it('handles wrap with behindDoc flag', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          wrap: {
            type: 'Through',
            attrs: {
              behindDoc: true,
            },
          },
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.wrap?.behindDoc).toBe(true);
    });

    it('preserves Inline wrap type for spacing attributes', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          wrap: {
            type: 'Inline',
            attrs: {
              distTop: 10,
              distBottom: 20,
            },
          },
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      // Inline wrap type is now preserved to support spacing attributes
      expect(result.wrap).toBeDefined();
      expect(result.wrap?.type).toBe('Inline');
      expect(result.wrap?.distTop).toBe(10);
      expect(result.wrap?.distBottom).toBe(20);
    });

    it('handles anchor data', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          anchorData: {
            hRelativeFrom: 'column',
            vRelativeFrom: 'paragraph',
            alignH: 'center',
            alignV: 'top',
            offsetH: 50,
            offsetV: 100,
          },
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.anchor).toBeDefined();
      expect(result.anchor?.hRelativeFrom).toBe('column');
      expect(result.anchor?.vRelativeFrom).toBe('paragraph');
      expect(result.anchor?.alignH).toBe('center');
      expect(result.anchor?.alignV).toBe('top');
      expect(result.anchor?.offsetH).toBe(50);
      expect(result.anchor?.offsetV).toBe(100);
    });

    it('marks image as anchored when isAnchor is true', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          isAnchor: true,
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.anchor?.isAnchored).toBe(true);
      expect(result.objectFit).toBe('contain');
    });

    it('handles padding', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          padding: {
            top: 10,
            right: 15,
            bottom: 10,
            left: 15,
          },
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.padding).toEqual({
        top: 10,
        right: 15,
        bottom: 10,
        left: 15,
      });
    });

    it('handles margin from marginOffset', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          marginOffset: {
            top: 20,
            left: 10,
          },
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.margin).toEqual({
        top: 20,
        left: 10,
      });
    });

    it('includes PM positions in attrs when available', () => {
      const node: PMNode = {
        type: 'image',
        attrs: { src: 'image.jpg' },
      };

      const positions = new Map();
      positions.set(node, { start: 10, end: 20 });

      const result = imageNodeToBlock(node, mockBlockIdGenerator, positions) as ImageBlock;

      expect(result.attrs?.pmStart).toBe(10);
      expect(result.attrs?.pmEnd).toBe(20);
    });

    describe('zIndex from originalAttributes.relativeHeight', () => {
      const OOXML_BASE = 251658240;

      it('sets zIndex when originalAttributes.relativeHeight is a number', () => {
        const node: PMNode = {
          type: 'image',
          attrs: {
            src: 'image.jpg',
            anchorData: { isAnchored: true },
            originalAttributes: { relativeHeight: OOXML_BASE + 10 },
          },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.zIndex).toBe(10);
      });

      it('sets zIndex when originalAttributes.relativeHeight is a string (OOXML)', () => {
        const node: PMNode = {
          type: 'image',
          attrs: {
            src: 'image.jpg',
            anchorData: { isAnchored: true },
            originalAttributes: { relativeHeight: '251658291' },
          },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.zIndex).toBe(51);
      });

      it('sets zIndex to 0 when anchor.behindDoc is true and no relativeHeight', () => {
        const node: PMNode = {
          type: 'image',
          attrs: {
            src: 'image.jpg',
            anchorData: { isAnchored: true, behindDoc: true },
          },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.zIndex).toBe(0);
      });

      it('forces zIndex to 0 when behindDoc is true even with relativeHeight', () => {
        const node: PMNode = {
          type: 'image',
          attrs: {
            src: 'image.jpg',
            anchorData: { isAnchored: true, behindDoc: true },
            originalAttributes: { relativeHeight: OOXML_BASE + 10 },
          },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.zIndex).toBe(0);
      });

      it('clamps base relativeHeight to 1 when not behindDoc', () => {
        const node: PMNode = {
          type: 'image',
          attrs: {
            src: 'image.jpg',
            anchorData: { isAnchored: true, behindDoc: false },
            originalAttributes: { relativeHeight: OOXML_BASE },
          },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.zIndex).toBe(1);
      });

      it('sets zIndex to 1 when no originalAttributes and not behindDoc (default stacking)', () => {
        const node: PMNode = {
          type: 'image',
          attrs: { src: 'image.jpg' },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.zIndex).toBe(1);
      });
    });

    it('validates and filters invalid wrap type', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          wrap: {
            type: 'InvalidType',
          },
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.wrap).toBeUndefined();
    });

    it('validates and filters invalid anchor relative values', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.jpg',
          anchorData: {
            hRelativeFrom: 'invalidValue',
            vRelativeFrom: 'alsoInvalid',
          },
        },
      };

      const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

      expect(result.anchor?.hRelativeFrom).toBeUndefined();
      expect(result.anchor?.vRelativeFrom).toBeUndefined();
    });

    it('converts boolean-like values for behindDoc', () => {
      const testCases = [
        { input: 1, expected: true },
        { input: 0, expected: false },
        { input: '1', expected: true },
        { input: '0', expected: false },
        { input: 'true', expected: true },
        { input: 'false', expected: false },
      ];

      testCases.forEach(({ input, expected }) => {
        const node: PMNode = {
          type: 'image',
          attrs: {
            src: 'image.jpg',
            wrap: {
              type: 'Square',
              attrs: {
                behindDoc: input,
              },
            },
          },
        };

        const result = imageNodeToBlock(node, mockBlockIdGenerator, mockPositionMap) as ImageBlock;

        expect(result.wrap?.behindDoc).toBe(expected);
      });
    });
  });

  describe('handleImageNode', () => {
    it('converts image node and adds to blocks', () => {
      const node: PMNode = {
        type: 'image',
        attrs: { src: 'image.jpg' },
      };

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();
      const nextBlockId = vi.fn(() => 'img-1');
      const positions = new Map();

      const context = {
        blocks,
        recordBlockKind,
        nextBlockId,
        positions,
        trackedChangesConfig: { enabled: false, mode: 'review' as const },
      };

      handleImageNode(node, context as never);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('image');
      expect(blocks[0].src).toBe('image.jpg');
      expect(recordBlockKind).toHaveBeenCalledWith('image');
    });

    it('does not add block when imageNodeToBlock returns null', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {}, // No src
      };

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();

      const context = {
        blocks,
        recordBlockKind,
        nextBlockId: vi.fn(() => 'img-1'),
        positions: new Map(),
        trackedChangesConfig: { enabled: false, mode: 'review' as const },
      };

      handleImageNode(node, context as never);

      expect(blocks).toHaveLength(0);
      expect(recordBlockKind).not.toHaveBeenCalled();
    });

    it('handles tracked changes when enabled', () => {
      const node: PMNode = {
        type: 'image',
        attrs: { src: 'image.jpg' },
        marks: [
          {
            type: 'insertion',
            attrs: { author: 'Test Author', date: '2024-01-01' },
          },
        ],
      };

      const blocks: FlowBlock[] = [];
      const context = {
        blocks,
        recordBlockKind: vi.fn(),
        nextBlockId: vi.fn(() => 'img-1'),
        positions: new Map(),
        trackedChangesConfig: { enabled: true, mode: 'review' as const },
      };

      handleImageNode(node, context as never);

      expect(blocks).toHaveLength(1);
    });
  });
});
