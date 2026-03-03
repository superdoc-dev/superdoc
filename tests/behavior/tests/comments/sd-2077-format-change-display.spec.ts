import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

type EditorCommand = [name: string, ...args: unknown[]];

async function runCommands(page: Page, commands: EditorCommand[]): Promise<void> {
  for (const [name, ...args] of commands) {
    await page.evaluate(({ name, args }) => (window as any).editor.commands[name](...args), { name, args });
  }
}

async function expectTrackedFormatDialog(page: Page) {
  const dialog = page.locator('.comment-placeholder .comments-dialog', {
    has: page.locator('.tracked-change-text'),
  });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

test.describe('SD-2077 tracked format change displays correct description', () => {
  test('adding bold to highlighted text shows only bold addition', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    // Type text and apply highlight in editing mode
    await superdoc.type('Hello world');
    await superdoc.waitForStable();
    await superdoc.selectAll();
    await runCommands(superdoc.page, [['setHighlight', '#FFFF00']]);
    await superdoc.waitForStable();

    // Switch to suggesting mode
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    // Select text and apply bold
    await superdoc.selectAll();
    await superdoc.bold();
    await superdoc.waitForStable();

    // Verify tracked format change exists
    await superdoc.assertTrackedChangeExists('format');

    // Wait for the tracked change comment dialog to appear
    const dialog = await expectTrackedFormatDialog(superdoc.page);

    // The format description should mention bold but NOT mention highlight removal
    const formatText = dialog.locator('.tracked-change-text');
    await expect(formatText).toContainText('bold');

    const text = await formatText.textContent();
    expect(text).not.toContain('removed');
    expect(text).not.toContain('highlight');

    await superdoc.snapshot('sd-2077-bold-on-highlighted');
  });

  test('adding italic to bold text shows only italic addition', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    // Type text and apply bold in editing mode
    await superdoc.type('Hello world');
    await superdoc.waitForStable();
    await superdoc.selectAll();
    await superdoc.bold();
    await superdoc.waitForStable();

    // Verify bold is applied
    await superdoc.assertTextHasMarks('Hello', ['bold']);

    // Switch to suggesting mode
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    // Select text and apply italic
    await superdoc.selectAll();
    await superdoc.italic();
    await superdoc.waitForStable();

    // Verify tracked format change exists
    await superdoc.assertTrackedChangeExists('format');

    const dialog = await expectTrackedFormatDialog(superdoc.page);

    // Should show italic addition, not bold removal
    const formatText = dialog.locator('.tracked-change-text');
    await expect(formatText).toContainText('italic');

    const text = await formatText.textContent();
    expect(text).not.toContain('removed');
    expect(text).not.toContain('bold');

    await superdoc.snapshot('sd-2077-italic-on-bold');
  });

  test('changing color on highlighted text shows only color change', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    // Type text and apply highlight + color in editing mode
    await superdoc.type('Hello world');
    await superdoc.waitForStable();
    await superdoc.selectAll();
    await runCommands(superdoc.page, [
      ['setHighlight', '#FFFF00'],
      ['setColor', '#112233'],
    ]);
    await superdoc.waitForStable();

    // Switch to suggesting mode
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    // Select text and change color
    await superdoc.selectAll();
    await runCommands(superdoc.page, [['setColor', '#FF0000']]);
    await superdoc.waitForStable();

    // Verify tracked format change exists
    await superdoc.assertTrackedChangeExists('format');

    const dialog = await expectTrackedFormatDialog(superdoc.page);

    // Should show color change, not highlight removal
    const formatText = dialog.locator('.tracked-change-text');
    await expect(formatText).toContainText('color');

    const text = await formatText.textContent();
    expect(text).not.toContain('removed highlight');

    await superdoc.snapshot('sd-2077-color-on-highlighted');
  });
});
