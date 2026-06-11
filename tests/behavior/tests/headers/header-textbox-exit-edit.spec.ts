import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/superdoc.js';
import { HEADER_TEXTBOX_TABLE_DOC_PATH } from '../../helpers/story-fixtures.js';
import { activateHeader, exitActiveStory } from '../../helpers/story-surfaces.js';

async function expectHeaderTextboxContains(page: Page, text: string): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate((expected) => {
        const header = document.querySelector('.superdoc-page-header');
        if (header?.textContent?.includes(expected)) return true;

        for (const fragment of document.querySelectorAll<HTMLElement>('.superdoc-drawing-fragment')) {
          const story = fragment.dataset.layoutStory ?? '';
          if (!story.startsWith('header:')) continue;
          if (fragment.textContent?.includes(expected)) return true;
        }

        return false;
      }, text),
    )
    .toBe(true);
}

test.use({
  config: {
    documentMode: 'editing',
    showCaret: true,
    showSelection: true,
  },
});

test('header textbox survives exit without header edits then body typing', async ({ superdoc }) => {
  await superdoc.loadDocument(HEADER_TEXTBOX_TABLE_DOC_PATH);
  await superdoc.waitForStable();

  await expectHeaderTextboxContains(superdoc.page, 'Test Name');
  await expectHeaderTextboxContains(superdoc.page, 'Utrecht');

  await activateHeader(superdoc);
  await superdoc.waitForStable();

  await exitActiveStory(superdoc.page);
  await superdoc.waitForStable();

  await expectHeaderTextboxContains(superdoc.page, 'Test Name');
  await expectHeaderTextboxContains(superdoc.page, 'Utrecht');

  const bodyParagraph = superdoc.page.locator('.superdoc-fragment[data-block-id]').first();
  await bodyParagraph.click();
  await superdoc.page.keyboard.type(' body edit');
  await superdoc.waitForStable();

  await expectHeaderTextboxContains(superdoc.page, 'Test Name');
  await expectHeaderTextboxContains(superdoc.page, 'Utrecht');
});

test('header textbox table content survives entering and exiting header edit mode', async ({ superdoc }) => {
  await superdoc.loadDocument(HEADER_TEXTBOX_TABLE_DOC_PATH);
  await superdoc.waitForStable();

  await expectHeaderTextboxContains(superdoc.page, 'Test Name');
  await expectHeaderTextboxContains(superdoc.page, 'Utrecht');

  await activateHeader(superdoc);
  await superdoc.waitForStable();

  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
    const doc = editor?.state?.doc;
    if (!editor || !doc) return;
    const pos = Math.max(1, doc.content.size - 1);
    editor.commands.setTextSelection({ from: pos, to: pos });
  });
  await superdoc.page.keyboard.type(' edited');
  await superdoc.waitForStable();

  await expectHeaderTextboxContains(superdoc.page, 'Test Name');

  await exitActiveStory(superdoc.page);
  await superdoc.waitForStable();

  await expectHeaderTextboxContains(superdoc.page, 'Test Name');
  await expectHeaderTextboxContains(superdoc.page, 'Utrecht');

  const bodyParagraph = superdoc.page.locator('.superdoc-fragment[data-block-id]').first();
  await bodyParagraph.click();
  await superdoc.page.keyboard.type(' body edit');
  await superdoc.waitForStable();

  await expectHeaderTextboxContains(superdoc.page, 'Test Name');
  await expectHeaderTextboxContains(superdoc.page, 'Utrecht');
});
