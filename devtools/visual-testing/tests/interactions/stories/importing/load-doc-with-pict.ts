import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 400;
const START_DOC = 'fldchar/sd-1558-fld-char-issue.docx';

/**
 * SD-1558: Document fails to load due to schema validation errors
 *
 * This document contains w:pict elements (legacy VML shapes/images) that were
 * being imported as root-level inline nodes, violating ProseMirror's schema
 * which requires block-only content at the document root.
 *
 * The fix wraps these inline nodes (images, contentBlocks) in paragraphs during
 * import and strips marks from passthroughInline nodes.
 *
 * This test verifies the document loads successfully without schema errors.
 */
export default defineStory({
  name: 'load-doc-with-pict',
  description: 'Test loading a document with w:pict elements (legacy VML shapes/images)',
  startDocument: START_DOC,
  layout: true,
  comments: 'off',
  hideCaret: true,

  async run(page, helpers): Promise<void> {
    const { step, waitForStable, milestone } = helpers;

    await step('Verify document loads without schema errors', async () => {
      // Wait for the editor to be ready - if schema validation fails,
      // the editor won't initialize properly
      await page.waitForSelector('.ProseMirror', { timeout: 30_000 });
      await waitForStable(WAIT_MS);
      await milestone('document-loaded', 'Document loaded successfully without schema errors');
    });

    await step('Verify content renders correctly', async () => {
      // Scroll to ensure content is visible and rendered
      await page.evaluate(() => {
        const editor = document.querySelector('.ProseMirror');
        if (editor) {
          editor.scrollTop = 0;
        }
      });
      await waitForStable(WAIT_MS);
      await milestone('content-visible', 'Document content renders correctly');
    });
  },
});
