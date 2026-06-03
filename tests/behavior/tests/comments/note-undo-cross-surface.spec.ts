import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';
import { BASIC_ENDNOTES_DOC_PATH, BASIC_FOOTNOTES_DOC_PATH } from '../../helpers/story-fixtures.js';
import {
  activateNote,
  getBodyStoryText,
  moveActiveStoryCursorToEnd,
  waitForActiveStory,
} from '../../helpers/story-surfaces.js';

test.use({
  config: {
    showCaret: true,
    showSelection: true,
  },
});

type NoteCase = {
  label: 'footnote' | 'endnote';
  storyType: 'footnote' | 'endnote';
  noteId: string;
  docPath: string;
  expectedText: string;
};

const NOTE_CASES: NoteCase[] = [
  {
    label: 'footnote',
    storyType: 'footnote',
    noteId: '1',
    docPath: BASIC_FOOTNOTES_DOC_PATH,
    expectedText: 'This is a simple footnote',
  },
  {
    label: 'endnote',
    storyType: 'endnote',
    noteId: '1',
    docPath: BASIC_ENDNOTES_DOC_PATH,
    expectedText: 'This is a simple endnote',
  },
];

async function clickBodySurface(page: Page) {
  const bodyLine = page.locator('.superdoc-line').first();
  await bodyLine.scrollIntoViewIfNeeded();
  await bodyLine.click();
}

async function historyRedoViaDocumentApi(page: Page) {
  return page.evaluate(() => (window as any).editor.doc.history.redo());
}

async function historyUndoViaDocumentApi(page: Page) {
  return page.evaluate(() => (window as any).editor.doc.history.undo());
}

for (const noteCase of NOTE_CASES) {
  test(`undo/redo from the body targets the most recent ${noteCase.label} edit before an earlier body edit`, async ({
    superdoc,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'Headless Firefox does not yet reliably persist hidden-host note edits through the behavior harness.',
    );

    const bodyText = `${noteCase.label.toUpperCase()}BODYFIRST`;
    const noteText = `${noteCase.label.toUpperCase()}STORYSECOND`;

    await assertDocumentApiReady(superdoc.page);
    await superdoc.loadDocument(noteCase.docPath);
    await superdoc.waitForStable();

    await superdoc.type(bodyText);
    await superdoc.waitForStable();
    await expect.poll(() => getBodyStoryText(superdoc.page)).toContain(bodyText);

    const noteSurface = await activateNote(superdoc, {
      storyType: noteCase.storyType,
      noteId: noteCase.noteId,
      expectedText: noteCase.expectedText,
    });
    await moveActiveStoryCursorToEnd(superdoc.page);
    await superdoc.page.keyboard.insertText(` ${noteText}`);
    await superdoc.waitForStable();
    await expect(noteSurface).toContainText(noteText);

    await clickBodySurface(superdoc.page);
    await superdoc.waitForStable();
    await waitForActiveStory(superdoc.page, null);

    await superdoc.undo();
    await superdoc.waitForStable();

    await expect(noteSurface).not.toContainText(noteText);
    await expect.poll(() => getBodyStoryText(superdoc.page)).toContain(bodyText);

    await superdoc.redo();
    await superdoc.waitForStable();

    await expect(noteSurface).toContainText(noteText);
    await expect.poll(() => getBodyStoryText(superdoc.page)).toContain(bodyText);
  });
}

test('document history api undoes and redoes the most recent footnote edit after leaving the note surface', async ({
  superdoc,
  browserName,
}) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet reliably persist hidden-host footnote edits through the behavior harness.',
  );

  const bodyText = 'BODYBEFORENOTEAPI';
  const noteText = 'FOOTNOTEAPIGLOBAL';

  await assertDocumentApiReady(superdoc.page);
  await superdoc.loadDocument(BASIC_FOOTNOTES_DOC_PATH);
  await superdoc.waitForStable();

  await superdoc.type(bodyText);
  await superdoc.waitForStable();
  await expect.poll(() => getBodyStoryText(superdoc.page)).toContain(bodyText);

  const footnote = await activateNote(superdoc, {
    storyType: 'footnote',
    noteId: '1',
    expectedText: 'This is a simple footnote',
  });
  await moveActiveStoryCursorToEnd(superdoc.page);
  await superdoc.page.keyboard.insertText(` ${noteText}`);
  await superdoc.waitForStable();
  await expect(footnote).toContainText(noteText);

  await clickBodySurface(superdoc.page);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, null);

  const undoResult = await historyUndoViaDocumentApi(superdoc.page);
  await superdoc.waitForStable();

  expect(undoResult.noop).toBe(false);
  await expect(footnote).not.toContainText(noteText);
  await expect.poll(() => getBodyStoryText(superdoc.page)).toContain(bodyText);

  const redoResult = await historyRedoViaDocumentApi(superdoc.page);
  await superdoc.waitForStable();

  expect(redoResult.noop).toBe(false);
  await expect(footnote).toContainText(noteText);
  await expect.poll(() => getBodyStoryText(superdoc.page)).toContain(bodyText);
});

test('a new body edit clears redo for a previously undone footnote edit', async ({ superdoc, browserName }) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet reliably persist hidden-host footnote edits through the behavior harness.',
  );

  const originalBodyText = 'BODYBEFORENOTEUNDO';
  const noteText = 'FOOTNOTEREDOBRANCH';
  const newBodyText = 'BODYAFTERNOTEUNDO';

  await assertDocumentApiReady(superdoc.page);
  await superdoc.loadDocument(BASIC_FOOTNOTES_DOC_PATH);
  await superdoc.waitForStable();

  await superdoc.type(originalBodyText);
  await superdoc.waitForStable();
  await expect.poll(() => getBodyStoryText(superdoc.page)).toContain(originalBodyText);

  const footnote = await activateNote(superdoc, {
    storyType: 'footnote',
    noteId: '1',
    expectedText: 'This is a simple footnote',
  });
  await moveActiveStoryCursorToEnd(superdoc.page);
  await superdoc.page.keyboard.insertText(` ${noteText}`);
  await superdoc.waitForStable();
  await expect(footnote).toContainText(noteText);

  await clickBodySurface(superdoc.page);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, null);

  await superdoc.undo();
  await superdoc.waitForStable();
  await expect(footnote).not.toContainText(noteText);

  await superdoc.type(newBodyText);
  await superdoc.waitForStable();
  await expect.poll(() => getBodyStoryText(superdoc.page)).toContain(originalBodyText);
  await expect.poll(() => getBodyStoryText(superdoc.page)).toContain(newBodyText);

  const redoResult = await historyRedoViaDocumentApi(superdoc.page);
  await superdoc.waitForStable();

  expect(redoResult.noop).toBe(true);
  await expect(footnote).not.toContainText(noteText);
  await expect.poll(() => getBodyStoryText(superdoc.page)).toContain(originalBodyText);
  await expect.poll(() => getBodyStoryText(superdoc.page)).toContain(newBodyText);
});
