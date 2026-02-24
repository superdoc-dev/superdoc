import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, getDocumentText } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', showCaret: true, showSelection: true } });

async function clickInsideLine(
  superdoc: { page: import('@playwright/test').Page; waitForStable: (ms?: number) => Promise<void> },
  text: string,
): Promise<void> {
  const line = superdoc.page.locator('.superdoc-line').filter({ hasText: text }).first();
  const lineBox = await line.boundingBox();
  if (!lineBox) throw new Error(`Unable to find line bounds for "${text}".`);

  await superdoc.page.mouse.click(lineBox.x + Math.min(lineBox.width - 6, 14), lineBox.y + lineBox.height / 2);
  await superdoc.waitForStable();
}

test('clicking table cells places cursor in the intended cell (SD-1788)', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Paragraph above the table');
  await superdoc.newLine();
  await superdoc.newLine();
  await superdoc.waitForStable();

  await superdoc.executeCommand('insertTable', { rows: 3, cols: 3, withHeaderRow: false });
  await superdoc.waitForStable();

  await superdoc.type('Cell A1');
  await superdoc.press('Tab');
  await superdoc.type('Cell B1');
  await superdoc.press('Tab');
  await superdoc.type('Cell C1');
  await superdoc.press('Tab');
  await superdoc.type('Cell A2');
  await superdoc.waitForStable();

  // Re-click target cells and type a marker character.
  // clickInsideLine clicks near the start of the line, so '!' lands near the
  // beginning of cell text. Exact offset varies by browser.
  await clickInsideLine(superdoc, 'Cell A1');
  await superdoc.type('!');
  await superdoc.waitForStable();

  await clickInsideLine(superdoc, 'Cell B1');
  await superdoc.type('!');
  await superdoc.waitForStable();

  await clickInsideLine(superdoc, 'Cell A2');
  await superdoc.type('!');
  await superdoc.waitForStable();

  const text = await getDocumentText(superdoc.page);

  // Strip all '!' markers — base cell labels must still be intact.
  const baseText = text.replace(/!/g, '');
  expect(baseText).toContain('Cell A1');
  expect(baseText).toContain('Cell B1');
  expect(baseText).toContain('Cell C1');
  expect(baseText).toContain('Cell A2');

  // Exactly 3 '!' markers — one per clicked cell.
  expect((text.match(/!/g) ?? []).length).toBe(3);

  // Paragraph above the table should be untouched.
  expect(baseText).toContain('Paragraph above the table');
  expect(text).not.toContain('Paragraph above the table!');
  expect(text).not.toContain('!Paragraph');
});
