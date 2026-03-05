import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentByText, assertDocumentApiReady } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test.describe('comment mark non-inclusive boundary', () => {
  test('typing after commented text does not extend the comment mark', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    // 1. Type initial text
    await superdoc.type('Commented');
    await superdoc.waitForStable();
    await superdoc.assertTextContains('Commented');

    // 2. Add a comment on the word "Commented"
    const commentId = await addCommentByText(superdoc.page, {
      pattern: 'Commented',
      text: 'Test comment',
    });
    await superdoc.waitForStable();
    await superdoc.assertCommentHighlightExists({ text: 'Commented', commentId, timeoutMs: 20_000 });

    // 3. Place cursor right after the commented text and type new text
    const pos = await superdoc.findTextPos('Commented');
    await superdoc.setTextSelection(pos + 'Commented'.length);
    await superdoc.waitForStable();

    await superdoc.type(' after');
    await superdoc.waitForStable();

    // 4. Verify the new text exists
    await superdoc.assertTextContains('Commented after');

    // 5. Verify the comment mark stays only on "Commented", not " after"
    // Check that "Commented" has the comment mark
    const commentedMarks = await superdoc.getMarksAtPos(await superdoc.findTextPos('Commented'));
    expect(commentedMarks).toContain('commentMark');

    // Check that " after" does NOT have the comment mark
    const afterPos = await superdoc.findTextPos(' after');
    const afterMarks = await superdoc.getMarksAtPos(afterPos);
    expect(afterMarks).not.toContain('commentMark');

    await superdoc.snapshot('comment-mark-non-inclusive');
  });

  test('typing before commented text does not extend the comment mark', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    // 1. Type initial text
    await superdoc.type('Commented');
    await superdoc.waitForStable();

    // 2. Add a comment on the word "Commented"
    const commentId = await addCommentByText(superdoc.page, {
      pattern: 'Commented',
      text: 'Test comment',
    });
    await superdoc.waitForStable();
    await superdoc.assertCommentHighlightExists({ text: 'Commented', commentId, timeoutMs: 20_000 });

    // 3. Place cursor right before the commented text and type new text
    const pos = await superdoc.findTextPos('Commented');
    await superdoc.setTextSelection(pos);
    await superdoc.waitForStable();

    await superdoc.type('before ');
    await superdoc.waitForStable();

    // 4. Verify the new text exists
    await superdoc.assertTextContains('before Commented');

    // 5. Verify the comment mark stays only on "Commented", not "before "
    // Check that "before " does NOT have the comment mark
    const beforePos = await superdoc.findTextPos('before ');
    const beforeMarks = await superdoc.getMarksAtPos(beforePos);
    expect(beforeMarks).not.toContain('commentMark');

    // Check that "Commented" still has the comment mark
    const commentedPos = await superdoc.findTextPos('Commented');
    const commentedMarks = await superdoc.getMarksAtPos(commentedPos);
    expect(commentedMarks).toContain('commentMark');

    await superdoc.snapshot('comment-mark-non-inclusive-before');
  });
});
