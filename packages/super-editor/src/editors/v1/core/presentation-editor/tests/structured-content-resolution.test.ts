import { describe, expect, it, vi } from 'vitest';

import {
  findStructuredContentBlockAtPos,
  findStructuredContentBlockById,
  findStructuredContentInlineAtPos,
  findStructuredContentInlineById,
} from '../input/structured-content-resolution.js';

describe('structured content resolution helpers', () => {
  it('finds structured content blocks by id using id or sdtId attrs', () => {
    const blockById = {
      type: { name: 'structuredContentBlock' },
      attrs: { id: 'block-1' },
      nodeSize: 8,
    };
    const blockBySdtId = {
      type: { name: 'structuredContentBlock' },
      attrs: { sdtId: 'block-2' },
      nodeSize: 10,
    };
    const doc = {
      descendants: vi.fn((callback: (node: unknown, pos: number) => boolean) => {
        if (callback(blockById, 5) === false) return;
        callback(blockBySdtId, 20);
      }),
    };

    expect(findStructuredContentBlockById(doc as never, 'block-1')).toEqual({
      node: blockById,
      pos: 5,
      start: 6,
      end: 12,
    });
    expect(findStructuredContentBlockById(doc as never, 'block-2')).toEqual({
      node: blockBySdtId,
      pos: 20,
      start: 21,
      end: 29,
    });
  });

  it('finds inline structured content by id using id or sdtId attrs', () => {
    const inlineNode = {
      type: { name: 'structuredContent' },
      attrs: { sdtId: 'inline-1' },
      nodeSize: 6,
    };
    const doc = {
      descendants: vi.fn((callback: (node: unknown, pos: number) => boolean) => {
        callback(inlineNode, 14);
      }),
    };

    expect(findStructuredContentInlineById(doc as never, 'inline-1')).toEqual({
      node: inlineNode,
      pos: 14,
      start: 15,
      end: 19,
    });
  });

  it('finds structured content blocks and inlines at a resolved position', () => {
    const blockNode = { type: { name: 'structuredContentBlock' } };
    const inlineNode = { type: { name: 'structuredContent' } };
    const doc = {
      resolve: vi
        .fn()
        .mockReturnValueOnce({
          depth: 2,
          node: (depth: number) => {
            if (depth === 2) return { type: { name: 'paragraph' } };
            if (depth === 1) return blockNode;
            return { type: { name: 'doc' } };
          },
          before: (depth: number) => (depth === 1 ? 10 : 11),
          start: (depth: number) => (depth === 1 ? 11 : 12),
          end: (depth: number) => (depth === 1 ? 30 : 29),
        })
        .mockReturnValueOnce({
          depth: 2,
          node: (depth: number) => {
            if (depth === 2) return inlineNode;
            if (depth === 1) return { type: { name: 'paragraph' } };
            return { type: { name: 'doc' } };
          },
          before: (depth: number) => (depth === 2 ? 22 : 20),
          start: (depth: number) => (depth === 2 ? 23 : 21),
          end: (depth: number) => (depth === 2 ? 26 : 28),
        }),
    };

    expect(findStructuredContentBlockAtPos(doc as never, 15)).toEqual({
      node: blockNode,
      pos: 10,
      start: 11,
      end: 30,
    });
    expect(findStructuredContentInlineAtPos(doc as never, 24)).toEqual({
      node: inlineNode,
      pos: 22,
      start: 23,
      end: 26,
    });
  });

  it('returns null for invalid positions (non-integer, non-finite, out-of-range)', () => {
    const doc = {
      resolve: vi.fn((pos: number) => {
        if (pos === 10) {
          return {
            depth: 1,
            node: () => ({ type: { name: 'structuredContentBlock' } }),
            before: () => 9,
            start: () => 10,
            end: () => 20,
          };
        }
        throw new RangeError('Position out of range');
      }),
    };

    expect(findStructuredContentBlockAtPos(doc as never, 10)).toEqual({
      node: { type: { name: 'structuredContentBlock' } },
      pos: 9,
      start: 10,
      end: 20,
    });
    expect(findStructuredContentBlockAtPos(doc as never, 10.5)).toBeNull();
    expect(findStructuredContentInlineAtPos(doc as never, Number.NaN)).toBeNull();
    expect(findStructuredContentInlineAtPos(doc as never, 999)).toBeNull();
  });

  it('does not match empty id against nodes with missing attrs', () => {
    const blockWithoutId = {
      type: { name: 'structuredContentBlock' },
      attrs: {},
      nodeSize: 6,
    };

    const doc = {
      descendants: vi.fn((callback: (node: unknown, pos: number) => boolean) => {
        callback(blockWithoutId, 4);
      }),
    };

    expect(findStructuredContentBlockById(doc as never, '')).toBeNull();
    expect(findStructuredContentInlineById(doc as never, '')).toBeNull();
  });
});
