import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(
  __dirname,
  '../../../../packages/super-editor/src/editors/v1/tests/data/basic-footnotes.docx',
);

test.use({ config: { showCaret: true, showSelection: true } });

test('double-click rendered footnote to edit it through the presentation surface', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const footnote = superdoc.page.locator('[data-block-id^="footnote-1-"]').first();
  await footnote.scrollIntoViewIfNeeded();
  await footnote.waitFor({ state: 'visible', timeout: 15_000 });
  await expect(footnote).toContainText('This is a simple footnote');

  const box = await footnote.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();

  const storyHost = superdoc.page.locator('.presentation-editor__story-hidden-host[data-story-kind="note"]').first();
  await expect(storyHost).toHaveAttribute('data-story-key', /.+/);

  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.insertText(' edited');
  await superdoc.waitForStable();
  await expect(footnote).toContainText('This is a simple footnote edited');

  await superdoc.page.keyboard.press('Escape');
  await superdoc.waitForStable();
  await expect(footnote).toContainText('This is a simple footnote edited');
});
