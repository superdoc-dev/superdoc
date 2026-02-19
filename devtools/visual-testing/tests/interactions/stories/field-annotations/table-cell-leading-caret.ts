import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 400;

/**
 * SD-1609: Test cursor placement before field annotation at start of table cell.
 *
 * The fix addressed an issue where paragraphs nested inside other blocks (like table cells)
 * weren't getting the leading caret decoration when they started with a field annotation.
 * The bug was in leadingCaretPlugin.js where `return false` in the descendants callback
 * prevented traversal into nested structures.
 *
 * This story verifies that:
 * 1. A field annotation can be inserted at the start of a table cell
 * 2. The cursor can be positioned before the annotation (via keyboard navigation)
 * 3. Text can be typed before the annotation
 */
export default defineStory({
  name: 'table-cell-leading-caret',
  description: 'Test cursor placement before field annotation at start of table cell',
  tickets: ['SD-1609'],
  startDocument: null,
  layout: true,
  hideCaret: false,

  async run(page, helpers): Promise<void> {
    const { step, focus, type, press, waitForStable, milestone, executeCommand, modifierKey } = helpers;

    await step('Insert table', async () => {
      await focus();
      await executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
      await waitForStable(WAIT_MS);
      await milestone('table-inserted', 'Empty 2x2 table inserted, cursor in first cell');
    });

    await step('Insert field annotation at start of cell', async () => {
      // Insert a field annotation at the current cursor position (start of first cell)
      await page.evaluate(() => {
        const editor = (
          window as unknown as {
            editor?: {
              commands?: { addFieldAnnotationAtSelection?: (attrs: unknown) => void };
            };
          }
        ).editor;
        if (!editor?.commands?.addFieldAnnotationAtSelection) {
          throw new Error('addFieldAnnotationAtSelection command not available');
        }

        editor.commands.addFieldAnnotationAtSelection({
          type: 'text',
          displayLabel: 'Enter value',
          fieldId: 'field-in-cell',
          fieldColor: '#6366f1',
          highlighted: true,
        });
      });
      await waitForStable(WAIT_MS);
      await milestone('annotation-in-cell', 'Field annotation inserted at start of table cell');
    });

    await step('Navigate cursor to start of cell', async () => {
      // Move to end first, then back to start to ensure we test the leading caret
      await press('End');
      await waitForStable(200);
      // Use Cmd/Ctrl+Left to go to start of line/cell
      await page.keyboard.press(`${modifierKey}+ArrowLeft`);
      await waitForStable(WAIT_MS);
      await milestone('cursor-at-start', 'Cursor moved to start of cell (should be before annotation)');
    });

    await step('Type text before annotation', async () => {
      // If the fix works, typing here should insert text BEFORE the annotation
      await type('Prefix: ');
      await waitForStable(WAIT_MS);
      await milestone('typed-before-annotation', 'Typed "Prefix: " - text should appear before the annotation');
    });
  },
});
