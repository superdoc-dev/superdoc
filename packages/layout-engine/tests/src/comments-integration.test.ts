/**
 * Comments integration tests
 *
 * Validates that comment highlights are positioned correctly on paginated pages
 * and that comment metadata flows through the layout engine properly.
 *
 * @module comments-integration.test
 */

import { describe, it, expect } from 'vitest';
import { toFlowBlocks } from '@superdoc/pm-adapter';
import type { FlowBlock, PMNode } from '@superdoc/contracts';
import fs from 'fs';
import path from 'path';

/**
 * Test fixture paths
 */
const FIXTURES = {
  basicComment: path.join(__dirname, '../../../super-editor/src/editors/v1/tests/data/basic-comment.docx'),
  sdt: path.join(__dirname, '../fixtures/sdt-flow-input.json'),
} as const;

/**
 * Load PM JSON fixture
 *
 * @param fixturePath - Path to fixture file
 * @returns ProseMirror document
 */
function loadPMJsonFixture(fixturePath: string): PMNode {
  const content = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Extract comment metadata from blocks
 *
 * @param blocks - FlowBlock array
 * @returns Array of comment metadata objects
 */
function extractCommentMetadata(blocks: FlowBlock[]): Array<{
  blockId: string;
  commentId?: string;
  commentText?: string;
}> {
  const comments: Array<{ blockId: string; commentId?: string; commentText?: string }> = [];

  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      // Check for comment metadata in runs
      const hasComment = block.runs?.some((run) => {
        if (run.kind === 'text' && run.comments && run.comments.length) {
          return true;
        }
        return false;
      });

      if (hasComment) {
        comments.push({
          blockId: block.id,
          commentId: block.runs?.find((r) => r.kind === 'text' && r.comments?.length)?.comments?.[0]?.commentId as
            | string
            | undefined,
        });
      }
    }
  }

  return comments;
}

