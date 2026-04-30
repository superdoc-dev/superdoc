import { test, expect } from '../../fixtures/superdoc.js';
import { BASIC_ENDNOTES_DOC_PATH } from '../../helpers/story-fixtures.js';
import {
  activateNote,
  expectActiveStoryTextToContain,
  getBodyStoryText,
  waitForActiveStory,
} from '../../helpers/story-surfaces.js';

test.use({
  config: {
    showCaret: true,
    showSelection: true,
  },
});

test('double-click rendered endnote to edit it through the presentation surface', async ({ superdoc, browserName }) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host endnote edits through the behavior harness.',
  );

  await superdoc.loadDocument(BASIC_ENDNOTES_DOC_PATH);
  await superdoc.waitForStable();

  const bodyBefore = await getBodyStoryText(superdoc.page);
  const endnote = await activateNote(superdoc, {
    storyType: 'endnote',
    noteId: '1',
    expectedText: 'This is a simple endnote',
  });

  await waitForActiveStory(superdoc.page, {
    kind: 'story',
    storyType: 'endnote',
    noteId: '1',
  });

  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.insertText(' edited');
  await superdoc.waitForStable();
  await expect(endnote).toContainText('This is a simple endnote edited');

  await superdoc.page.keyboard.press('Backspace');
  await superdoc.waitForStable();
  await expectActiveStoryTextToContain(superdoc.page, 'simple endnote edite');
  await expect(endnote).toContainText('This is a simple endnote edite');

  expect(await getBodyStoryText(superdoc.page)).toBe(bodyBefore);
});
