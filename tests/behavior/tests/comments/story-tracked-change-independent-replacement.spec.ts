import { expect, test, type Locator, type Page } from '../../fixtures/superdoc.js';
import {
  BASIC_FOOTNOTES_DOC_PATH,
  LONGER_HEADER_SIGN_AREA_DOC_PATH as HEADER_DOC_PATH,
} from '../../helpers/story-fixtures.js';

const FOOTNOTE_DOC_PATH = BASIC_FOOTNOTES_DOC_PATH;

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
    replacements: 'independent',
    useHiddenHostForStoryParts: true,
  },
});

async function activateHeader(page: Page) {
  const header = page.locator('.superdoc-page-header').first();
  await header.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await header.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function activateFooter(page: Page) {
  const footer = page.locator('.superdoc-page-footer').first();
  await footer.scrollIntoViewIfNeeded();
  await footer.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await footer.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function activateFootnote(page: Page) {
  const footnote = page.locator('[data-block-id^="footnote-1-"]').first();
  await footnote.scrollIntoViewIfNeeded();
  await footnote.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await footnote.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function replaceFirstTwoLettersInActiveStory(page: Page, replacementText: string) {
  return page.evaluate(
    ({ replacement }) => {
      const presentation = (window as any).editor?.presentationEditor;
      const hostEditor = (window as any).editor;
      const activeEditor = presentation?.getActiveEditor?.();
      if (!activeEditor || activeEditor === hostEditor) {
        throw new Error('Expected an active story editor.');
      }

      const storyText = activeEditor.state.doc.textBetween(0, activeEditor.state.doc.content.size, '\n', '\n') ?? '';
      const match = storyText.match(/[A-Za-z]{2,}/);
      if (!match || match.index == null) {
        throw new Error(`No replaceable word found in active story text: "${storyText}"`);
      }

      const deletedText = storyText.slice(match.index, match.index + 2);
      const positions: number[] = [];
      activeEditor.state.doc.descendants((node: any, pos: number) => {
        if (!node?.isText || !node.text) return;
        for (let i = 0; i < node.text.length; i += 1) positions.push(pos + i);
      });

      const from = positions[match.index];
      const to = positions[match.index + 1] + 1;
      const success = activeEditor.commands.insertTrackedChange({ from, to, text: replacement });

      return {
        success,
        activeDocumentId: activeEditor.options.documentId,
        trackedChanges: activeEditor.options.trackedChanges ?? null,
        deletedText,
        replacement,
      };
    },
    { replacement: replacementText },
  );
}

async function expectIndependentStoryBubbles(page: Page, deletedText: string, insertedText: string) {
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
            const floatingCount = (window as any).superdoc?.commentsStore?.getFloatingComments?.length ?? 0;
            const dialogTexts = Array.from(document.querySelectorAll('.comment-placeholder .comments-dialog'))
              .map((node) => node.textContent ?? '')
              .filter(Boolean);

            return {
              matchingTypes: matchingComments.map((comment: any) => comment?.trackedChangeType).sort(),
              matchingDeletedTexts: matchingComments.map((comment: any) => comment?.deletedText).filter(Boolean),
              matchingInsertedTexts: matchingComments.map((comment: any) => comment?.trackedChangeText).filter(Boolean),
              floatingCount,
              dialogTexts,
            };
          },
          { deleted: deletedText, inserted: insertedText },
        ),
      { timeout: 10_000 },
    )
    .toEqual(
      expect.objectContaining({
        matchingTypes: ['trackDelete', 'trackInsert'],
        matchingDeletedTexts: [deletedText],
        matchingInsertedTexts: [insertedText],
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

  await activateHeader(superdoc.page);
  await superdoc.waitForStable();
  await expectActiveStoryReplacementMode(superdoc.page);

  const result = await replaceFirstTwoLettersInActiveStory(superdoc.page, 'x');
  expect(result.success).toBe(true);
  expect(result.activeDocumentId).not.toBe(
    (await superdoc.page.evaluate(() => (window as any).editor?.options?.documentId)) ?? null,
  );

  await superdoc.waitForStable();
  await expectIndependentStoryBubbles(superdoc.page, result.deletedText, result.replacement);
});

test('footer replacement sidebar stays independent in suggesting mode', async ({ superdoc }) => {
  await superdoc.loadDocument(HEADER_DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await activateFooter(superdoc.page);
  await superdoc.waitForStable();
  await expectActiveStoryReplacementMode(superdoc.page);

  const result = await replaceFirstTwoLettersInActiveStory(superdoc.page, 'x');
  expect(result.success).toBe(true);

  await superdoc.waitForStable();
  await expectIndependentStoryBubbles(superdoc.page, result.deletedText, result.replacement);
});

test('footnote replacement sidebar stays independent in suggesting mode', async ({ superdoc }) => {
  await superdoc.loadDocument(FOOTNOTE_DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await activateFootnote(superdoc.page);
  await superdoc.waitForStable();
  await expectActiveStoryReplacementMode(superdoc.page);

  const result = await replaceFirstTwoLettersInActiveStory(superdoc.page, 'x');
  expect(result.success).toBe(true);

  await superdoc.waitForStable();
  await expectIndependentStoryBubbles(superdoc.page, result.deletedText, result.replacement);
});
