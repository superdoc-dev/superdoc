import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { listTrackChanges, rejectTrackChange } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true, showSelection: true } });

const LINK_DROPDOWN = '.link-input-ctn';
const TEXT = 'Hyperlink';
const HREF = 'https://superdoc.dev';

async function applyLink(superdoc: SuperDocFixture, href: string): Promise<void> {
  const page = superdoc.page;

  await page.locator('[data-item="btn-link"]').click();
  await superdoc.waitForStable();

  await page.locator(`${LINK_DROPDOWN} input[name="link"]`).fill(href);
  await page.locator('[data-item="btn-link-apply"]').click();
  await page.locator(LINK_DROPDOWN).waitFor({ state: 'hidden', timeout: 5000 });
  await superdoc.waitForStable();
}

test('SD-2251 rejecting hyperlink suggestion removes hyperlink visuals and tracked bubble', async ({ superdoc }) => {
  await superdoc.type(TEXT);
  await superdoc.waitForStable();
  await superdoc.snapshot('sd-2251-before-link');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const textPos = await superdoc.findTextPos(TEXT);
  await superdoc.setTextSelection(textPos, textPos + TEXT.length);
  await superdoc.waitForStable();

  await applyLink(superdoc, HREF);

  await superdoc.assertTextHasMarks(TEXT, ['link', 'underline']);
  await superdoc.assertTextMarkAttrs(TEXT, 'link', { href: HREF });
  await superdoc.assertTrackedChangeExists('format');
  await superdoc.assertLinkExists(HREF);

  const trackedDialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text'),
  });
  await expect(trackedDialog).toHaveCount(1);
  await superdoc.snapshot('sd-2251-after-link-suggestion');

  await expect.poll(async () => (await listTrackChanges(superdoc.page, { type: 'format' })).total).toBe(1);
  const formatChanges = await listTrackChanges(superdoc.page, { type: 'format' });
  const changeId = formatChanges.changes[0]?.id;
  expect(typeof changeId).toBe('string');
  expect(changeId).toBeTruthy();

  await rejectTrackChange(superdoc.page, { id: String(changeId) });
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);
  await expect(trackedDialog).toHaveCount(0);
  await superdoc.assertTextLacksMarks(TEXT, ['link', 'underline']);
  await expect
    .poll(() =>
      superdoc.page.evaluate((href) => {
        return Array.from(document.querySelectorAll('.superdoc-link')).some((el) => el.getAttribute('href') === href);
      }, HREF),
    )
    .toBe(false);

  await superdoc.snapshot('sd-2251-after-reject');
});
