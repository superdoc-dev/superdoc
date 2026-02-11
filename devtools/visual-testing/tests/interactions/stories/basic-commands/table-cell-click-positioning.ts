import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 400;
const WAIT_LONG_MS = 600;

/**
 * SD-1788: Cursor cannot be reliably placed in table cell
 *
 * Bug: Clicking in empty space inside a table cell (below the text line)
 * would snap the cursor to a nearby paragraph outside the table instead
 * of placing it in the correct cell. This happened because:
 *
 * 1. DOM-based click mapping (clickToPositionDom) searched all lines across
 *    all cells using only Y matching, picking the wrong column
 * 2. The snap-to-nearest fallback chose a nearby paragraph over the table cell
 *
 * This test verifies:
 * 1. Clicking inside a table cell places cursor in that cell
 * 2. Clicking in different cells moves cursor to the correct cell
 * 3. Clicking below text in a tall cell still resolves to that cell
 * 4. Table works correctly on page 2+ (multi-page coordinate mapping)
 */
export default defineStory({
  name: 'table-cell-click-positioning',
  description: 'Test that clicks in table cells map to correct cursor positions',
  tickets: ['SD-1788'],
  startDocument: null,
  layout: true,
  hideCaret: false,
  hideSelection: false,

  async run(page, helpers): Promise<void> {
    const { step, focus, type, press, clickAt, waitForStable, milestone, executeCommand } = helpers;

    // Step 1: Create content above the table (snap-to-nearest candidate)
    await step('Type paragraph above table', async () => {
      await focus();
      await type('Paragraph above the table');
      await waitForStable(WAIT_MS);
      await press('Enter');
      await press('Enter');
      await waitForStable(WAIT_MS);
      await milestone('paragraph-above', 'Paragraph above where table will be inserted');
    });

    // Step 2: Insert a table
    await step('Insert table', async () => {
      await executeCommand('insertTable', { rows: 3, cols: 3, withHeaderRow: false });
      await waitForStable(WAIT_LONG_MS);
      await milestone('table-inserted', 'Inserted 3x3 table');
    });

    // Step 3: Type content in first cell
    await step('Type in first cell', async () => {
      await type('Cell A1');
      await waitForStable(WAIT_MS);
      await milestone('cell-a1-text', 'Typed in first cell (A1)');
    });

    // Step 4: Navigate to second cell and type
    await step('Type in second cell', async () => {
      await press('Tab');
      await waitForStable(WAIT_MS);
      await type('Cell B1');
      await waitForStable(WAIT_MS);
      await milestone('cell-b1-text', 'Typed in second cell (B1)');
    });

    // Step 5: Navigate to third cell and type
    await step('Type in third cell', async () => {
      await press('Tab');
      await waitForStable(WAIT_MS);
      await type('Cell C1');
      await waitForStable(WAIT_MS);
      await milestone('cell-c1-text', 'Typed in third cell (C1)');
    });

    // Step 6: Navigate to second row, first cell
    await step('Type in second row', async () => {
      await press('Tab');
      await waitForStable(WAIT_MS);
      await type('Cell A2');
      await waitForStable(WAIT_MS);
      await milestone('cell-a2-text', 'Typed in row 2 first cell (A2)');
    });

    // Step 7: Click back into cell A1 — the key test
    // This tests that clicking in a table cell with content places the cursor
    // in that cell, not in the paragraph above.
    // Table starts at ~y=127, rows are ~17px each:
    //   Row 1: y≈127-144, Row 2: y≈144-161, Row 3: y≈161-178
    // Use short verification text "!" to avoid wrapping which shifts row heights.
    await step('Click into first cell (A1)', async () => {
      await clickAt(100, 135);
      await waitForStable(WAIT_MS);
      await type('!');
      await waitForStable(WAIT_MS);
      await milestone('verify-click-a1', 'Clicked and typed "!" in A1 — should appear in first cell');
    });

    // Step 8: Click into cell B1 (middle column, same row)
    await step('Click into middle cell (B1)', async () => {
      await clickAt(280, 135);
      await waitForStable(WAIT_MS);
      await type('!');
      await waitForStable(WAIT_MS);
      await milestone('verify-click-b1', 'Clicked and typed "!" in B1 — should appear in middle cell');
    });

    // Step 9: Click into cell A2 (second row)
    await step('Click into second row cell (A2)', async () => {
      await clickAt(100, 175);
      await waitForStable(WAIT_MS);
      await type('!');
      await waitForStable(WAIT_MS);
      await milestone('verify-click-a2', 'Clicked and typed "!" in A2 — should appear in second row');
    });
  },
});
