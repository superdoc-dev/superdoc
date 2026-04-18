import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, addCommentByText, resolveComment, listComments } from '../../helpers/document-api.js';
import JSZip from 'jszip';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('SD-2306 resolved comment is marked as done in exported DOCX', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // 1. Type a line of text
  await superdoc.type('This text has a resolved comment');
  await superdoc.waitForStable();

  // 2. Add a comment to "resolved comment"
  const commentId = await addCommentByText(superdoc.page, {
    pattern: 'resolved comment',
    text: 'This is a test comment',
  });
  await superdoc.waitForStable();

  // 3. Resolve the comment
  await resolveComment(superdoc.page, { commentId });
  await superdoc.waitForStable();

  // Verify the comment is resolved before exporting
  const comments = await listComments(superdoc.page, { includeResolved: true });
  expect(comments.matches.some((entry: any) => entry.status === 'resolved')).toBe(true);

  // 4. Export to DOCX
  const bytes: number[] = await superdoc.page.evaluate(async () => {
    const blob: Blob = await (window as any).editor.exportDocx();
    const buffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  });

  // 5. Parse the exported zip and verify the resolved status
  const zip = await JSZip.loadAsync(Buffer.from(bytes));

  // commentsExtended.xml must exist — Word reads w15:done from this file
  // to determine whether a comment is resolved
  const commentsExtendedFile = zip.file('word/commentsExtended.xml');
  expect(commentsExtendedFile).not.toBeNull();

  const commentsExtendedXml = await commentsExtendedFile!.async('string');
  expect(commentsExtendedXml).toContain('w15:done="1"');
});
