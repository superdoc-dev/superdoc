import { test, expect } from '../../fixtures/superdoc.js';
import { getDocumentText } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true, showSelection: true } });

const TRACK_TEXT = 'ABCDE';
const PARTIAL_TEXT = 'BC';
const ACCEPT_TRACKED_CHANGES_BUTTON = 'Accept tracked changes';

async function insertTrackedChange(
  page: import('@playwright/test').Page,
  options: {
    from: number;
    to: number;
    text: string;
  },
) {
  await page.evaluate((payload) => {
    (window as any).editor.commands.insertTrackedChange({
      ...payload,
      user: { name: 'Track Tester', email: 'track@example.com' },
    });
  }, options);
}

async function getMarkedText(page: import('@playwright/test').Page, markName: string): Promise<string> {
  return page.evaluate((name) => {
    let text = '';
    const doc = (window as any).editor.state.doc;

    doc.descendants((node: any) => {
      if (!node.isText) return;
      if (node.marks.some((mark: any) => mark.type.name === name)) {
        text += node.text ?? '';
      }
    });

    return text;
  }, markName);
}

async function getSelectedText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const { from, to, empty } = (window as any).editor.state.selection;
    if (empty) return '';
    return (window as any).editor.state.doc.textBetween(from, to);
  });
}

async function rightClickAtDocPos(page: import('@playwright/test').Page, pos: number) {
  const coords = await page.evaluate((p) => {
    const editor = (window as any).editor;
    const rect = editor?.coordsAtPos?.(p);
    if (!rect) return null;
    return {
      left: Number(rect.left),
      right: Number(rect.right),
      top: Number(rect.top),
      bottom: Number(rect.bottom),
    };
  }, pos);

  if (!coords) {
    throw new Error(`Could not resolve coordinates for document position ${pos}`);
  }

  const x = Math.min(Math.max(coords.left + 1, coords.left), Math.max(coords.right - 1, coords.left + 1));
  const y = (coords.top + coords.bottom) / 2;
  await page.mouse.click(x, y, { button: 'right' });
}

test('toolbar accept partially resolves a tracked insertion and updates the bubble text', async ({ superdoc }) => {
  await insertTrackedChange(superdoc.page, { from: 1, to: 1, text: TRACK_TEXT });
  await superdoc.waitForStable();

  const selectionStart = await superdoc.findTextPos(PARTIAL_TEXT);
  await superdoc.setTextSelection(selectionStart, selectionStart + PARTIAL_TEXT.length);
  await superdoc.waitForStable();

  const trackedDialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text.is-inserted', { hasText: TRACK_TEXT }),
  });
  await expect(trackedDialog).toBeVisible();

  await superdoc.snapshot('tracked-change-partial-insert-before-accept');

  await superdoc.page.getByRole('button', { name: ACCEPT_TRACKED_CHANGES_BUTTON }).click();
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toBe(TRACK_TEXT);
  await expect.poll(() => getMarkedText(superdoc.page, 'trackInsert')).toBe('ADE');
  await expect(superdoc.page.locator('.comment-placeholder .comments-dialog .tracked-change-text')).toBeVisible();

  await superdoc.snapshot('tracked-change-partial-insert-after-accept');
});

test('context menu reject partially resolves a tracked insertion and updates the bubble text', async ({
  superdoc,
  browserName,
}) => {
  test.skip(browserName === 'firefox', 'Firefox collapses selection on right-click natively');

  await insertTrackedChange(superdoc.page, { from: 1, to: 1, text: TRACK_TEXT });
  await superdoc.waitForStable();

  const selectionStart = await superdoc.findTextPos(PARTIAL_TEXT);
  await superdoc.setTextSelection(selectionStart, selectionStart + PARTIAL_TEXT.length);
  await superdoc.waitForStable();

  await expect.poll(() => getSelectedText(superdoc.page)).toBe(PARTIAL_TEXT);

  const trackedDialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text.is-inserted', { hasText: TRACK_TEXT }),
  });
  await expect(trackedDialog).toBeVisible();

  await superdoc.snapshot('tracked-change-partial-insert-before-context-reject');

  await rightClickAtDocPos(superdoc.page, selectionStart + 1);
  await superdoc.waitForStable();

  const menu = superdoc.page.locator('.context-menu');
  await expect(menu).toBeVisible();
  await menu.locator('.context-menu-item').filter({ hasText: 'Reject change' }).click();
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toBe('ADE');
  await expect.poll(() => getMarkedText(superdoc.page, 'trackInsert')).toBe('ADE');
  await expect(superdoc.page.locator('.comment-placeholder .comments-dialog .tracked-change-text')).toBeVisible();

  await superdoc.snapshot('tracked-change-partial-insert-after-context-reject');
});
