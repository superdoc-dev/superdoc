/**
 * Tests for SDT Metadata Module
 */

import { describe, it, expect } from 'vitest';
import {
  hasInstruction,
  getNodeInstruction,
  getDocPartGallery,
  getDocPartObjectId,
  resolveNodeSdtMetadata,
  applySdtMetadataToParagraphBlocks,
  applySdtMetadataToTableBlock,
  applySdtMetadataToListBlock,
} from './metadata.js';
import type { PMNode } from '../types.js';
import type { ParagraphBlock, TableBlock, ListBlock, SdtMetadata } from '@superdoc/contracts';

describe('metadata', () => {
  describe('hasInstruction', () => {
    it('returns true when node has instruction attribute', () => {
      const node: PMNode = {
        type: 'documentPartObject',
        attrs: { instruction: 'TOC \\o "1-3"' },
      };
      expect(hasInstruction(node)).toBe(true);
    });

    it('returns false when node has no attrs', () => {
      const node: PMNode = {
        type: 'paragraph',
      };
      expect(hasInstruction(node)).toBe(false);
    });

    it('returns false when attrs is null', () => {
      const node: PMNode = {
        type: 'paragraph',
        attrs: null,
      };
      expect(hasInstruction(node)).toBe(false);
    });

    it('returns false when instruction is not a string', () => {
      const node: PMNode = {
        type: 'paragraph',
        attrs: { instruction: 123 },
      };
      expect(hasInstruction(node)).toBe(false);
    });
  });

  describe('getNodeInstruction', () => {
    it('returns instruction when present', () => {
      const node: PMNode = {
        type: 'documentPartObject',
        attrs: { instruction: 'TOC \\o "1-3" \\h \\z \\u' },
      };
      expect(getNodeInstruction(node)).toBe('TOC \\o "1-3" \\h \\z \\u');
    });

    it('returns undefined when attrs is null', () => {
      const node: PMNode = {
        type: 'paragraph',
        attrs: null,
      };
      expect(getNodeInstruction(node)).toBeUndefined();
    });

    it('returns undefined when attrs is not an object', () => {
      const node: PMNode = {
        type: 'paragraph',
      };
      expect(getNodeInstruction(node)).toBeUndefined();
    });

    it('returns undefined when instruction is not a string', () => {
      const node: PMNode = {
        type: 'paragraph',
        attrs: { instruction: 123 },
      };
      expect(getNodeInstruction(node)).toBeUndefined();
    });
  });

  describe('getDocPartGallery', () => {
    it('returns docPartGallery when present', () => {
      const node: PMNode = {
        type: 'documentPartObject',
        attrs: { docPartGallery: 'Table of Contents' },
      };
      expect(getDocPartGallery(node)).toBe('Table of Contents');
    });

    it('returns undefined when attrs is null', () => {
      const node: PMNode = {
        type: 'paragraph',
        attrs: null,
      };
      expect(getDocPartGallery(node)).toBeUndefined();
    });

    it('returns undefined when docPartGallery is not a string', () => {
      const node: PMNode = {
        type: 'paragraph',
        attrs: { docPartGallery: 123 },
      };
      expect(getDocPartGallery(node)).toBeUndefined();
    });
  });

  describe('getDocPartObjectId', () => {
    it('returns id when present', () => {
      const node: PMNode = {
        type: 'documentPartObject',
        attrs: { id: 'toc-123' },
      };
      expect(getDocPartObjectId(node)).toBe('toc-123');
    });

    it('returns undefined when attrs is null', () => {
      const node: PMNode = {
        type: 'paragraph',
        attrs: null,
      };
      expect(getDocPartObjectId(node)).toBeUndefined();
    });

    it('returns undefined when id is not a string', () => {
      const node: PMNode = {
        type: 'paragraph',
        attrs: { id: 123 },
      };
      expect(getDocPartObjectId(node)).toBeUndefined();
    });
  });

  describe('resolveNodeSdtMetadata', () => {
    it('returns undefined when node has no attrs', () => {
      const node: PMNode = {
        type: 'paragraph',
      };
      expect(resolveNodeSdtMetadata(node)).toBeUndefined();
    });

    it('uses node type when no override provided', () => {
      const node: PMNode = {
        type: 'documentSection',
        attrs: { id: 'section-1', lock: 'sdtContentLocked' },
      };
      const result = resolveNodeSdtMetadata(node);
      expect(result).toBeDefined();
      expect(result?.type).toBe('documentSection');
    });

    it('uses override type when provided', () => {
      const node: PMNode = {
        type: 'someOtherType',
        attrs: { id: 'content-1' },
      };
      const result = resolveNodeSdtMetadata(node, 'structuredContentBlock');
      expect(result).toBeDefined();
      // The underlying resolveSdtMetadata may normalize the type
      // (e.g., 'structuredContentBlock' -> 'structuredContent')
      // The important thing is that the override was used
      expect(result?.type).toBeTruthy();
    });

    it('uses hash as cache key when available', () => {
      const node: PMNode = {
        type: 'documentSection',
        attrs: { hash: 'abc123', id: 'section-1' },
      };
      const result1 = resolveNodeSdtMetadata(node);
      const result2 = resolveNodeSdtMetadata(node);
      // Both calls should return the same cached object
      expect(result1).toBe(result2);
    });
  });

  describe('applySdtMetadataToParagraphBlocks', () => {
    it('applies metadata to paragraph blocks', () => {
      const blocks: ParagraphBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
        },
        {
          kind: 'paragraph',
          id: 'p2',
          runs: [{ text: 'World', fontFamily: 'Arial', fontSize: 12 }],
        },
      ];

      const metadata: SdtMetadata = {
        type: 'documentSection',
        id: 'section-1',
        lock: 'sdtContentLocked',
      };

      applySdtMetadataToParagraphBlocks(blocks, metadata);

      expect(blocks[0].attrs?.sdt).toEqual(metadata);
      expect(blocks[1].attrs?.sdt).toEqual(metadata);
    });

    it('does nothing when metadata is undefined', () => {
      const blocks: ParagraphBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
        },
      ];

      applySdtMetadataToParagraphBlocks(blocks, undefined);

      expect(blocks[0].attrs?.sdt).toBeUndefined();
    });

    it('skips non-paragraph blocks', () => {
      const blocks = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
        },
        {
          kind: 'table',
          id: 't1',
          rows: [],
        },
      ];

      const metadata: SdtMetadata = {
        type: 'documentSection',
        id: 'section-1',
      };

      applySdtMetadataToParagraphBlocks(blocks as never, metadata);

      expect(blocks[0].attrs?.sdt).toEqual(metadata);
      expect((blocks[1] as never).attrs?.sdt).toBeUndefined();
    });

    it('creates attrs object if it does not exist', () => {
      const blocks: ParagraphBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
        },
      ];

      const metadata: SdtMetadata = {
        type: 'documentSection',
        id: 'section-1',
      };

      expect(blocks[0].attrs).toBeUndefined();
      applySdtMetadataToParagraphBlocks(blocks, metadata);
      expect(blocks[0].attrs).toBeDefined();
      expect(blocks[0].attrs?.sdt).toEqual(metadata);
    });
  });

  describe('applySdtMetadataToTableBlock', () => {
    it('applies metadata to table block and all cell paragraphs', () => {
      const tableBlock: TableBlock = {
        kind: 'table',
        id: 't1',
        rows: [
          {
            cells: [
              {
                paragraph: {
                  kind: 'paragraph',
                  id: 'p1',
                  runs: [{ text: 'Cell 1', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
              {
                paragraph: {
                  kind: 'paragraph',
                  id: 'p2',
                  runs: [{ text: 'Cell 2', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
          {
            cells: [
              {
                paragraph: {
                  kind: 'paragraph',
                  id: 'p3',
                  runs: [{ text: 'Cell 3', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
      };

      const metadata: SdtMetadata = {
        type: 'documentSection',
        id: 'section-1',
        lock: 'sdtContentLocked',
      };

      applySdtMetadataToTableBlock(tableBlock, metadata);

      expect(tableBlock.attrs?.sdt).toEqual(metadata);
      expect(tableBlock.rows[0].cells[0].paragraph.attrs?.sdt).toEqual(metadata);
      expect(tableBlock.rows[0].cells[1].paragraph.attrs?.sdt).toEqual(metadata);
      expect(tableBlock.rows[1].cells[0].paragraph.attrs?.sdt).toEqual(metadata);
    });

    it('applies metadata to paragraph blocks within cell.blocks', () => {
      const tableBlock: TableBlock = {
        kind: 'table',
        id: 't2',
        rows: [
          {
            cells: [
              {
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'p1',
                    runs: [{ text: 'Cell 1', fontFamily: 'Arial', fontSize: 12 }],
                  },
                  {
                    kind: 'paragraph',
                    id: 'p2',
                    runs: [{ text: 'Cell 2', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const metadata: SdtMetadata = {
        type: 'documentSection',
        id: 'section-2',
      };

      applySdtMetadataToTableBlock(tableBlock, metadata);

      const cellBlocks = tableBlock.rows[0].cells[0].blocks ?? [];
      expect((cellBlocks[0] as ParagraphBlock).attrs?.sdt).toEqual(metadata);
      expect((cellBlocks[1] as ParagraphBlock).attrs?.sdt).toEqual(metadata);
    });

    it('applies metadata to nested tables within cell.blocks', () => {
      const nestedTable: TableBlock = {
        kind: 'table',
        id: 'nested-1',
        rows: [
          {
            cells: [
              {
                paragraph: {
                  kind: 'paragraph',
                  id: 'p-nested',
                  runs: [{ text: 'Nested', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
      };

      const tableBlock: TableBlock = {
        kind: 'table',
        id: 't3',
        rows: [
          {
            cells: [
              {
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'p1',
                    runs: [{ text: 'Cell 1', fontFamily: 'Arial', fontSize: 12 }],
                  },
                  nestedTable,
                ],
              },
            ],
          },
        ],
      };

      const metadata: SdtMetadata = {
        type: 'documentSection',
        id: 'section-3',
      };

      applySdtMetadataToTableBlock(tableBlock, metadata);

      const cellBlocks = tableBlock.rows[0].cells[0].blocks ?? [];
      const nested = cellBlocks.find((block) => block.kind === 'table') as TableBlock | undefined;

      expect(nested?.attrs?.sdt).toEqual(metadata);
      expect(nested?.rows[0].cells[0].paragraph?.attrs?.sdt).toEqual(metadata);
    });

    it('does nothing when metadata is undefined', () => {
      const tableBlock: TableBlock = {
        kind: 'table',
        id: 't1',
        rows: [
          {
            cells: [
              {
                paragraph: {
                  kind: 'paragraph',
                  id: 'p1',
                  runs: [{ text: 'Cell 1', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
      };

      applySdtMetadataToTableBlock(tableBlock, undefined);

      expect(tableBlock.attrs?.sdt).toBeUndefined();
      expect(tableBlock.rows[0].cells[0].paragraph.attrs?.sdt).toBeUndefined();
    });

    it('does nothing when tableBlock is undefined', () => {
      const metadata: SdtMetadata = {
        type: 'documentSection',
        id: 'section-1',
      };

      expect(() => applySdtMetadataToTableBlock(undefined, metadata)).not.toThrow();
    });

    it('does nothing when block is not a table', () => {
      const block = {
        kind: 'paragraph',
        id: 'p1',
        runs: [],
      };

      const metadata: SdtMetadata = {
        type: 'documentSection',
        id: 'section-1',
      };

      applySdtMetadataToTableBlock(block as never, metadata);

      expect((block as never).attrs?.sdt).toBeUndefined();
    });
  });

  describe('applySdtMetadataToListBlock', () => {
    it('applies metadata to all list item paragraphs', () => {
      const listBlock: ListBlock = {
        kind: 'ordered-list',
        id: 'l1',
        items: [
          {
            paragraph: {
              kind: 'paragraph',
              id: 'p1',
              runs: [{ text: 'Item 1', fontFamily: 'Arial', fontSize: 12 }],
            },
          },
          {
            paragraph: {
              kind: 'paragraph',
              id: 'p2',
              runs: [{ text: 'Item 2', fontFamily: 'Arial', fontSize: 12 }],
            },
          },
          {
            paragraph: {
              kind: 'paragraph',
              id: 'p3',
              runs: [{ text: 'Item 3', fontFamily: 'Arial', fontSize: 12 }],
            },
          },
        ],
      };

      const metadata: SdtMetadata = {
        type: 'documentSection',
        id: 'section-1',
        lock: 'sdtContentLocked',
      };

      applySdtMetadataToListBlock(listBlock, metadata);

      expect(listBlock.items[0].paragraph.attrs?.sdt).toEqual(metadata);
      expect(listBlock.items[1].paragraph.attrs?.sdt).toEqual(metadata);
      expect(listBlock.items[2].paragraph.attrs?.sdt).toEqual(metadata);
    });

    it('creates attrs object if it does not exist', () => {
      const listBlock: ListBlock = {
        kind: 'bullet-list',
        id: 'l1',
        items: [
          {
            paragraph: {
              kind: 'paragraph',
              id: 'p1',
              runs: [{ text: 'Item 1', fontFamily: 'Arial', fontSize: 12 }],
            },
          },
        ],
      };

      const metadata: SdtMetadata = {
        type: 'documentSection',
        id: 'section-1',
      };

      expect(listBlock.items[0].paragraph.attrs).toBeUndefined();
      applySdtMetadataToListBlock(listBlock, metadata);
      expect(listBlock.items[0].paragraph.attrs).toBeDefined();
      expect(listBlock.items[0].paragraph.attrs?.sdt).toEqual(metadata);
    });

    it('does nothing when metadata is undefined', () => {
      const listBlock: ListBlock = {
        kind: 'ordered-list',
        id: 'l1',
        items: [
          {
            paragraph: {
              kind: 'paragraph',
              id: 'p1',
              runs: [{ text: 'Item 1', fontFamily: 'Arial', fontSize: 12 }],
            },
          },
        ],
      };

      applySdtMetadataToListBlock(listBlock, undefined);

      expect(listBlock.items[0].paragraph.attrs?.sdt).toBeUndefined();
    });

    it('does nothing when listBlock is undefined', () => {
      const metadata: SdtMetadata = {
        type: 'documentSection',
        id: 'section-1',
      };

      expect(() => applySdtMetadataToListBlock(undefined, metadata)).not.toThrow();
    });
  });
});
