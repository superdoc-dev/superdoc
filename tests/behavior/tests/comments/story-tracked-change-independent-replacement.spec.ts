import { expect, test, type Page } from '../../fixtures/superdoc.js';
import {
  BASIC_FOOTNOTES_DOC_PATH,
  LONGER_HEADER_SIGN_AREA_DOC_PATH as HEADER_DOC_PATH,
} from '../../helpers/story-fixtures.js';
import { replaceFirstLettersInActiveStory } from '../../helpers/story-replacements.js';
import { activateFooter, activateHeader, activateNote } from '../../helpers/story-surfaces.js';

const FOOTNOTE_DOC_PATH = BASIC_FOOTNOTES_DOC_PATH;

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
    replacements: 'independent',
  },
});

async function expectIndependentStoryThreads(page: Page, deletedText: string, insertedText: string) {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ deleted, inserted }) => {
            const comments = (window as any).superdoc?.commentsStore?.commentsList ?? [];
            const trackedChangeComments = comments.filter((comment: any) => comment?.trackedChange);
            const matchingComments = trackedChangeComments.filter(
              (comment: any) => comment?.deletedText === deleted || comment?.trackedChangeText === inserted,
            );
            const floatingComments = (window as any).superdoc?.commentsStore?.getFloatingComments ?? [];
            const hasFloatingMatch = floatingComments.some(
              (comment: any) => comment?.deletedText === deleted || comment?.trackedChangeText === inserted,
            );
            const panelText = Array.from(document.querySelectorAll('#comments-panel .comments-dialog'))
              .map((node) => node.textContent ?? '')
              .filter(Boolean);

            return {
              hasFloatingMatch,
              matchingTypes: matchingComments.map((comment: any) => comment?.trackedChangeType).sort(),
              matchingDeletedTexts: matchingComments.map((comment: any) => comment?.deletedText).filter(Boolean),
              matchingInsertedTexts: matchingComments.map((comment: any) => comment?.trackedChangeText).filter(Boolean),
              panelHasDeletedText: panelText.some((text) => text.includes(deleted)),
              panelHasInsertedText: panelText.some((text) => text.includes(inserted)),
            };
          },
          { deleted: deletedText, inserted: insertedText },
        ),
      { timeout: 10_000 },
    )
    .toEqual(
      expect.objectContaining({
        hasFloatingMatch: true,
        matchingTypes: ['trackDelete', 'trackInsert'],
        matchingDeletedTexts: [deletedText],
        matchingInsertedTexts: [insertedText],
        panelHasDeletedText: true,
        panelHasInsertedText: true,
      }),
    );
}

async function expectActiveStoryReplacementMode(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).editor?.presentationEditor?.getActiveEditor?.()?.options?.trackedChanges),
    )
    .toEqual(
      expect.objectContaining({
        replacements: 'independent',
      }),
    );
}

test('header replacement sidebar stays independent in suggesting mode', async ({ superdoc }) => {
  await superdoc.loadDocument(HEADER_DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await activateHeader(superdoc);
  await expectActiveStoryReplacementMode(superdoc.page);

  const result = await replaceFirstLettersInActiveStory(superdoc.page, 'x');
  expect(result.success).toBe(true);
  expect(result.activeDocumentId).not.toBe(
    (await superdoc.page.evaluate(() => (window as any).editor?.options?.documentId)) ?? null,
  );

  await superdoc.waitForStable();
  await expectIndependentStoryThreads(superdoc.page, result.deletedText, result.insertedText);
});

test('footer replacement sidebar stays independent in suggesting mode', async ({ superdoc }) => {
  await superdoc.loadDocument(HEADER_DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await activateFooter(superdoc);
  await expectActiveStoryReplacementMode(superdoc.page);

  const result = await replaceFirstLettersInActiveStory(superdoc.page, 'x');
  expect(result.success).toBe(true);

  await superdoc.waitForStable();
  await expectIndependentStoryThreads(superdoc.page, result.deletedText, result.insertedText);
});

test('footnote replacement sidebar stays independent in suggesting mode', async ({ superdoc }) => {
  await superdoc.loadDocument(FOOTNOTE_DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await activateNote(superdoc, { storyType: 'footnote', noteId: '1' });
  await expectActiveStoryReplacementMode(superdoc.page);

  const result = await replaceFirstLettersInActiveStory(superdoc.page, 'x');
  expect(result.success).toBe(true);

  await superdoc.waitForStable();
  await expectIndependentStoryThreads(superdoc.page, result.deletedText, result.insertedText);
});
