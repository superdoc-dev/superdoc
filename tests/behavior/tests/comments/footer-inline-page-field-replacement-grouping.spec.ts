import { expect, test, type Locator, type Page } from '../../fixtures/superdoc.js';
import {
  FOOTER_INLINE_PAGE_FIELD_DOC_PATH,
  FOOTER_INLINE_PAGE_FIELD_SINGLE_RUN_WITH_TABLE_AND_FOOTNOTE_DOC_PATH,
  FOOTER_INLINE_PAGE_FIELD_WITH_FOOTNOTE_DOC_PATH,
  FOOTER_SIMPLE_TEXT_WITH_TABLE_AND_FOOTNOTE_DOC_PATH,
} from '../../helpers/story-fixtures.js';
import { activateFooter, getTextBoundaryPoint } from '../../helpers/story-surfaces.js';
import { getCommentsSnapshot } from '../../helpers/story-tracked-changes.js';

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
    documentMode: 'editing',
    showCaret: true,
    showSelection: true,
  },
});

async function dragSelectRenderedText(page: Page, locator: Locator, text: string): Promise<void> {
  const start = await getTextBoundaryPoint(locator, text, 0);
  const end = await getTextBoundaryPoint(locator, text, text.length);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

const footerReplacementFixtures = [
  {
    label: 'plain inline page field footer',
    path: FOOTER_INLINE_PAGE_FIELD_DOC_PATH,
  },
  {
    label: 'inline page field footer with footnote reserve',
    path: FOOTER_INLINE_PAGE_FIELD_WITH_FOOTNOTE_DOC_PATH,
  },
  {
    label: 'plain text footer with body table and footnote',
    path: FOOTER_SIMPLE_TEXT_WITH_TABLE_AND_FOOTNOTE_DOC_PATH,
  },
  {
    label: 'single-run inline page field footer with body table and footnote',
    path: FOOTER_INLINE_PAGE_FIELD_SINGLE_RUN_WITH_TABLE_AND_FOOTNOTE_DOC_PATH,
  },
] as const;

const modeVariants = [
  {
    label: 'loaded in suggesting mode',
    enterSuggestingMode: async (superdoc: {
      setDocumentMode: (mode: 'editing' | 'viewing' | 'suggesting') => Promise<void> | void;
    }) => {
      await superdoc.setDocumentMode('suggesting');
    },
  },
  {
    label: 'switched to suggesting after load',
    enterSuggestingMode: async (superdoc: {
      setDocumentMode: (mode: 'editing' | 'viewing' | 'suggesting') => Promise<void> | void;
    }) => {
      await superdoc.setDocumentMode('editing');
      await superdoc.setDocumentMode('suggesting');
    },
  },
] as const;

for (const fixture of footerReplacementFixtures) {
  for (const modeVariant of modeVariants) {
    test(`footer replacement stays grouped when visible text is followed by inline page field markers (${fixture.label}, ${modeVariant.label})`, async ({
      superdoc,
    }) => {
      await superdoc.loadDocument(fixture.path);
      await superdoc.waitForStable();

      await modeVariant.enterSuggestingMode(superdoc);
      await superdoc.waitForStable();

      const footer = await activateFooter(superdoc);
      await dragSelectRenderedText(superdoc.page, footer, 'Finance QA');
      await superdoc.waitForStable();

      await expect
        .poll(() =>
          superdoc.page.evaluate(() => {
            const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
            const selection = activeEditor?.state?.selection;
            return selection ? { from: selection.from, to: selection.to } : null;
          }),
        )
        .toEqual({ from: 2, to: 12 });

      await superdoc.page.keyboard.type('QA');
      await superdoc.waitForStable();

      await expect
        .poll(async () => {
          const comments = await getCommentsSnapshot(superdoc.page);
          return comments
            .filter((comment) => comment.trackedChange === true)
            .map((comment) => ({
              insertedText: comment.trackedChangeText ?? null,
              deletedText: comment.deletedText ?? null,
              type: comment.trackedChangeType ?? null,
            }));
        })
        .toEqual([
          {
            insertedText: 'QA',
            deletedText: 'Finance QA',
            type: 'both',
          },
        ]);
    });
  }
}
