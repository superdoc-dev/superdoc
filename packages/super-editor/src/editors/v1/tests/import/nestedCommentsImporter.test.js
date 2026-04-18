import { describe, expect, it, beforeAll } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { CommentMarkName } from '@extensions/comment/comments-constants.js';

/**
 * Test for IT-292: Nested comments losing range in SuperDoc
 *
 * Issue: When importing a Word document with nested comment ranges
 * (a larger comment range containing smaller comment ranges),
 * the containing comment's range gets truncated.
 *
 * Expected structure in Word:
 *   <commentRangeStart id="0"/>  <!-- outer comment start -->
 *   text1
 *   <commentRangeStart id="1"/>  <!-- inner comment start -->
 *   text2
 *   <commentRangeEnd id="1"/>    <!-- inner comment end -->
 *   text3
 *   <commentRangeEnd id="0"/>    <!-- outer comment end -->
 *
 * The outer comment (id=0) should span text1+text2+text3
 * The inner comment (id=1) should span only text2
 */
describe('IT-292: Nested comments import', () => {
  const filename = 'nested-comments.docx';
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
  });

  it('should preserve the full range of containing (outer) comments', () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      // Get all comment marks from the document
      const commentRanges = new Map();

      editor.state.doc.descendants((node, pos) => {
        const commentMarks = node.marks?.filter((mark) => mark.type.name === CommentMarkName) || [];

        commentMarks.forEach((mark) => {
          const commentId = mark.attrs.commentId || mark.attrs.importedId;
          if (!commentRanges.has(commentId)) {
            commentRanges.set(commentId, { from: pos, to: pos + node.nodeSize, text: '' });
          } else {
            const existing = commentRanges.get(commentId);
            existing.from = Math.min(existing.from, pos);
            existing.to = Math.max(existing.to, pos + node.nodeSize);
          }

          // Collect text content for debugging
          if (node.isText) {
            const existing = commentRanges.get(commentId);
            existing.text += node.text;
          }
        });
      });

      // We expect at least 2 comments (outer and inner)
      expect(commentRanges.size).toBeGreaterThanOrEqual(2);

      // Get the comments to find the outer (larger) and inner (smaller) ones
      const comments = Array.from(commentRanges.entries()).map(([id, range]) => ({
        id,
        ...range,
        size: range.to - range.from,
      }));

      // Sort by size to identify outer (larger) vs inner (smaller) comments
      comments.sort((a, b) => b.size - a.size);

      const outerComment = comments[0];
      const innerComment = comments[1];

      // The outer comment's range should fully contain the inner comment's range
      expect(outerComment.from).toBeLessThanOrEqual(innerComment.from);
      expect(outerComment.to).toBeGreaterThanOrEqual(innerComment.to);

      // The outer comment should have a larger range than the inner
      expect(outerComment.size).toBeGreaterThan(innerComment.size);

      // CRITICAL: The outer comment's text should include content OUTSIDE the inner comment
      // This is where the bug manifests - the outer comment gets truncated to match the inner
      const outerText = outerComment.text;
      const innerText = innerComment.text;

      // The outer text should be longer and contain content beyond the inner text
      expect(outerText.length).toBeGreaterThan(innerText.length);
      expect(outerText).toContain(innerText);
    } finally {
      editor.destroy();
    }
  });

  it('should correctly apply marks for all nested comments', () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      // Check that we have the expected number of comments
      const importedComments = editor.converter?.comments || [];
      expect(importedComments.length).toBeGreaterThanOrEqual(2);

      // Verify each comment has a corresponding mark in the document
      const foundCommentIds = new Set();

      editor.state.doc.descendants((node) => {
        const commentMarks = node.marks?.filter((mark) => mark.type.name === CommentMarkName) || [];
        commentMarks.forEach((mark) => {
          const id = mark.attrs.commentId || mark.attrs.importedId;
          foundCommentIds.add(id);
        });
      });

      // Each imported comment should have marks in the document
      importedComments.forEach((comment) => {
        const commentId = comment.commentId;
        const hasMarks =
          foundCommentIds.has(commentId) ||
          foundCommentIds.has(comment.importedId) ||
          foundCommentIds.has(String(comment.importedId));
        expect(hasMarks).toBe(true);
      });
    } finally {
      editor.destroy();
    }
  });
});

