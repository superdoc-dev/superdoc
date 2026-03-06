import { test, expect } from '../../fixtures/superdoc.js';
import { getDocumentText, listTrackChanges } from '../../helpers/document-api.js';
import { activateCommentDialog } from '../../helpers/comments.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

test('undo tracked insertion removes suggestion bubble and sidebar entry', async ({ superdoc }) => {
  const sidebar = superdoc.page.locator('.superdoc__right-sidebar');
  const sidebarTrackedChange = sidebar.locator('.tracked-change-text');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.type('Tracked insertion');
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);
  await expect(sidebar).toBeVisible();
  await expect.poll(async () => sidebarTrackedChange.count()).toBeGreaterThan(0);

  await superdoc.undo();
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBe(0);
  await expect(sidebarTrackedChange).toHaveCount(0);
  await expect(
    superdoc.page.locator('.floating-comment > .comments-dialog', {
      has: superdoc.page.locator('.tracked-change-text'),
    }),
  ).toHaveCount(0);
});

test('redo restores tracked insertion bubble and sidebar entry after undo', async ({ superdoc }) => {
  const sidebar = superdoc.page.locator('.superdoc__right-sidebar');
  const sidebarTrackedChange = sidebar.locator('.tracked-change-text');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.type('Tracked insertion');
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => sidebarTrackedChange.count()).toBeGreaterThan(0);
  await expect(await activateCommentDialog(superdoc, 'Tracked insertion')).toBeVisible();

  await superdoc.undo();
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBe(0);
  await expect(sidebarTrackedChange).toHaveCount(0);
  await expect(
    superdoc.page.locator('.floating-comment > .comments-dialog', {
      has: superdoc.page.locator('.tracked-change-text'),
    }),
  ).toHaveCount(0);

  await superdoc.redo();
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => sidebarTrackedChange.count()).toBeGreaterThan(0);
  await expect(await activateCommentDialog(superdoc, 'Tracked insertion')).toBeVisible();
});

test('redo is a no-op when the document did not change', async ({ superdoc }) => {
  const sidebar = superdoc.page.locator('.superdoc__right-sidebar');
  const sidebarTrackedChange = sidebar.locator('.tracked-change-text');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.type('Tracked insertion');
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => sidebarTrackedChange.count()).toBeGreaterThan(0);
  await expect(await activateCommentDialog(superdoc, 'Tracked insertion')).toBeVisible();

  const textBeforeRedo = await getDocumentText(superdoc.page);
  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.history.redo());
  await superdoc.waitForStable();

  expect(result.noop).toBe(true);
  await expect(await activateCommentDialog(superdoc, 'Tracked insertion')).toBeVisible();
  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => sidebarTrackedChange.count()).toBeGreaterThan(0);
  expect(await getDocumentText(superdoc.page)).toBe(textBeforeRedo);
});
