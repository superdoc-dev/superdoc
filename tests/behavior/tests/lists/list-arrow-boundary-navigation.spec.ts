import { expect, test, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { createOrderedList, createBulletList } from '../../helpers/lists.js';

test.use({ config: { toolbar: 'full', showCaret: true, showSelection: true } });

async function enableFormattingMarks(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.page.evaluate(() => {
    (window as any).superdoc?.setShowFormattingMarks?.(true);
  });
  await superdoc.waitForStable();
  await expect(superdoc.page.locator('.superdoc-formatting-paragraph-mark').first()).toBeVisible();
}

async function focusHiddenEditor(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.page.locator('[contenteditable="true"]').first().focus();
}

test.describe('list arrow boundary navigation', () => {
  test('skips the marker gap when moving left and right across ordered list items with formatting marks', async ({
    superdoc,
  }) => {
    const first = 'Numbered item one';
    const second = 'Numbered item two with enough text to be a useful caret target';

    await createOrderedList(superdoc, [first, second]);
    await enableFormattingMarks(superdoc);

    const firstStart = await superdoc.findTextPos(first);
    const firstEnd = firstStart + first.length;
    const secondStart = await superdoc.findTextPos(second);

    await superdoc.setTextSelection(secondStart);
    await focusHiddenEditor(superdoc);
    await superdoc.press('ArrowLeft');
    await superdoc.waitForStable();
    await superdoc.assertSelection(firstEnd);

    await superdoc.setTextSelection(firstEnd);
    await focusHiddenEditor(superdoc);
    await superdoc.press('ArrowRight');
    await superdoc.waitForStable();
    await superdoc.assertSelection(secondStart);
  });

  test('skips the marker gap for list items inside table cells with formatting marks', async ({ superdoc }) => {
    const first = 'Cell item one';
    const second = 'Cell item two';

    await superdoc.executeCommand('insertTable', { rows: 1, cols: 1, withHeaderRow: false });
    await superdoc.waitForStable();
    await createBulletList(superdoc, [first, second]);
    await enableFormattingMarks(superdoc);

    const firstStart = await superdoc.findTextPos(first);
    const firstEnd = firstStart + first.length;
    const secondStart = await superdoc.findTextPos(second);

    await superdoc.setTextSelection(secondStart);
    await focusHiddenEditor(superdoc);
    await superdoc.press('ArrowLeft');
    await superdoc.waitForStable();
    await superdoc.assertSelection(firstEnd);

    await superdoc.setTextSelection(firstEnd);
    await focusHiddenEditor(superdoc);
    await superdoc.press('ArrowRight');
    await superdoc.waitForStable();
    await superdoc.assertSelection(secondStart);
  });
});
