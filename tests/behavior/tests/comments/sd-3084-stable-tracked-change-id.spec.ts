import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import {
  acceptTrackChange,
  assertDocumentApiReady,
  findFirstSelectionTarget,
  insertText,
  listTrackChanges,
  rejectTrackChange,
  replaceText,
} from '../../helpers/document-api.js';

/**
 * SD-3084 contract: trackChanges.list().items[i].id is stable within the
 * loaded document and matches the commentId emitted by onCommentsUpdate.
 * Decide() accepts it.
 *
 * Each test simulates the realistic consumer pattern that motivated the fix:
 *   list / subscribe -> cache id -> async work -> act on the cached id
 *
 * Before SD-3084, items[i].id was a positional/content hash that changed on
 * every edit. The scenarios below would have produced TARGET_NOT_FOUND on
 * decide() in that world.
 */

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

async function collectTrackedChangeEventIds(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __sd3084EventIds: Set<string>;
      superdoc: {
        on?: (event: string, cb: (p: unknown) => void) => void;
        config?: { onCommentsUpdate?: (p: unknown) => void };
      };
    };
    w.__sd3084EventIds = new Set();
    const record = (p: unknown) => {
      const payload = p as {
        type?: string;
        changeId?: string;
        comment?: { commentId?: string; trackedChange?: boolean };
      };
      if (payload?.comment?.trackedChange === true && payload.comment.commentId) {
        w.__sd3084EventIds.add(payload.comment.commentId);
      }
      if (payload?.type === 'trackedChange' && payload.changeId) {
        w.__sd3084EventIds.add(payload.changeId);
      }
    };
    if (w.superdoc?.on) {
      w.superdoc.on('comments-update', record);
    } else if (w.superdoc?.config) {
      const prev = w.superdoc.config.onCommentsUpdate;
      w.superdoc.config.onCommentsUpdate = (p: unknown) => {
        record(p);
        prev?.(p);
      };
    }
  });
}

async function readEventIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __sd3084EventIds?: Set<string> };
    return [...(w.__sd3084EventIds ?? [])];
  });
}

async function createTrackedInsertion(page: Page, value: string): Promise<void> {
  const receipt = await insertText(page, { value }, { changeMode: 'tracked' });
  if (!receipt.success) {
    throw new Error(`insertText (tracked) failed: ${JSON.stringify(receipt.failure)}`);
  }
}

test.describe('SD-3084 stable tracked-change id contract', () => {
  test('items[i].id matches the commentId emitted by onCommentsUpdate', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);
    await collectTrackedChangeEventIds(superdoc.page);

    await createTrackedInsertion(superdoc.page, 'alpha bravo charlie');
    await superdoc.waitForStable();

    const listed = await listTrackChanges(superdoc.page);
    expect(listed.changes.length).toBeGreaterThan(0);
    const listIds = listed.changes.map((c: { id: string }) => c.id);

    const eventIds = await readEventIds(superdoc.page);
    for (const listId of listIds) {
      expect(eventIds, `event ids should include list id ${listId}`).toContain(listId);
    }
  });

  test('id is stable across a position-shifting edit', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await createTrackedInsertion(superdoc.page, 'first tracked insertion');
    await superdoc.waitForStable();

    const before = (await listTrackChanges(superdoc.page)).changes.map((c: { id: string }) => c.id).sort();
    expect(before.length).toBeGreaterThan(0);

    await createTrackedInsertion(superdoc.page, ' more text after');
    await superdoc.waitForStable();

    const after = (await listTrackChanges(superdoc.page)).changes.map((c: { id: string }) => c.id).sort();

    for (const id of before) {
      expect(after, `id ${id} should survive a position-shifting edit`).toContain(id);
    }
  });

  test('decide() accepts a cached id after async work and intervening edits', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await createTrackedInsertion(superdoc.page, 'cache this revision');
    await superdoc.waitForStable();

    const listed = await listTrackChanges(superdoc.page);
    const cached = listed.changes[0];
    expect(cached).toBeDefined();

    // Cache id, simulate async work, edit happens, then act on the cached id.
    await superdoc.page.waitForTimeout(200);
    await createTrackedInsertion(superdoc.page, ' intervening edit ');
    await superdoc.waitForStable();

    await rejectTrackChange(superdoc.page, { id: cached.id, story: cached.address?.story });

    const after = await listTrackChanges(superdoc.page);
    expect(
      after.changes.find((c: { id: string }) => c.id === cached.id),
      'rejected change should leave the live list',
    ).toBeUndefined();
  });

  test('id of a surviving change is unchanged when another change is accepted', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    // Seed two distinct anchor texts via non-tracked typing so we can target
    // each independently, then issue two tracked replacements at separate
    // positions. Consecutive tracked inserts at the same caret merge into a
    // single logical change, so we need positional separation to get two ids.
    await superdoc.type('alpha middle bravo');
    await superdoc.waitForStable();

    const alphaTarget = await findFirstSelectionTarget(superdoc.page, 'alpha');
    expect(alphaTarget, 'should find "alpha"').not.toBeNull();
    const alphaReceipt = await replaceText(
      superdoc.page,
      { target: alphaTarget!, text: 'ALPHA' },
      { changeMode: 'tracked' },
    );
    expect(alphaReceipt.success).toBe(true);

    const bravoTarget = await findFirstSelectionTarget(superdoc.page, 'bravo');
    expect(bravoTarget, 'should find "bravo"').not.toBeNull();
    const bravoReceipt = await replaceText(
      superdoc.page,
      { target: bravoTarget!, text: 'BRAVO' },
      { changeMode: 'tracked' },
    );
    expect(bravoReceipt.success).toBe(true);
    await superdoc.waitForStable();

    const initial = await listTrackChanges(superdoc.page);
    expect(initial.changes.length).toBeGreaterThanOrEqual(2);

    const [first, second] = initial.changes;
    await acceptTrackChange(superdoc.page, { id: first.id, story: first.address?.story });

    const after = await listTrackChanges(superdoc.page);
    const survivor = after.changes.find((c: { id: string }) => c.id === second.id);
    expect(survivor, `surviving change ${second.id} should still resolve by its cached id`).toBeDefined();
  });

  test('handle.ref is exposed but never required to call decide()', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await createTrackedInsertion(superdoc.page, 'opaque handle test');
    await superdoc.waitForStable();

    const listed = await listTrackChanges(superdoc.page);
    const item = listed.changes[0] as {
      id: string;
      handle?: { ref?: string; refStability?: string };
      address?: { story?: unknown };
    };
    expect(item).toBeDefined();

    if (item.handle) {
      expect(item.handle.refStability).toBe('stable');
    }

    // Decide using the public id only.
    await rejectTrackChange(superdoc.page, { id: item.id, story: item.address?.story });

    const after = await listTrackChanges(superdoc.page);
    expect(after.changes.find((c: { id: string }) => c.id === item.id)).toBeUndefined();
  });
});
