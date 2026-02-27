import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentByText, assertDocumentApiReady, listComments } from '../../helpers/document-api.js';

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
    const commentId = await addCommentByText(superdoc.page, {
      pattern: 'brown fox',
      text: 'Comment on brown fox',
    });
    await superdoc.waitForStable();

    // Verify comment highlight exists
    await superdoc.assertCommentHighlightExists({
      text: 'brown fox',
      commentId,
      timeoutMs: 20_000,
    });

    // Select "brown fox" and apply bold
    const pos = await superdoc.findTextPos('brown fox');
    await superdoc.setTextSelection(pos, pos + 'brown fox'.length);
    await superdoc.bold();
    await superdoc.waitForStable();

    // Comment highlight must still be present
    await superdoc.assertCommentHighlightExists({
      text: 'brown fox',
      commentId,
    });

    // Bold must have been applied
    await superdoc.assertTextHasMarks('brown fox', ['bold']);

    await superdoc.snapshot('comment-highlight-after-bold');
  });

  test('comment highlight persists after applying italic to part of commented range', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await superdoc.type('The quick brown fox jumps over the lazy dog');
    await superdoc.waitForStable();

    // Comment spans "quick brown fox"
    const commentId = await addCommentByText(superdoc.page, {
      pattern: 'quick brown fox',
      text: 'Partial italic test',
    });
    await superdoc.waitForStable();
    await superdoc.assertCommentHighlightExists({ text: 'quick brown fox', commentId, timeoutMs: 20_000 });

    // Apply italic to only "brown" (middle of the commented range)
    const pos = await superdoc.findTextPos('brown');
    await superdoc.setTextSelection(pos, pos + 'brown'.length);
    await superdoc.italic();
    await superdoc.waitForStable();

    // Comment highlight must still exist — after the run split the highlight may
    // span multiple elements, so check by commentId rather than full text
    await superdoc.assertCommentHighlightExists({ commentId });

    // Each part of the range should still carry the highlight
    await superdoc.assertCommentHighlightExists({ text: 'quick' });
    await superdoc.assertCommentHighlightExists({ text: 'brown' });
    await superdoc.assertCommentHighlightExists({ text: 'fox' });

    // Italic applied to "brown"
    await superdoc.assertTextHasMarks('brown', ['italic']);

    await superdoc.snapshot('comment-highlight-after-partial-italic');
  });

  test('comment highlight persists after applying multiple marks sequentially', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await superdoc.type('Decoration resilience test sentence');
    await superdoc.waitForStable();

    const commentId = await addCommentByText(superdoc.page, {
      pattern: 'resilience test',
      text: 'Multi-mark test',
    });
    await superdoc.waitForStable();
    await superdoc.assertCommentHighlightExists({ text: 'resilience test', commentId, timeoutMs: 20_000 });

    // Apply bold, then italic, then underline to the same range
    const pos = await superdoc.findTextPos('resilience test');
    await superdoc.setTextSelection(pos, pos + 'resilience test'.length);

    await superdoc.bold();
    await superdoc.waitForStable();
    await superdoc.assertCommentHighlightExists({ text: 'resilience test', commentId });

    await superdoc.italic();
    await superdoc.waitForStable();
    await superdoc.assertCommentHighlightExists({ text: 'resilience test', commentId });

    await superdoc.underline();
    await superdoc.waitForStable();
    await superdoc.assertCommentHighlightExists({ text: 'resilience test', commentId });

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
