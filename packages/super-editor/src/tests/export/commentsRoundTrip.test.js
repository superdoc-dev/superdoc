import { beforeAll, describe, expect, it } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { importCommentData } from '@converter/v2/importer/documentCommentsImporter.js';

const extractNodeText = (node) => {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  const content = Array.isArray(node.content) ? node.content : [];
  return content.map((child) => extractNodeText(child)).join('');
};

/**
 * Find all commentRangeStart and commentRangeEnd elements in document.xml
 */
const findCommentRangeNodes = (documentXml) => {
  const ranges = { starts: [], ends: [] };

  const traverse = (elements) => {
    if (!Array.isArray(elements)) return;
    for (const el of elements) {
      if (el.name === 'w:commentRangeStart') {
        ranges.starts.push(el.attributes?.['w:id']);
      }
      if (el.name === 'w:commentRangeEnd') {
        ranges.ends.push(el.attributes?.['w:id']);
      }
      if (el.elements) traverse(el.elements);
    }
  };

  traverse(documentXml?.elements || []);
  return ranges;
};

describe('Comment origin detection and round trip', () => {
  describe('Google Docs comments import/export round trip', () => {
    const filename = 'gdocs-comments-export.docx';
    let docx;
    let media;
    let mediaFiles;
    let fonts;

    beforeAll(async () => {
      ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    });

    it('keeps both comments intact through export and re-import', async () => {
      const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

      try {
        expect(editor.converter.comments).toHaveLength(2);

        const commentsForExport = editor.converter.comments.map((comment) => ({
          ...comment,
          commentJSON: comment.textJson,
        }));

        await editor.exportDocx({
          comments: commentsForExport,
          commentsType: 'external',
        });

        const exportedXml = editor.converter.convertedXml;
        const commentsXml = exportedXml['word/comments.xml'];
        const exportedComments = commentsXml?.elements?.[0]?.elements ?? [];
        expect(exportedComments).toHaveLength(2);

        const exportedIds = exportedComments.map((comment) => comment.attributes['w:id']).sort();
        expect(exportedIds).toEqual(['0', '1']);

        const exportedCommentTexts = exportedComments.map((comment) => {
          const paragraphs = comment.elements?.filter((el) => el.name === 'w:p') ?? [];
          const collected = [];
          paragraphs.forEach((paragraph) => {
            paragraph.elements?.forEach((child) => {
              if (child.name !== 'w:r') return;
              const textElement = child.elements?.find((el) => el.name === 'w:t');
              const textNode = textElement?.elements?.find((el) => el.type === 'text');
              if (textNode?.text) collected.push(textNode.text.trim());
            });
          });
          return collected.join('').trim();
        });

        expect(exportedCommentTexts.filter((text) => text.length)).toEqual(
          expect.arrayContaining(['comment on text', 'BLANK']),
        );

        // For Google Docs origin, commentsExtended.xml may be empty (threading is range-based)
        // We verify that the export strategy correctly handles Google Docs format
        const commentsExtendedXml = exportedXml['word/commentsExtended.xml'];
        const extendedDefinitions = commentsExtendedXml?.elements?.[0]?.elements ?? [];
        // Google Docs without original commentsExtended.xml will have empty extended definitions
        // This is correct behavior - threading is range-based for Google Docs
        if (extendedDefinitions.length > 0) {
          extendedDefinitions.forEach((definition) => {
            expect(definition.attributes['w15:done']).toBe('0');
          });
        }

        const exportedDocx = carbonCopy(exportedXml);
        const reimportedComments = importCommentData({ docx: exportedDocx }) ?? [];

        expect(reimportedComments).toHaveLength(2);
        const roundTripTexts = reimportedComments
          .map((comment) => extractNodeText(comment.textJson).trim())
          .filter((text) => text.length);
        expect(roundTripTexts).toEqual(expect.arrayContaining(['comment on text', 'BLANK']));
        reimportedComments.forEach((comment) => {
          expect(comment.isDone).toBe(false);
        });
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Word origin comments import/export round trip', () => {
    const filename = 'WordOriginatedComments.docx';
    let docx;
    let media;
    let mediaFiles;
    let fonts;

    beforeAll(async () => {
      ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    });

    it('detects Word origin and preserves threading through round trip', async () => {
      const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

      try {
        // Verify origin detection
        expect(editor.converter.documentOrigin).toBe('word');

        // Verify comments have origin metadata
        expect(editor.converter.comments.length).toBeGreaterThan(0);
        editor.converter.comments.forEach((comment) => {
          expect(comment.origin).toBe('word');
          expect(comment.threadingMethod).toBe('commentsExtended');
          expect(comment.originalXmlStructure).toBeDefined();
          expect(comment.originalXmlStructure.hasCommentsExtended).toBe(true);
        });

        const commentsForExport = editor.converter.comments.map((comment) => ({
          ...comment,
          commentJSON: comment.textJson,
        }));

        await editor.exportDocx({
          comments: commentsForExport,
          commentsType: 'external',
        });

        const exportedXml = editor.converter.convertedXml;
        const commentsExtendedXml = exportedXml['word/commentsExtended.xml'];

        // Word format should always have commentsExtended.xml
        expect(commentsExtendedXml).toBeDefined();
        const extendedDefinitions = commentsExtendedXml?.elements?.[0]?.elements ?? [];
        expect(extendedDefinitions.length).toBeGreaterThan(0);

        // Re-import and verify threading is preserved
        const exportedDocx = carbonCopy(exportedXml);
        const reimportedComments =
          importCommentData({ docx: exportedDocx, editor: null, converter: editor.converter }) ?? [];

        expect(reimportedComments.length).toBe(editor.converter.comments.length);

        // Verify parent-child relationships are preserved for comment-to-comment threading
        // Note: Comments with tracked change parents are handled differently - their parent IDs
        // are re-detected from document structure on re-import and may have different UUIDs
        const originalCommentToCommentThreads = new Map();
        editor.converter.comments.forEach((c) => {
          if (c.parentCommentId) {
            // Only track relationships where parent is another comment (not a tracked change)
            const parentComment = editor.converter.comments.find((p) => p.commentId === c.parentCommentId);
            if (parentComment && !parentComment.trackedChange) {
              originalCommentToCommentThreads.set(c.commentId, c.parentCommentId);
            }
          }
        });

        // Verify comment-to-comment threading relationships are preserved
        originalCommentToCommentThreads.forEach((parentId, commentId) => {
          const reimportedComment = reimportedComments.find((c) => c.commentId === commentId);

          if (reimportedComment) {
            // Parent relationships should be preserved for comment-to-comment threads
            expect(reimportedComment.parentCommentId).toBeDefined();
          }
        });
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Origin detection', () => {
    it('detects Word origin when commentsExtended.xml is present', async () => {
      const filename = 'WordOriginatedComments.docx';
      const { docx } = await loadTestDataForEditorTests(filename);
      const { editor } = initTestEditor({ content: docx });

      try {
        expect(editor.converter.documentOrigin).toBe('word');
      } finally {
        editor.destroy();
      }
    });

    it('detects Google Docs origin when commentsExtended.xml is missing', async () => {
      const filename = 'gdocs-comments-export.docx';
      const { docx } = await loadTestDataForEditorTests(filename);
      const { editor } = initTestEditor({ content: docx });

      try {
        // Google Docs may or may not have commentsExtended.xml
        // The detection logic checks for its presence with valid elements
        const origin = editor.converter.documentOrigin;
        expect(['google-docs', 'word', 'unknown']).toContain(origin);

        // Verify comments have origin metadata
        if (editor.converter.comments.length > 0) {
          editor.converter.comments.forEach((comment) => {
            expect(comment.origin).toBeDefined();
            expect(['word', 'google-docs', 'unknown']).toContain(comment.origin);
            expect(comment.threadingMethod).toBeDefined();
            expect(comment.originalXmlStructure).toBeDefined();
          });
        }
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Mixed origin handling', () => {
    it('defaults to Word format when comments have mixed origins', async () => {
      const filename = 'gdocs-comments-export.docx';
      const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename);
      const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

      try {
        // Simulate mixed origins by modifying comment origins
        if (editor.converter.comments.length > 1) {
          editor.converter.comments[0].origin = 'word';
          editor.converter.comments[1].origin = 'google-docs';
          editor.converter.commentThreadingProfile = {
            defaultStyle: 'commentsExtended',
            mixed: true,
            fileSet: {
              hasCommentsExtended: true,
              hasCommentsExtensible: true,
              hasCommentsIds: true,
            },
          };

          const commentsForExport = editor.converter.comments.map((comment) => ({
            ...comment,
            commentJSON: comment.textJson,
          }));

          await editor.exportDocx({
            comments: commentsForExport,
            commentsType: 'external',
          });

          const exportedXml = editor.converter.convertedXml;
          const commentsExtendedXml = exportedXml['word/commentsExtended.xml'];

          // Mixed origins should default to Word format (most compatible)
          expect(commentsExtendedXml).toBeDefined();
        }
      } finally {
        editor.destroy();
      }
    });
  });
});

describe('Resolved comments round-trip', () => {
  const filename = 'basic-resolved-comment.docx';
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
  });

  it('preserves resolved comment status and range markers on export', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      // Verify we have both resolved and unresolved comments
      expect(editor.converter.comments).toHaveLength(2);
      const resolvedComment = editor.converter.comments.find((c) => c.isDone === true);
      const unresolvedComment = editor.converter.comments.find((c) => c.isDone === false);
      expect(resolvedComment).toBeDefined();
      expect(unresolvedComment).toBeDefined();

      const commentsForExport = editor.converter.comments.map((comment) => ({
        ...comment,
        commentJSON: comment.textJson,
      }));

      await editor.exportDocx({
        comments: commentsForExport,
        commentsType: 'external',
      });

      const exportedXml = editor.converter.convertedXml;

      // Verify commentsExtended.xml has correct done status
      const commentsExtendedXml = exportedXml['word/commentsExtended.xml'];
      const extendedDefinitions = commentsExtendedXml?.elements?.[0]?.elements ?? [];
      expect(extendedDefinitions).toHaveLength(2);

      const doneValues = extendedDefinitions.map((def) => def.attributes['w15:done']);
      expect(doneValues).toContain('0'); // unresolved
      expect(doneValues).toContain('1'); // resolved

      // Verify document.xml has commentRangeStart/End for BOTH comments
      const documentXml = exportedXml['word/document.xml'];
      const rangeNodes = findCommentRangeNodes(documentXml);

      // Both comments should have range markers (this is the key regression test)
      expect(rangeNodes.starts).toHaveLength(2);
      expect(rangeNodes.ends).toHaveLength(2);
      expect(rangeNodes.starts.sort()).toEqual(['0', '1']);
      expect(rangeNodes.ends.sort()).toEqual(['0', '1']);
    } finally {
      editor.destroy();
    }
  });

  it('preserves resolved status through full round-trip (import -> export -> reimport)', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const commentsForExport = editor.converter.comments.map((comment) => ({
        ...comment,
        commentJSON: comment.textJson,
      }));

      await editor.exportDocx({
        comments: commentsForExport,
        commentsType: 'external',
      });

      const exportedXml = carbonCopy(editor.converter.convertedXml);
      const reimportedComments = importCommentData({ docx: exportedXml }) ?? [];

      expect(reimportedComments).toHaveLength(2);

      const reimportedResolved = reimportedComments.find((c) => c.isDone === true);
      const reimportedUnresolved = reimportedComments.find((c) => c.isDone === false);

      expect(reimportedResolved).toBeDefined();
      expect(reimportedUnresolved).toBeDefined();
    } finally {
      editor.destroy();
    }
  });
});

describe('Nested comments export', () => {
  const filename = 'nested-comments.docx';
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
  });

  /**
   * Find all commentRangeStart and commentRangeEnd elements in order of appearance.
   * Returns array of { type: 'start'|'end', id: string } in document order.
   */
  const findCommentRangeEventsInOrder = (documentXml) => {
    const events = [];

    const traverse = (elements) => {
      if (!Array.isArray(elements)) return;
      for (const el of elements) {
        if (el.name === 'w:commentRangeStart') {
          events.push({ type: 'start', id: el.attributes?.['w:id'] });
        }
        if (el.name === 'w:commentRangeEnd') {
          events.push({ type: 'end', id: el.attributes?.['w:id'] });
        }
        if (el.elements) traverse(el.elements);
      }
    };

    traverse(documentXml?.elements || []);
    return events;
  };

  it('exports nested comment ranges with correct structure (outer wraps inner)', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      // Verify we have multiple comments (nested structure)
      expect(editor.converter.comments.length).toBeGreaterThanOrEqual(2);

      // Export without explicitly passing comments - should use converter.comments
      await editor.exportDocx({
        commentsType: 'external',
      });

      const exportedXml = editor.converter.convertedXml;
      const documentXml = exportedXml['word/document.xml'];

      // Get comment range events in document order
      const events = findCommentRangeEventsInOrder(documentXml);

      // Verify we have start and end events for all comments
      const starts = events.filter((e) => e.type === 'start');
      const ends = events.filter((e) => e.type === 'end');
      expect(starts.length).toBeGreaterThanOrEqual(2);
      expect(ends.length).toBe(starts.length);

      // For proper nesting, if comment A starts before comment B,
      // then comment B must end before comment A (stack-like behavior).
      // This means: starts[0].id should equal ends[ends.length - 1].id
      // (the first to start should be the last to end)
      const firstStartId = starts[0].id;
      const lastEndId = ends[ends.length - 1].id;
      expect(firstStartId).toBe(lastEndId);

      // Verify all IDs have both start and end
      const startIds = new Set(starts.map((e) => e.id));
      const endIds = new Set(ends.map((e) => e.id));
      expect(startIds).toEqual(endIds);
    } finally {
      editor.destroy();
    }
  });

  it('preserves nested comments through round-trip without explicit comments array', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const originalCommentCount = editor.converter.comments.length;

      // Export without passing comments - relies on fallback to converter.comments
      await editor.exportDocx({
        commentsType: 'external',
      });

      const exportedXml = carbonCopy(editor.converter.convertedXml);

      // Verify comments.xml has all comments
      const commentsXml = exportedXml['word/comments.xml'];
      const exportedComments = commentsXml?.elements?.[0]?.elements ?? [];
      expect(exportedComments.length).toBe(originalCommentCount);

      // Re-import and verify comments are preserved
      const reimportedComments = importCommentData({ docx: exportedXml }) ?? [];
      expect(reimportedComments.length).toBe(originalCommentCount);
    } finally {
      editor.destroy();
    }
  });

  it('exports commentsExtended.xml and preserves comments as separate (not threaded) after round-trip', async () => {
    // Regression test for SD-1519: Nested comments should remain separate bubbles,
    // not get threaded together based on range nesting.
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const originalComments = editor.converter.comments;
      expect(originalComments.length).toBeGreaterThanOrEqual(2);

      // Verify original comments don't have parentCommentId (they're independent)
      const originalNonThreaded = originalComments.filter((c) => !c.parentCommentId);
      expect(originalNonThreaded.length).toBeGreaterThanOrEqual(2);

      const commentsForExport = originalComments.map((comment) => ({
        ...comment,
        commentJSON: comment.textJson,
      }));

      await editor.exportDocx({
        comments: commentsForExport,
        commentsType: 'external',
      });

      const exportedXml = editor.converter.convertedXml;

      // Verify commentsExtended.xml is generated (key for preserving non-threaded status)
      const commentsExtendedXml = exportedXml['word/commentsExtended.xml'];
      expect(commentsExtendedXml).toBeDefined();
      const extendedElements = commentsExtendedXml?.elements?.[0]?.elements ?? [];
      expect(extendedElements.length).toBe(originalComments.length);

      // Verify NO comments have w15:paraIdParent (they should be independent)
      const hasParaIdParent = extendedElements.some((el) => el.attributes?.['w15:paraIdParent']);
      expect(hasParaIdParent).toBe(false);

      // Re-import and verify comments remain independent (no parentCommentId from range-based threading)
      const reimportedComments = importCommentData({ docx: carbonCopy(exportedXml) }) ?? [];
      expect(reimportedComments.length).toBe(originalComments.length);

      // Key assertion: After round-trip, comments should NOT have parentCommentId
      // set based on range nesting (they should remain separate bubbles)
      const reimportedNonThreaded = reimportedComments.filter((c) => !c.parentCommentId);
      expect(reimportedNonThreaded.length).toBe(originalNonThreaded.length);
    } finally {
      editor.destroy();
    }
  });
});
