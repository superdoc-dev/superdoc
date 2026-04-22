import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { LONGER_HEADER_SIGN_AREA_DOC_PATH as DOC_PATH } from '../../helpers/story-fixtures.js';
import {
  activateFooter,
  activateHeader,
  expectActiveStoryTextToContain,
  getActiveStorySession,
  waitForActiveStory,
} from '../../helpers/story-surfaces.js';

test.use({ config: { useHiddenHostForStoryParts: true, showCaret: true, showSelection: true } });

async function exitToBody(superdoc: SuperDocFixture) {
  await superdoc.page.keyboard.press('Escape');
  await superdoc.waitForStable();

  if (await getActiveStorySession(superdoc.page)) {
    const bodyLine = superdoc.page.locator('.superdoc-line').first();
    await bodyLine.waitFor({ state: 'visible', timeout: 15_000 });
    await bodyLine.click();
    await superdoc.waitForStable();
  }

  await waitForActiveStory(superdoc.page, null);
}

test('double-click header to enter edit mode, type, and exit', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  await activateHeader(superdoc);

  const storyHost = superdoc.page
    .locator('.presentation-editor__story-hidden-host[data-story-kind="headerFooter"]')
    .first();
  await expect(storyHost).toHaveAttribute('data-story-key', /.+/);

  // Editing runs through the hidden-host PM while the visible header remains painted.
  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.insertText(' - Edited');
  await superdoc.waitForStable();
  await expectActiveStoryTextToContain(superdoc.page, 'Edited');

  await exitToBody(superdoc);

  await activateHeader(superdoc);
  await expectActiveStoryTextToContain(superdoc.page, 'Edited');

  await superdoc.snapshot('header-edited');
});

test('double-click footer to enter edit mode, type, and exit', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  await activateFooter(superdoc);

  const storyHost = superdoc.page
    .locator('.presentation-editor__story-hidden-host[data-story-kind="headerFooter"]')
    .first();
  await expect(storyHost).toHaveAttribute('data-story-key', /.+/);

  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.insertText(' - Edited');
  await superdoc.waitForStable();
  await expectActiveStoryTextToContain(superdoc.page, 'Edited');

  await exitToBody(superdoc);

  await activateFooter(superdoc);
  await expectActiveStoryTextToContain(superdoc.page, 'Edited');

  await superdoc.snapshot('footer-edited');
});
