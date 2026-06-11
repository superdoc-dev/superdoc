import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

// SD-3358 / TC-EDIT-018: a contiguous same-author deletion authored
// keystroke-by-keystroke in suggesting mode must surface as ONE logical tracked
// deletion, not one per character — and that must hold across run seams,
// including Google-Docs comment-anchor markers that sit between runs.

test.use({ config: { toolbar: 'full', comments: 'off', trackChanges: true } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GD_DOC_PATH = path.resolve(__dirname, '../../test-data/comments-tcs/gd-open-comment.docx');

const REVIEWER = { name: 'Guest Reviewer', email: 'track@example.com' };

/** Group tracked-deletion text by logical change id. One id == one logical deletion. */
const snapshotTrackDeletesById = (superdoc: SuperDocFixture): Promise<Record<string, string>> =>
  superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const deleteById: Record<string, string> = {};
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      for (const mark of node.marks ?? []) {
        if (mark.type?.name !== 'trackDelete') continue;
        const id = String(mark.attrs?.id ?? '');
        if (!id) continue;
        deleteById[id] = (deleteById[id] ?? '') + node.text;
      }
    });
    return deleteById;
  });

const setReviewer = (superdoc: SuperDocFixture): Promise<void> =>
  superdoc.page.evaluate((user) => {
    (window as any).editor.setOptions({ user });
  }, REVIEWER);

test('contiguous Backspace deletion in suggesting mode is ONE tracked deletion (single run)', async ({ superdoc }) => {
  await setReviewer(superdoc);
  // Author normal content in editing mode, then switch to suggesting so the
  // deletion is tracked (deleting an own insertion would collapse instead).
  await superdoc.type('Alpha Beta');
  await superdoc.waitForStable();
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const pos = await superdoc.findTextPos('Beta');
  await superdoc.setTextSelection(pos + 'Beta'.length);
  await superdoc.waitForStable();

  for (let i = 0; i < 'Beta'.length; i += 1) {
    await superdoc.press('Backspace');
    await superdoc.waitForStable();
  }

  const deleteById = await snapshotTrackDeletesById(superdoc);
  const ids = Object.keys(deleteById);
  expect(ids).toHaveLength(1);
  expect(deleteById[ids[0]]).toBe('Beta');
});

test('Backspace deletion across a run seam (Google-Docs comment anchors) is ONE tracked deletion', async ({
  superdoc,
}) => {
  test.skip(!fs.existsSync(GD_DOC_PATH), 'Corpus document not available — run pnpm --dir tests/visual docs:download');

  // Imported Google-Docs paragraph "Open comment from Google Docs." is stored
  // as two runs ("Open comment " + "from Google Docs.") with a comment anchored
  // across the seam. Deleting back across that seam used to mint a second
  // tracked deletion (SD-3358); it must stay one.
  await superdoc.loadDocument(GD_DOC_PATH);
  await superdoc.waitForStable();
  await setReviewer(superdoc);
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const before = await snapshotTrackDeletesById(superdoc);
  expect(Object.keys(before)).toHaveLength(0);

  // Caret at the end of the paragraph, then Backspace back across the seam:
  // 25 chars deletes "comment from Google Docs." and leaves "Open " live.
  const docsPos = await superdoc.findTextPos('Docs.');
  await superdoc.setTextSelection(docsPos + 'Docs.'.length);
  await superdoc.waitForStable();

  for (let i = 0; i < 'comment from Google Docs.'.length; i += 1) {
    await superdoc.press('Backspace');
    await superdoc.waitForStable();
  }

  const deleteById = await snapshotTrackDeletesById(superdoc);
  const ids = Object.keys(deleteById);
  expect(ids).toHaveLength(1);
  expect(deleteById[ids[0]]).toBe('comment from Google Docs.');
});
