import { beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';

/**
 * IT-554 – Comment threading profile mismatch can silently lose comments.
 *
 * These tests exercise the full export pipeline (Editor.exportDocx) and
 * assert on the final updatedDocs map (what goes into the zip) as well as
 * the actual zipped output.  Three scenarios:
 *
 *   1. Partial profile (nested-comments.docx – has commentsIds but NOT
 *      commentsExtensible).  The old &&-guard dropped commentsIds entirely.
 *
 *   2. Google-Docs profile without threading (gdocs-single-comment.docx –
 *      comments.xml only, single non-threaded comment).  No auxiliary files
 *      should be fabricated.
 *
 *   3. Clean export – zero comment files regardless of input.
 */

const COMMENT_FILES = [
  'word/comments.xml',
  'word/commentsExtended.xml',
  'word/commentsIds.xml',
  'word/commentsExtensible.xml',
];

/** Helper: prepare comments array the same way SuperDoc.exportEditorsToDOCX does */
const prepareCommentsForExport = (converter) =>
  (converter.comments ?? []).map((comment) => {
    const elements = Array.isArray(comment.elements) && comment.elements.length ? comment.elements : undefined;
    return {
      ...comment,
      commentJSON: comment.commentJSON ?? elements,
    };
  });

// ---------------------------------------------------------------------------
// Scenario 1 – Partial profile (3 of 4 files)
// nested-comments.docx has: comments.xml, commentsExtended.xml, commentsIds.xml
// It does NOT have commentsExtensible.xml.
// ---------------------------------------------------------------------------
describe('Partial threading profile (nested-comments.docx)', () => {
  let docx, media, mediaFiles, fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('nested-comments.docx'));
  });

  it('preserves commentsIds.xml and omits commentsExtensible.xml in updatedDocs', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const comments = prepareCommentsForExport(editor.converter);
      expect(comments.length).toBeGreaterThan(0);

      const updatedDocs = await editor.exportDocx({
        comments,
        commentsType: 'external',
        getUpdatedDocs: true,
      });

      // comments.xml must be present (string)
      expect(updatedDocs['word/comments.xml']).toEqual(expect.any(String));

      // commentsExtended.xml must be present (string)
      expect(updatedDocs['word/commentsExtended.xml']).toEqual(expect.any(String));

      // commentsIds.xml must be present — this is the key Fix 1 assertion.
      // Before the fix, the &&-guard dropped it because commentsExtensible was absent.
      expect(updatedDocs['word/commentsIds.xml']).toEqual(expect.any(String));

      // commentsExtensible.xml must be null (was never in the original)
      expect(updatedDocs['word/commentsExtensible.xml']).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it('produces a zip without commentsExtensible.xml', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const comments = prepareCommentsForExport(editor.converter);
      const blob = await editor.exportDocx({
        comments,
        commentsType: 'external',
      });

      const zipper = new DocxZipper();
      const zip = await zipper.unzip(blob);

      expect(zip.file('word/comments.xml')).not.toBeNull();
      expect(zip.file('word/commentsExtended.xml')).not.toBeNull();
      expect(zip.file('word/commentsIds.xml')).not.toBeNull();
      expect(zip.file('word/commentsExtensible.xml')).toBeNull();

      // Content types must reference the three present files but NOT commentsExtensible
      const contentTypes = await zip.file('[Content_Types].xml').async('string');
      expect(contentTypes).toContain('/word/comments.xml');
      expect(contentTypes).toContain('/word/commentsExtended.xml');
      expect(contentTypes).toContain('/word/commentsIds.xml');
      expect(contentTypes).not.toContain('/word/commentsExtensible.xml');
    } finally {
      editor.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 – Google Docs profile, no threading (comments.xml only)
// gdocs-single-comment.docx has: comments.xml with 1 non-threaded comment.
// No commentsExtended / commentsIds / commentsExtensible.
// Since there are no threaded comments, the exporter should NOT fabricate
// auxiliary files — the range-based threading model is preserved.
// ---------------------------------------------------------------------------
describe('Google Docs profile without threading (gdocs-single-comment.docx)', () => {
  let docx, media, mediaFiles, fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('gdocs-single-comment.docx'));
  });

  it('emits only comments.xml — no auxiliary files fabricated', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const comments = prepareCommentsForExport(editor.converter);
      expect(comments.length).toBeGreaterThan(0);

      const updatedDocs = await editor.exportDocx({
        comments,
        commentsType: 'external',
        getUpdatedDocs: true,
      });

      // comments.xml must be present
      expect(updatedDocs['word/comments.xml']).toEqual(expect.any(String));

      // The three auxiliary files must all be null (removed / never existed)
      expect(updatedDocs['word/commentsExtended.xml']).toBeNull();
      expect(updatedDocs['word/commentsIds.xml']).toBeNull();
      expect(updatedDocs['word/commentsExtensible.xml']).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it('produces a zip with only comments.xml', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const comments = prepareCommentsForExport(editor.converter);
      const blob = await editor.exportDocx({
        comments,
        commentsType: 'external',
      });

      const zipper = new DocxZipper();
      const zip = await zipper.unzip(blob);

      expect(zip.file('word/comments.xml')).not.toBeNull();
      expect(zip.file('word/commentsExtended.xml')).toBeNull();
      expect(zip.file('word/commentsIds.xml')).toBeNull();
      expect(zip.file('word/commentsExtensible.xml')).toBeNull();

      const contentTypes = await zip.file('[Content_Types].xml').async('string');
      expect(contentTypes).toContain('/word/comments.xml');
      expect(contentTypes).not.toContain('/word/commentsExtended.xml');
      expect(contentTypes).not.toContain('/word/commentsIds.xml');
      expect(contentTypes).not.toContain('/word/commentsExtensible.xml');
    } finally {
      editor.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2b – Google Docs profile WITH threading
// nested-comments-gdocs.docx has: comments.xml only, but comments include
// threaded replies.  The exporter correctly fabricates commentsExtended.xml
// so Word can display the thread — this is intentional.
// ---------------------------------------------------------------------------
describe('Google Docs profile with threading (nested-comments-gdocs.docx)', () => {
  let docx, media, mediaFiles, fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('nested-comments-gdocs.docx'));
  });

  it('fabricates commentsExtended.xml for threaded comments', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const comments = prepareCommentsForExport(editor.converter);
      expect(comments.length).toBeGreaterThan(1);

      const updatedDocs = await editor.exportDocx({
        comments,
        commentsType: 'external',
        getUpdatedDocs: true,
      });

      // comments.xml must be present
      expect(updatedDocs['word/comments.xml']).toEqual(expect.any(String));

      // commentsExtended.xml IS fabricated because threaded replies exist —
      // Word needs it to display the threading correctly.
      expect(updatedDocs['word/commentsExtended.xml']).toEqual(expect.any(String));

      // commentsIds and commentsExtensible remain null (not in original, not needed)
      expect(updatedDocs['word/commentsIds.xml']).toBeNull();
      expect(updatedDocs['word/commentsExtensible.xml']).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 – Clean export (zero comment files)
// Uses nested-comments.docx (3-file profile) to prove all parts are removed.
// ---------------------------------------------------------------------------
describe('Clean export strips all comment files', () => {
  let docx, media, mediaFiles, fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('nested-comments.docx'));
  });

  it('sets all four comment files to null in updatedDocs', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const updatedDocs = await editor.exportDocx({
        commentsType: 'clean',
        getUpdatedDocs: true,
      });

      for (const file of COMMENT_FILES) {
        expect(updatedDocs[file]).toBeNull();
      }

      // Content types must not reference any comment file
      const contentTypes = updatedDocs['[Content_Types].xml'];
      expect(contentTypes).toBeDefined();
      for (const file of COMMENT_FILES) {
        expect(contentTypes).not.toContain(`/${file}`);
      }
    } finally {
      editor.destroy();
    }
  });

  it('produces a zip with zero comment files', async () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const blob = await editor.exportDocx({ commentsType: 'clean' });
      const zipper = new DocxZipper();
      const zip = await zipper.unzip(blob);

      for (const file of COMMENT_FILES) {
        expect(zip.file(file)).toBeNull();
      }

      const contentTypes = await zip.file('[Content_Types].xml').async('string');
      for (const file of COMMENT_FILES) {
        expect(contentTypes).not.toContain(`/${file}`);
      }

      // Relationships should not reference any comment files
      const rels = await zip.file('word/_rels/document.xml.rels').async('string');
      expect(rels).not.toContain('comments.xml');
      expect(rels).not.toContain('commentsExtended.xml');
      expect(rels).not.toContain('commentsIds.xml');
      expect(rels).not.toContain('commentsExtensible.xml');
    } finally {
      editor.destroy();
    }
  });
});
