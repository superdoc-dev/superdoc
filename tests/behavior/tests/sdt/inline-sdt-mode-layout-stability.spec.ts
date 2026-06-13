import { test, expect } from '../../fixtures/superdoc.js';
import { insertInlineSdt } from '../../helpers/sdt.js';
import type { Page } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

const AFTER_TEXT = ' after inline SDT';

async function getTextLeft(page: Page, text: string): Promise<number> {
  return page.evaluate((targetText) => {
    const root = document.querySelector('.presentation-editor__pages') ?? document.querySelector('.superdoc-layout');
    if (!root) throw new Error('Rendered SuperDoc layout root not found');

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      const index = node.data.indexOf(targetText);
      if (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();
        range.detach();
        if (rect.width || rect.height) return rect.left;
      }
      node = walker.nextNode() as Text | null;
    }

    throw new Error(`Text not found in rendered layout: ${targetText}`);
  }, text);
}

test.describe('inline SDT mode layout stability', () => {
  test('does not shift following text when switching editing, suggesting, and viewing modes', async ({ superdoc }) => {
    await superdoc.type('Before ');
    await superdoc.waitForStable();
    await insertInlineSdt(superdoc.page, 'Inline Control', 'controlled text');
    await superdoc.waitForStable();
    await superdoc.type(AFTER_TEXT);
    await superdoc.waitForStable();

    const editingLeft = await getTextLeft(superdoc.page, AFTER_TEXT);

    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();
    const suggestingLeft = await getTextLeft(superdoc.page, AFTER_TEXT);

    await superdoc.setDocumentMode('viewing');
    await superdoc.waitForStable();
    const viewingLeft = await getTextLeft(superdoc.page, AFTER_TEXT);

    expect(Math.abs(suggestingLeft - editingLeft)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(viewingLeft - editingLeft)).toBeLessThanOrEqual(0.5);
  });
});
