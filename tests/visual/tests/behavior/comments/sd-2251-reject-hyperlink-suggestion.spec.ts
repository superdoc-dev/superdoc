import type { Page } from '@playwright/test';
import { listTrackChanges, rejectTrackChange } from '../../../../behavior/helpers/document-api.js';
import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { comments: 'panel', trackChanges: true } });

const TEXT = 'Hyperlink';
const HREF = 'https://superdoc.dev';

/** Mark names on the text node containing `needle` (first occurrence), via ProseMirror. */
async function getMarkNamesForText(page: Page, needle: string): Promise<string[]> {
  return page.evaluate((search) => {
    const { state } = (window as any).editor;
    let names: string[] = [];
    state.doc.descendants((node: { isText?: boolean; text?: string; marks?: { type: { name: string } }[] }) => {
      if (!node.isText || !node.text) return true;
      if (!node.text.includes(search)) return true;
      names = (node.marks ?? []).map((m) => m.type.name);
      return false;
    });
    return names;
  }, needle);
}

test('@behavior SD-2251 rejecting hyperlink suggestion removes hyperlink visuals and tracked bubble', async ({
  superdoc,
}) => {
  const { page } = superdoc;

  await superdoc.type(TEXT);
  await superdoc.waitForStable();
  await superdoc.screenshot('behavior-comments-sd-2251-before-link');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const range = await superdoc.findTextRange(TEXT);
  await superdoc.setTextSelection(range.from, range.to);
  await superdoc.waitForStable();

  await superdoc.executeCommand('setLink', { href: HREF });
  await superdoc.waitForStable();

  await expect.poll(async () => getMarkNamesForText(page, TEXT)).toEqual(expect.arrayContaining(['link', 'underline']));
  await expect
    .poll(async () =>
      page.evaluate((needle) => {
        const { state } = (window as any).editor;
        let href: string | null = null;
        state.doc.descendants((node: any) => {
          if (!node.isText || !node.text?.includes(needle)) return true;
          const linkMark = node.marks.find((m: any) => m.type.name === 'link');
          if (linkMark?.attrs?.href) {
            href = linkMark.attrs.href;
            return false;
          }
          return true;
        });
        return href;
      }, TEXT),
    )
    .toBe(HREF);

  await expect(page.locator('.track-format-dec').first()).toBeAttached();
  await expect
    .poll(() =>
      page.evaluate((href) => {
        return Array.from(document.querySelectorAll('.superdoc-link')).some((el) => el.getAttribute('href') === href);
      }, HREF),
    )
    .toBe(true);

  const trackedDialog = page.locator('.comment-placeholder .comments-dialog', {
    has: page.locator('.tracked-change-text'),
  });
  await expect(trackedDialog).toHaveCount(1);
  await superdoc.screenshot('behavior-comments-sd-2251-after-link-suggestion');

  await expect.poll(async () => (await listTrackChanges(page, { type: 'format' })).total).toBe(1);
  const formatChanges = await listTrackChanges(page, { type: 'format' });
  const changeId = formatChanges.changes?.[0]?.id;
  expect(typeof changeId).toBe('string');
  expect(changeId).toBeTruthy();

  await rejectTrackChange(page, { id: String(changeId) });
  await superdoc.waitForStable();

  await expect(page.locator('.track-format-dec')).toHaveCount(0);
  await expect(trackedDialog).toHaveCount(0);

  const namesAfter = await getMarkNamesForText(page, TEXT);
  expect(namesAfter).not.toContain('link');
  expect(namesAfter).not.toContain('underline');

  await expect
    .poll(() =>
      page.evaluate((href) => {
        return Array.from(document.querySelectorAll('.superdoc-link')).some((el) => el.getAttribute('href') === href);
      }, HREF),
    )
    .toBe(false);

  await superdoc.screenshot('behavior-comments-sd-2251-after-reject');
});