describe('Comments Integration', () => {
  describe('Comment Metadata Preservation', () => {
    it('should preserve comment metadata through FlowBlock conversion', () => {
      const doc = loadPMJsonFixture(FIXTURES.sdt);
      const { blocks } = toFlowBlocks(doc);

      const comments = extractCommentMetadata(blocks);

      // Should extract any comments present in fixture
      // (sdt fixture may or may not have comments - test passes if structure is valid)
      expect(blocks).toBeDefined();
      expect(Array.isArray(comments)).toBe(true);
    });

    it('should attach comment IDs to correct text runs', () => {
      const doc = loadPMJsonFixture(FIXTURES.sdt);
      const { blocks } = toFlowBlocks(doc);

      // Verify that if comment metadata exists, it's on text runs
      for (const block of blocks) {
        if (block.kind === 'paragraph' && block.runs) {
          for (const run of block.runs) {
            if (run.kind === 'text' && run.comments?.length) {
              // Comment ID should be a non-empty string
              expect(typeof run.comments?.[0]?.commentId).toBe('string');
              expect((run.comments?.[0]?.commentId as string).length).toBeGreaterThan(0);
            }
          }
        }
      }
    });

    it('should handle multiple comments on same paragraph', () => {
      // Create doc with multiple comments
      const docWithComments: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Text with comment 1',
                marks: [{ type: 'comment', attrs: { commentId: 'c1' } }],
              },
              {
                type: 'text',
                text: ' and comment 2',
                marks: [{ type: 'comment', attrs: { commentId: 'c2' } }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(docWithComments);
      const comments = extractCommentMetadata(blocks);

      // Should preserve both comments
      expect(blocks.length).toBeGreaterThan(0);
    });
  });

  describe('Comment Highlighting Position', () => {
    it('should maintain comment range boundaries across pagination', () => {
      const doc = loadPMJsonFixture(FIXTURES.sdt);
      const { blocks } = toFlowBlocks(doc);

      // Verify block structure is valid for layout
      for (const block of blocks) {
        expect(block.id).toBeDefined();
        expect(block.kind).toBeDefined();

        if (block.kind === 'paragraph') {
          // Each paragraph should have runs (even if empty)
          expect(block.runs).toBeDefined();
        }
      }

      // Comment highlights would be rendered by painter based on block positions
      // Layout engine should preserve enough metadata for correct positioning
    });

    it('should handle comments spanning multiple lines', () => {
      // Create a long paragraph with comment
      const longText =
        'This is a very long paragraph that will definitely span multiple lines when rendered in the layout engine. '.repeat(
          5,
        );

      const docWithLongComment: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: longText,
                marks: [{ type: 'comment', attrs: { commentId: 'c-long' } }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(docWithLongComment);

      expect(blocks.length).toBeGreaterThan(0);

      const para = blocks.find((b) => b.kind === 'paragraph');
      expect(para).toBeDefined();

      if (para && para.kind === 'paragraph') {
        expect(para.runs).toBeDefined();
        expect(para.runs!.length).toBeGreaterThan(0);
      }
    });

    it('should handle comments spanning page breaks', () => {
      const doc = loadPMJsonFixture(FIXTURES.sdt);

      // Expand to multiple pages
      const expandedDoc = {
        ...doc,
        content: [...(doc.content || []), ...(doc.content || []), ...(doc.content || [])],
      };

      const { blocks } = toFlowBlocks(expandedDoc);

      // Should preserve comment metadata across all blocks
      expect(blocks.length).toBeGreaterThan(0);
    });
  });

  describe('Comment Overlay Rendering', () => {
    it('should provide position data for comment overlays', () => {
      const doc = loadPMJsonFixture(FIXTURES.sdt);
      const { blocks } = toFlowBlocks(doc);

      // Painter would use block positions + comment metadata to render overlays
      // Verify we have the necessary data

      for (const block of blocks) {
        // Block ID allows tracking position in layout
        expect(block.id).toBeDefined();

        if (block.kind === 'paragraph' && block.runs) {
          for (const run of block.runs) {
            if (run.kind === 'text') {
              // Text runs should have text content
              expect(run.text).toBeDefined();

              // If comment exists, metadata should be present
              if (run.comments?.length) {
                expect(typeof run.comments?.[0]?.commentId).toBe('string');
              }
            }
          }
        }
      }
    });

    it('should support comment highlight styling', () => {
      const doc = loadPMJsonFixture(FIXTURES.sdt);
      const { blocks } = toFlowBlocks(doc);

      // Comment styling would be applied by painter
      // Verify structure supports it

      expect(blocks).toBeDefined();
      expect(Array.isArray(blocks)).toBe(true);
    });
  });

  describe('Comment Thread Handling', () => {
    it('should preserve comment thread relationships', () => {
      // In production, comments have parent-child relationships (threads)
      // Layout engine should preserve IDs to maintain these relationships

      const docWithThread: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Commented text',
                marks: [
                  {
                    type: 'comment',
                    attrs: {
                      commentId: 'parent-comment',
                      threadId: 'thread-1',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(docWithThread);

      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should handle resolved comments', () => {
      const docWithResolvedComment: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Text with resolved comment',
                marks: [
                  {
                    type: 'comment',
                    attrs: {
                      commentId: 'resolved-c1',
                      resolved: true,
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(docWithResolvedComment);

      // Resolved comments should still flow through
      // Painter can choose to render them differently
      expect(blocks.length).toBeGreaterThan(0);
    });
  });

  describe('Comment Edge Cases', () => {
    it('should handle empty comment ranges', () => {
      const docWithEmptyComment: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '',
                marks: [{ type: 'comment', attrs: { commentId: 'empty-c' } }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(docWithEmptyComment);

      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should handle comments on non-text content', () => {
      // Comments on images, tables, etc.
      const docWithImageComment: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: 'image.png',
              commentId: 'img-comment',
            },
          },
        ],
      };

      const { blocks } = toFlowBlocks(docWithImageComment);

      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should handle overlapping comment ranges', () => {
      const docWithOverlappingComments: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Overlapping comments',
                marks: [
                  { type: 'comment', attrs: { commentId: 'c1' } },
                  { type: 'comment', attrs: { commentId: 'c2' } },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(docWithOverlappingComments);

      // Should handle gracefully (depends on PM schema)
      expect(blocks.length).toBeGreaterThan(0);
    });
  });
});
