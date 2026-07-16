import { expect, test, type Page } from '@playwright/test';

const example = process.env.EXAMPLE || 'react';

test.describe('font family selection screenshots', () => {
  test.skip(example !== 'editor/theming', 'Run with EXAMPLE=editor/theming');

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.route('**/ingest.superdoc.dev/**', (route) =>
      route.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
    );
  });

  test('toolbar font field reflects a single font and blanks a mixed selection', async ({ page }) => {
    await page.goto('/?withToolbar=1');
    await page.waitForFunction(() => (window as any).__SUPERDOC_READY__ === true, null, { timeout: 15_000 });

    await seedMixedFontDocument(page);
    const fontField = page.locator('[data-item="btn-fontFamily"] input[role="combobox"]');

    await selectText(page, 'Times');
    await expect(fontField).toHaveValue('Times New Roman');
    await expect(page.locator('body')).toHaveScreenshot('font-family-times-new-roman-selection.png', {
      animations: 'disabled',
      caret: 'hide',
    });

    await selectText(page, 'Times Arial');
    await expect(fontField).toHaveValue('');
    await expect(page.locator('body')).toHaveScreenshot('font-family-mixed-selection.png', {
      animations: 'disabled',
      caret: 'hide',
    });
  });
});

async function seedMixedFontDocument(page: Page) {
  await page.evaluate(() => {
    const editor = (window as any).__SUPERDOC__?.activeEditor;
    if (!editor) throw new Error('SuperDoc editor is not ready');
    const findRange = (text: string) => {
      const doc = editor.state.doc;
      const max = doc.content.size;

      for (let from = 0; from <= max; from += 1) {
        for (let to = from; to <= max; to += 1) {
          if (doc.textBetween(from, to, '') === text) return { from, to };
        }
      }

      throw new Error(`Could not find text range for "${text}"`);
    };

    editor.commands.setTextSelection(1);
    editor.commands.insertContent('Times Arial', { contentType: 'text' });

    const timesRange = findRange('Times');
    const arialRange = findRange('Arial');

    editor.commands.setTextSelection(timesRange);
    editor.commands.setFontFamily('Times New Roman');

    editor.commands.setTextSelection(arialRange);
    editor.commands.setFontFamily('Arial');

    editor.commands.setTextSelection(timesRange);
    editor.focus();
  });
}

async function selectText(page: Page, text: string) {
  await page.evaluate((selectionText) => {
    const editor = (window as any).__SUPERDOC__?.activeEditor;
    if (!editor) throw new Error('SuperDoc editor is not ready');
    const doc = editor.state.doc;
    const max = doc.content.size;
    let range: { from: number; to: number } | null = null;

    for (let from = 0; from <= max; from += 1) {
      for (let to = from; to <= max; to += 1) {
        if (doc.textBetween(from, to, '') === selectionText) {
          range = { from, to };
          break;
        }
      }
      if (range) break;
    }

    if (!range) throw new Error(`Could not find text range for "${selectionText}"`);

    editor.commands.setTextSelection(range);
    editor.focus();
  }, text);
}
