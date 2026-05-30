import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import { LONGER_HEADER_SIGN_AREA_DOC_PATH } from '../../helpers/story-fixtures.js';
import { activateHeader, moveActiveStoryCursorToEnd, waitForActiveStory } from '../../helpers/story-surfaces.js';

test.use({ config: { toolbar: 'full' } });

async function clickBodySurface(page: Page) {
  const bodyLine = page.locator('.superdoc-line').first();
  await bodyLine.scrollIntoViewIfNeeded();
  await bodyLine.click();
}

async function expectToolbarButtonDisabledState(button: Locator, disabled: boolean) {
  if (disabled) {
    await expect(button).toHaveClass(/sd-disabled/);
    return;
  }

  await expect(button).not.toHaveClass(/sd-disabled/);
}

test('undo button removes last typed text', async ({ superdoc }) => {
  const undoButton = superdoc.page.locator('[data-item="btn-undo"]');

  await superdoc.type('First paragraph.');
  await superdoc.newLine();
  await superdoc.type('Second paragraph.');
  await superdoc.waitForStable();

  await superdoc.assertTextContains('Second paragraph.');

  await undoButton.click();
  await superdoc.waitForStable();

  await superdoc.assertTextNotContains('Second paragraph.');
  await superdoc.assertTextContains('First paragraph.');
});

test('redo button restores undone text', async ({ superdoc }) => {
  const undoButton = superdoc.page.locator('[data-item="btn-undo"]');
  const redoButton = superdoc.page.locator('[data-item="btn-redo"]');

  await superdoc.type('First paragraph.');
  await superdoc.newLine();
  await superdoc.type('Second paragraph.');
  await superdoc.waitForStable();

  await undoButton.click();
  await superdoc.waitForStable();
  await superdoc.assertTextNotContains('Second paragraph.');

  await redoButton.click();
  await superdoc.waitForStable();

  await superdoc.assertTextContains('First paragraph.');
  await superdoc.assertTextContains('Second paragraph.');
});

test('toolbar undo/redo buttons follow unified history after leaving header editing', async ({ superdoc }) => {
  const undoButton = superdoc.page.locator('[data-item="btn-undo"]');
  const redoButton = superdoc.page.locator('[data-item="btn-redo"]');
  const bodyText = 'Toolbar body text';
  const headerText = 'Toolbar header text';

  await superdoc.loadDocument(LONGER_HEADER_SIGN_AREA_DOC_PATH);
  await superdoc.waitForStable();

  await superdoc.type(bodyText);
  await superdoc.waitForStable();

  const headerSurface = await activateHeader(superdoc);
  await moveActiveStoryCursorToEnd(superdoc.page);
  await superdoc.page.keyboard.insertText(headerText);
  await superdoc.waitForStable();
  await expect(headerSurface).toContainText(headerText);

  await clickBodySurface(superdoc.page);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, null);

  await expectToolbarButtonDisabledState(undoButton, false);
  await expectToolbarButtonDisabledState(redoButton, true);

  await undoButton.click();
  await superdoc.waitForStable();

  await expect(headerSurface).not.toContainText(headerText);
  await superdoc.assertTextContains(bodyText);
  await expectToolbarButtonDisabledState(redoButton, false);

  await redoButton.click();
  await superdoc.waitForStable();

  await expect(headerSurface).toContainText(headerText);
  await superdoc.assertTextContains(bodyText);
});
