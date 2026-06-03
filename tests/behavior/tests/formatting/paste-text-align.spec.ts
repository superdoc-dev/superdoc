import { test } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

/**
 * Insert HTML via editor.commands.insertContent to simulate the paste path
 * (HTML → parseDOM → parseAttrs → document model).
 */
async function insertHTML(page: import('@playwright/test').Page, html: string) {
  await page.evaluate((h) => {
    const editor = (window as any).editor;
    editor.commands.insertContent(h);
  }, html);
}

test('pasted center-aligned paragraph preserves alignment', async ({ superdoc }) => {
  await insertHTML(superdoc.page, '<p style="text-align: center">Centered text</p>');
  await superdoc.waitForStable();

  await superdoc.assertTextAlignment('Centered text', 'center');
});

test('pasted right-aligned paragraph preserves alignment', async ({ superdoc }) => {
  await insertHTML(superdoc.page, '<p style="text-align: right">Right text</p>');
  await superdoc.waitForStable();

  await superdoc.assertTextAlignment('Right text', 'right');
});

test('pasted justified paragraph preserves alignment', async ({ superdoc }) => {
  await insertHTML(superdoc.page, '<p style="text-align: justify">Justified text</p>');
  await superdoc.waitForStable();

  await superdoc.assertTextAlignment('Justified text', 'justify');
});

test('pasted left-aligned paragraph does not store alignment (default)', async ({ superdoc }) => {
  await insertHTML(superdoc.page, '<p style="text-align: left">Left text</p>');
  await superdoc.waitForStable();

  // left is the default — parseAttrs skips it to avoid baking in direct formatting
  await superdoc.assertTextAlignment('Left text', null);
});
