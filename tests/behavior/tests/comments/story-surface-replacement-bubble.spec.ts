import type { Locator, Page } from '@playwright/test';
import type { StoryLocator } from '@superdoc/document-api';
import { expect, test } from '../../fixtures/superdoc.js';
import {
  BASIC_FOOTNOTES_DOC_PATH,
  LONGER_HEADER_SIGN_AREA_DOC_PATH as HEADER_DOC_PATH,
} from '../../helpers/story-fixtures.js';
import { replaceFirstLettersInActiveStory } from '../../helpers/story-replacements.js';
import {
  activateFooter,
  activateHeader,
  activateNote,
  exitActiveStory,
  getActiveNoteEditorLocator,
  getActiveStorySession,
  getFooterEditorLocator,
  getFooterSurfaceLocator,
  getHeaderEditorLocator,
  getHeaderSurfaceLocator,
} from '../../helpers/story-surfaces.js';
import { findTrackedChangeComment } from '../../helpers/story-tracked-changes.js';

test.use({
  config: {
    toolbar: 'full',
    comments: 'on',
    trackChanges: true,
    documentMode: 'suggesting',
    replacements: 'independent',
    showCaret: true,
    showSelection: true,
  },
});

type HeaderFooterStory = Extract<StoryLocator, { kind: 'story'; storyType: 'headerFooterPart' }>;

async function getActiveHeaderFooterStory(page: Page): Promise<HeaderFooterStory> {
  const story = await getActiveStorySession(page);
  if (!story || story.kind !== 'story' || story.storyType !== 'headerFooterPart' || typeof story.refId !== 'string') {
    throw new Error(`Expected an active header/footer story, received: ${JSON.stringify(story)}`);
  }
  return story;
}

async function expectIndependentReplacementBubbles(
  page: Page,
  insertedText: string,
  deletedText: string,
): Promise<void> {
  await expect(
    page
      .locator('.comment-placeholder .comments-dialog', {
        hasText: `Deleted "${deletedText}"`,
      })
      .first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page
      .locator('.comment-placeholder .comments-dialog', {
        hasText: `Added "${insertedText}"`,
      })
      .first(),
  ).toBeVisible({ timeout: 10_000 });
}

async function expectReplacementTrackedChangeComments(
  page: Page,
  story: StoryLocator,
  insertedText: string,
  deletedText: string,
): Promise<void> {
  await findTrackedChangeComment(page, {
    story,
    excerpt: insertedText,
    type: 'insert',
  });
  await findTrackedChangeComment(page, {
    story,
    excerpt: deletedText,
    type: 'delete',
  });
}

async function expectActiveStoryEditorText(editor: Locator, insertedText: string): Promise<void> {
  await expect(editor).toContainText(insertedText);
}

test('header replacement shows a visible tracked-change bubble and stays rendered after exiting the header', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(HEADER_DOC_PATH);
  await superdoc.waitForStable();

  await activateHeader(superdoc);
  const story = await getActiveHeaderFooterStory(superdoc.page);
  const result = await replaceFirstLettersInActiveStory(superdoc.page, 'HDRREP');
  expect(result.success).toBe(true);

  await superdoc.waitForStable();
  await expectReplacementTrackedChangeComments(superdoc.page, story, result.insertedText, result.deletedText);
  await expectActiveStoryEditorText(getHeaderEditorLocator(superdoc.page), result.insertedText);
  await expectIndependentReplacementBubbles(superdoc.page, result.insertedText, result.deletedText);

  await exitActiveStory(superdoc.page);
  await superdoc.waitForStable();

  await expect(
    getHeaderSurfaceLocator(superdoc.page)
      .locator(`[data-story-key="hf:part:${story.refId}"][data-track-change-id]`, {
        hasText: result.insertedText,
      })
      .first(),
  ).toBeVisible();
});

test('footer replacement shows a visible tracked-change bubble and stays rendered after exiting the footer', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(HEADER_DOC_PATH);
  await superdoc.waitForStable();

  await activateFooter(superdoc);
  const story = await getActiveHeaderFooterStory(superdoc.page);
  const result = await replaceFirstLettersInActiveStory(superdoc.page, 'FTRREP');
  expect(result.success).toBe(true);

  await superdoc.waitForStable();
  await expectReplacementTrackedChangeComments(superdoc.page, story, result.insertedText, result.deletedText);
  await expectActiveStoryEditorText(getFooterEditorLocator(superdoc.page), result.insertedText);
  await expectIndependentReplacementBubbles(superdoc.page, result.insertedText, result.deletedText);

  await exitActiveStory(superdoc.page);
  await superdoc.waitForStable();

  await expect(
    getFooterSurfaceLocator(superdoc.page)
      .locator(`[data-story-key="hf:part:${story.refId}"][data-track-change-id]`, {
        hasText: result.insertedText,
      })
      .first(),
  ).toBeVisible();
});

test('footnote replacement shows a visible tracked-change bubble inside the active note', async ({
  superdoc,
  browserName,
}) => {
  test.skip(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
  );

  await superdoc.loadDocument(BASIC_FOOTNOTES_DOC_PATH);
  await superdoc.waitForStable();

  await activateNote(superdoc, {
    storyType: 'footnote',
    noteId: '1',
    expectedText: 'This is a simple footnote',
  });
  const story: StoryLocator = {
    kind: 'story',
    storyType: 'footnote',
    noteId: '1',
  };
  const result = await replaceFirstLettersInActiveStory(superdoc.page, 'FNREP');
  expect(result.success).toBe(true);

  await superdoc.waitForStable();
  await expectReplacementTrackedChangeComments(superdoc.page, story, result.insertedText, result.deletedText);
  await expectActiveStoryEditorText(getActiveNoteEditorLocator(superdoc.page), result.insertedText);
  await expectIndependentReplacementBubbles(superdoc.page, result.insertedText, result.deletedText);
});
