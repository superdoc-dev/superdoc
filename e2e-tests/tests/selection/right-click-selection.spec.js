import { test, expect } from '@playwright/test';
import { goToPageAndWaitForEditor } from '../helpers.js';

// TODO: Add Firefox to playwright.config.js projects to catch Firefox-specific regressions.
// This test was added for SD-1623 where Firefox clears selection on right-click mousedown
// when preventDefault() is called, unlike Chrome/Safari.
test.describe('Right-click selection preservation', () => {
  test('preserves text selection after right-click @SD-1623', async ({ page }) => {
    await goToPageAndWaitForEditor(page);

    const editor = page.locator('div.super-editor').first();
    await editor.click();

    // Type some text to select
    const testText = 'Hello World';
    await page.keyboard.type(testText);

    // Select all the text we just typed
    await page.keyboard.press('ControlOrMeta+a');

    // Verify text is selected before right-click
    const selectionBefore = await page.evaluate(() => window.getSelection()?.toString());
    expect(selectionBefore).toContain(testText);

    // Right-click on the selected text
    const textElement = editor.getByText(testText);
    await textElement.click({ button: 'right' });

    // Wait a moment for the selection handlers to run
    await page.waitForTimeout(100);

    // Verify selection is preserved - check for either:
    // 1. Native selection still present, OR
    // 2. Visual selection decoration applied (sd-custom-selection class)
    const selectionAfter = await page.evaluate(() => window.getSelection()?.toString());
    const hasVisualSelection = await editor.locator('.sd-custom-selection').count();

    // Either the native selection should be preserved OR the visual decoration should be shown
    const isSelectionPreserved = selectionAfter.includes(testText) || hasVisualSelection > 0;
    expect(isSelectionPreserved).toBe(true);
  });
});
