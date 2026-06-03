import { beforeAll, describe, expect, it } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { importCommentData } from '@converter/v2/importer/documentCommentsImporter.js';

// AIDEV-NOTE: SD-2528 — a comment attached to a tracked change must remain
// associated with that tracked change after a SuperDoc round-trip (export →
// re-import). The fixture used here is a real Google-Docs-originated DOCX that
// contains four TC+comment pairings (one delete, two inserts, one replace).
// The test asserts both halves of the association:
//   1. The exported document.xml places each `w:commentRangeStart` inside the
//      `w:ins`/`w:del` wrapper that owns its anchored text — the only shape the
//      importer's `extractCommentRangesFromDocument` walker recognises.
//   2. After re-importing the exported XML, every comment that was originally
//      `trackedChange: true` still carries that flag.

const getCommentJSONNodes = (comment) => {
  if (Array.isArray(comment.elements) && comment.elements.length) {
    return comment.elements;
  }
  return [];
};

const collectTrackedChangeIdsContainingCommentStarts = (documentXml) => {
  const result = new Map();
  const walk = (elements, currentTcId) => {
    if (!Array.isArray(elements)) return;
    for (const el of elements) {
      if (el?.name === 'w:commentRangeStart' && currentTcId != null) {
        result.set(el.attributes?.['w:id'], currentTcId);
      }
      const isTc = el?.name === 'w:ins' || el?.name === 'w:del';
      const nextTcId = isTc ? (el.attributes?.['w:id'] ?? currentTcId) : currentTcId;
      walk(el?.elements, nextTcId);
    }
  };
  walk(documentXml?.elements ?? []);
  return result;
};

describe('SD-2528: tracked-change + comment round-trip', () => {
  const filename = 'Google Docs Originated comments & TCs.docx';
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
  });

  it('preserves the comment ↔ tracked-change association after export and re-import', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const originalTcComments = editor.converter.comments.filter((c) => !!c.trackedChangeParentId);
      expect(originalTcComments.length).toBeGreaterThan(0);

      // The id space the comments importer uses (trackedChangeIdMap) must match
      // the id space the ins/del translators use (trackedChangeIdMapsByPart).
      // Otherwise the user comment's trackedChangeParentId never matches the
      // tracked-change mark id in the PM doc and accept/reject can't cascade.
      const bodyMap = editor.converter.trackedChangeIdMapsByPart?.get('word/document.xml');
      const globalMap = editor.converter.trackedChangeIdMap;
      expect(bodyMap).toBeDefined();
      expect(globalMap).toBeDefined();
      expect([...globalMap.entries()]).toEqual([...bodyMap.entries()]);

      const tcMarkIds = new Set();
      editor.state.doc.descendants((node) => {
        if (!node.isInline) return;
        for (const m of node.marks || []) {
          if (m.type.name === 'trackInsert' || m.type.name === 'trackDelete') tcMarkIds.add(m.attrs?.id);
        }
      });
      originalTcComments.forEach((comment) => {
        expect(tcMarkIds.has(comment.trackedChangeParentId)).toBe(true);
      });

      const commentsForExport = editor.converter.comments.map((comment) => ({
        ...comment,
        commentJSON: getCommentJSONNodes(comment),
      }));

      await editor.exportDocx({ comments: commentsForExport, commentsType: 'external' });

      const exportedXml = editor.converter.convertedXml;
      const startsInsideTc = collectTrackedChangeIdsContainingCommentStarts(exportedXml['word/document.xml']);
      expect(startsInsideTc.size).toBeGreaterThanOrEqual(originalTcComments.length);

      const exportedDocx = carbonCopy(exportedXml);
      const reimportedComments = importCommentData({ docx: exportedDocx, converter: editor.converter }) ?? [];
      expect(reimportedComments.length).toBe(editor.converter.comments.length);

      const tcCommentsAfterRoundTrip = reimportedComments.filter((c) => !!c.trackedChangeParentId);
      expect(tcCommentsAfterRoundTrip.length).toBe(originalTcComments.length);
    } finally {
      editor.destroy();
    }
  });
});