/**
 * Test round-trip export/import of nested comments
 */
describe('IT-292: Nested comments round-trip', () => {
  const filename = 'nested-comments.docx';
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
  });

  it('should preserve nested comment ranges through export and re-import', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      // First, record the original comment ranges
      const originalRanges = new Map();

      editor.state.doc.descendants((node, pos) => {
        const commentMarks = node.marks?.filter((mark) => mark.type.name === CommentMarkName) || [];
        commentMarks.forEach((mark) => {
          const commentId = mark.attrs.commentId || mark.attrs.importedId;
          if (!originalRanges.has(commentId)) {
            originalRanges.set(commentId, { from: pos, to: pos + node.nodeSize, text: '' });
          } else {
            const existing = originalRanges.get(commentId);
            existing.from = Math.min(existing.from, pos);
            existing.to = Math.max(existing.to, pos + node.nodeSize);
          }
          if (node.isText) {
            const existing = originalRanges.get(commentId);
            existing.text += node.text;
          }
        });
      });

      // Now export the document
      const commentsForExport = editor.converter.comments.map((comment) => {
        const nodes = Array.isArray(comment.elements) && comment.elements.length ? comment.elements : [];
        return {
          ...comment,
          commentJSON: nodes,
        };
      });

      await editor.exportDocx({
        comments: commentsForExport,
        commentsType: 'external',
      });

      const exportedXml = editor.converter.convertedXml;

      // Check the exported document.xml for comment range markers
      const documentXml = exportedXml['word/document.xml'];
      const rangeNodesInOrder = [];

      const traverse = (elements) => {
        if (!Array.isArray(elements)) return;
        for (const el of elements) {
          if (el.name === 'w:commentRangeStart') {
            rangeNodesInOrder.push({ type: 'start', id: el.attributes?.['w:id'] });
          }
          if (el.name === 'w:commentRangeEnd') {
            rangeNodesInOrder.push({ type: 'end', id: el.attributes?.['w:id'] });
          }
          if (el.name === 'w:t' && el.elements?.[0]?.text) {
            rangeNodesInOrder.push({ type: 'text', content: el.elements[0].text });
          }
          if (el.elements) traverse(el.elements);
        }
      };

      traverse(documentXml?.elements || []);

      // Analyze nesting correctness
      const startOrder = rangeNodesInOrder.filter((n) => n.type === 'start').map((n) => n.id);
      const endOrder = rangeNodesInOrder.filter((n) => n.type === 'end').map((n) => n.id);

      const rangeNodes = {
        starts: rangeNodesInOrder.filter((n) => n.type === 'start').map((n) => n.id),
        ends: rangeNodesInOrder.filter((n) => n.type === 'end').map((n) => n.id),
      };

      // All comments should have range markers (3 in our test file: outer + 2 inner)
      expect(rangeNodes.starts).toHaveLength(3);
      expect(rangeNodes.ends).toHaveLength(3);

      // Verify correct nesting: the first comment to start should be the last to end
      // This is the key assertion for IT-292 fix
      const firstStartId = startOrder[0];
      const lastEndId = endOrder[endOrder.length - 1];
      expect(firstStartId).toBe(lastEndId);

      // Also verify that the innermost comments end before the outer ones
      // If start order is [0, 1, 2], end order should have 0 last
      expect(endOrder.indexOf(startOrder[0])).toBe(endOrder.length - 1);

      // Re-import the comments to verify they can be read back
      const { importCommentData } = await import('@converter/v2/importer/documentCommentsImporter.js');
      const { carbonCopy } = await import('@core/utilities/carbonCopy.js');

      const exportedDocx = carbonCopy(exportedXml);
      const reimportedComments = importCommentData({ docx: exportedDocx }) ?? [];

      // All 3 comments should be re-importable from comments.xml
      expect(reimportedComments).toHaveLength(3);
    } finally {
      editor.destroy();
    }
  });
});
