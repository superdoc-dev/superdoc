import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentByText, assertDocumentApiReady } from '../../helpers/document-api.js';

/**
 * SD-1963: Decoration range incorrectly expands to run boundaries;
 * highlight can be lost after mark changes.
 *
 * These tests verify that decorations (comment highlights, track-change
 * markers) survive when the user applies formatting marks (bold, italic,
 * underline) to overlapping or adjacent text ranges.
 */

// --- Comment highlight + mark interactions -----------------------------------

test.describe('comment highlight survives mark changes', () => {
  test.use({ config: { toolbar: 'full', comments: 'on' } });

  test('comment highlight persists after applying bold to commented text', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await superdoc.type('The quick brown fox jumps over the lazy dog');
    await superdoc.waitForStable();

    // Add a comment on "brown fox"
    await addCommentByText(superdoc.page, {
      pattern: 'brown fox',
      text: 'Comment on brown fox',
    });
    await superdoc.waitForStable();

    // Verify comment mark exists in PM state (avoids slow DOM highlight polling on WebKit)
    let pos = await superdoc.findTextPos('brown fox');
    await superdoc.assertMarksAtPos(pos, ['commentMark']);

    // Select "brown fox" and apply bold
    pos = await superdoc.findTextPos('brown fox');
    await superdoc.setTextSelection(pos, pos + 'brown fox'.length);
    await superdoc.bold();
    await superdoc.waitForStable();

    // Comment mark must still be present after applying bold
    pos = await superdoc.findTextPos('brown fox');
    await superdoc.assertMarksAtPos(pos, ['commentMark']);

    // Bold must have been applied
    await superdoc.assertTextHasMarks('brown fox', ['bold']);

    await superdoc.snapshot('comment-highlight-after-bold');
  });

  test('comment highlight persists after applying italic to part of commented range', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await superdoc.type('The quick brown fox jumps over the lazy dog');
    await superdoc.waitForStable();

    // Comment spans "quick brown fox"
    await addCommentByText(superdoc.page, {
      pattern: 'quick brown fox',
      text: 'Partial italic test',
    });
    await superdoc.waitForStable();

    // Verify comment mark exists in PM state (avoids slow DOM highlight polling on WebKit)
    let pos = await superdoc.findTextPos('quick brown fox');
    await superdoc.assertMarksAtPos(pos, ['commentMark']);

    // Apply italic to only "brown" (middle of the commented range)
    pos = await superdoc.findTextPos('brown');
    await superdoc.setTextSelection(pos, pos + 'brown'.length);
    await superdoc.italic();
    await superdoc.waitForStable();

    // Comment mark must still exist on all segments after the run split.
    // After italic splits the range, check each word's PM node still has commentMark.
    for (const word of ['quick', 'brown', 'fox']) {
      const wordPos = await superdoc.findTextPos(word);
      await superdoc.assertMarksAtPos(wordPos, ['commentMark']);
    }

    // Italic applied to "brown"
    await superdoc.assertTextHasMarks('brown', ['italic']);

    await superdoc.snapshot('comment-highlight-after-partial-italic');
  });

  test('comment highlight persists after applying multiple marks sequentially', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await superdoc.type('Decoration resilience test sentence');
    await superdoc.waitForStable();

    await addCommentByText(superdoc.page, {
      pattern: 'resilience test',
      text: 'Multi-mark test',
    });
    await superdoc.waitForStable();

    // Verify comment mark exists in PM state (avoids slow DOM highlight polling on WebKit)
    let pos = await superdoc.findTextPos('resilience test');
    await superdoc.assertMarksAtPos(pos, ['commentMark']);

    // Apply bold, then italic, then underline to the same range.
    // Re-select between each mark because WebKit can disrupt DOM selection
    // after Cmd+B/I/U shortcuts, and PM may re-index positions after marks.
    pos = await superdoc.findTextPos('resilience test');
    await superdoc.setTextSelection(pos, pos + 'resilience test'.length);
    await superdoc.bold();
    await superdoc.waitForStable();
    pos = await superdoc.findTextPos('resilience test');
    await superdoc.assertMarksAtPos(pos, ['commentMark']);

    pos = await superdoc.findTextPos('resilience test');
    await superdoc.setTextSelection(pos, pos + 'resilience test'.length);
    await superdoc.italic();
    await superdoc.waitForStable();
    pos = await superdoc.findTextPos('resilience test');
    await superdoc.assertMarksAtPos(pos, ['commentMark']);

    pos = await superdoc.findTextPos('resilience test');
    await superdoc.setTextSelection(pos, pos + 'resilience test'.length);
    await superdoc.underline();
    await superdoc.waitForStable();
    pos = await superdoc.findTextPos('resilience test');
    await superdoc.assertMarksAtPos(pos, ['commentMark']);

    // All three marks should be present
    await superdoc.assertTextHasMarks('resilience test', ['bold', 'italic', 'underline']);

    await superdoc.snapshot('comment-highlight-after-multi-mark');
  });
});

// --- Track-change decoration + mark interactions -----------------------------

test.describe('track-change decoration survives additional formatting', () => {
  test.use({ config: { toolbar: 'full', trackChanges: true } });

  test('format track-change decoration persists after applying another format', async ({ superdoc }) => {
    await superdoc.type('Track change format test');
    await superdoc.waitForStable();

    // Switch to suggesting mode
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    // Select "format test" and apply bold (creates a format track-change)
    const pos = await superdoc.findTextPos('format test');
    await superdoc.setTextSelection(pos, pos + 'format test'.length);
    await superdoc.bold();
    await superdoc.waitForStable();

    // Verify track-format decoration exists
    await superdoc.assertTrackedChangeExists('format');
    const formatDecs = superdoc.page.locator('.track-format-dec');
    const countAfterBold = await formatDecs.count();
    expect(countAfterBold).toBeGreaterThan(0);

    // Now apply italic to the same range
    await superdoc.setTextSelection(pos, pos + 'format test'.length);
    await superdoc.italic();
    await superdoc.waitForStable();

    // Track-change decoration must still be present
    await superdoc.assertTrackedChangeExists('format');

    await superdoc.snapshot('track-format-after-additional-mark');
  });
});
