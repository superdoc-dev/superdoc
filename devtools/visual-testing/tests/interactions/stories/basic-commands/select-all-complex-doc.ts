import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 400;

/**
 * SD-1635: Bug: Cmd+A (Select All) Non-Functional
 *
 * Bug: In documents with tables, headers, or multiple text blocks, Cmd+A
 * would not select the entire document. Instead, it only selected to the
 * start of the current text block.
 *
 * Root cause: The macOS keymap had Ctrl+A mapped to selectTextblockStart()
 * instead of selectAll().
 *
 * This test verifies that selectAll works correctly in a document with
 * tables (multiple text blocks) by:
 * 1. Loading a document with tables
 * 2. Clicking inside a table cell
 * 3. Invoking select all
 * 4. Verifying the entire document is selected visually
 */
export default defineStory({
  name: 'select-all-complex-doc',
  description: 'Test Cmd+A select all works correctly in documents with tables and multiple text blocks',
  tickets: ['SD-1635'],
  startDocument: 'test-docs/basic/advanced-tables.docx',
  layout: true,
  hideCaret: false,
  hideSelection: false,

  async run(page, helpers): Promise<void> {
    const { selectAll, clickAt, waitForStable, milestone } = helpers;

    // Wait for document to fully load with layout
    await page.waitForSelector('.superdoc-page', { timeout: 30_000 });
    await waitForStable(WAIT_MS);
    await milestone('loaded', 'Document loaded showing tables and multiple paragraphs');

    // Click inside the document to position cursor in a table cell
    // Using coordinates that should land inside a table cell
    await clickAt(300, 200);
    await waitForStable(WAIT_MS);
    await milestone('cursor-positioned', 'Cursor positioned inside the document');

    // Select all - this should select the ENTIRE document, not just the current text block
    // Before the fix, this would only select to the start of the current text block
    await selectAll();
    await waitForStable(WAIT_MS);
    await milestone('after-select-all', 'After Cmd+A - entire document should be selected');
  },
});
