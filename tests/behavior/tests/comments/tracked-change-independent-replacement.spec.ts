import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import {
  acceptTrackChange,
  assertDocumentApiReady,
  listTrackChanges,
  rejectTrackChange,
} from '../../helpers/document-api.js';
import type { TrackChangeType } from '../../helpers/document-api.js';

test.use({
  config: {
    toolbar: 'full',
    comments: 'panel',
    trackChanges: true,
    // SD-2607: Word / ECMA-376-style independent revisions — each insertion
    // and each deletion has its own id, and accept/reject resolves one side
    // at a time.
    replacements: 'independent',
  },
});

type TrackedSegment = {
  from: number;
  id: string;
  text: string;
  to: number;
  type: TrackChangeType;
};

const TRACKED_CHANGE_DIALOGS = '.comment-placeholder .comments-dialog, #comments-panel .comments-dialog';

async function listTrackedSegments(page: Page): Promise<TrackedSegment[]> {
  return page.evaluate(() => {
    const segments: Array<{ from: number; id: string; text: string; to: number; type: TrackChangeType }> = [];
    const editor = (window as any).editor;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (!node?.isText || !node.text) return;
      const trackedMark = (node.marks ?? []).find(
        (mark: any) => mark.type?.name === 'trackInsert' || mark.type?.name === 'trackDelete',
      );
      if (!trackedMark) return;
      segments.push({
        from: Number(pos),
        id: String(trackedMark.attrs?.id ?? ''),
        text: String(node.text),
        to: Number(pos + node.nodeSize),
        type: trackedMark.type.name === 'trackDelete' ? 'delete' : 'insert',
      });
    });
    return segments;
  });
}

test.describe("trackedChanges.replacements='independent'", () => {
  test('UI replacement produces two independent tracked revisions', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await superdoc.type('The quick brown fox');
    await superdoc.waitForStable();
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    await superdoc.tripleClickLine(0);
    await superdoc.waitForStable();
    await superdoc.type('The speedy brown fox');
    await superdoc.waitForStable();

    await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(2);

    const listed = await listTrackChanges(superdoc.page);
    const insertions = listed.changes.filter((c: any) => c.type === 'insert');
    const deletions = listed.changes.filter((c: any) => c.type === 'delete');

    expect(insertions.length).toBeGreaterThanOrEqual(1);
    expect(deletions.length).toBeGreaterThanOrEqual(1);

    // Headline guarantee: every ins/del revision is addressable by its own
    // id. No two revisions share an id when replacements is 'independent'.
    const allIds = listed.changes.map((c: any) => c.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  test('body replacement sidebar shows separate added and deleted bubbles', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await superdoc.type('Replace ME now');
    await superdoc.waitForStable();
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    await superdoc.tripleClickLine(0);
    await superdoc.waitForStable();
    await superdoc.type('Replace it now');
    await superdoc.waitForStable();

    await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(2);

    const dialogs = superdoc.page.locator(TRACKED_CHANGE_DIALOGS, {
      has: superdoc.page.locator('.tracked-change-text'),
    });
    await expect(dialogs).toHaveCount(2);
    await expect(superdoc.page.locator(`${TRACKED_CHANGE_DIALOGS} .change-type`, { hasText: 'Replaced' })).toHaveCount(
      0,
    );

    const deletedDialog = superdoc.page.locator(TRACKED_CHANGE_DIALOGS, {
      has: superdoc.page.locator('.tracked-change-text.is-deleted', { hasText: 'ME' }),
    });
    const insertedDialog = superdoc.page.locator(TRACKED_CHANGE_DIALOGS, {
      has: superdoc.page.locator('.tracked-change-text.is-inserted', { hasText: 'it' }),
    });

    await expect(deletedDialog).toHaveCount(1);
    await expect(insertedDialog).toHaveCount(1);
  });

  test('accepting the insertion leaves the deletion addressable on its own', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await superdoc.type('The lazy dog');
    await superdoc.waitForStable();
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    await superdoc.tripleClickLine(0);
    await superdoc.waitForStable();
    await superdoc.type('The sleepy cat');
    await superdoc.waitForStable();

    await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(2);

    const before = await listTrackChanges(superdoc.page);
    const insertion = before.changes.find((c: any) => c.type === 'insert');
    const deletion = before.changes.find((c: any) => c.type === 'delete');
    expect(insertion, "expected an insertion with replacements='independent'").toBeTruthy();
    expect(deletion, "expected a deletion with replacements='independent'").toBeTruthy();

    await acceptTrackChange(superdoc.page, { id: insertion!.id });
    await superdoc.waitForStable();

    const segmentsAfterAccept = await listTrackedSegments(superdoc.page);
    const remainingDeletes = segmentsAfterAccept.filter((s) => s.type === 'delete');
    const remainingInserts = segmentsAfterAccept.filter((s) => s.type === 'insert');
    expect(remainingDeletes.length).toBeGreaterThanOrEqual(1);
    expect(remainingInserts.length).toBe(0);

    await rejectTrackChange(superdoc.page, { id: deletion!.id });
    await superdoc.waitForStable();

    await expect.poll(() => listTrackedSegments(superdoc.page)).toEqual([]);
  });

  test('rejecting the deletion leaves the insertion addressable on its own', async ({ superdoc }) => {
    await assertDocumentApiReady(superdoc.page);

    await superdoc.type('Replace ME now');
    await superdoc.waitForStable();
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    await superdoc.tripleClickLine(0);
    await superdoc.waitForStable();
    await superdoc.type('Replace it now');
    await superdoc.waitForStable();

    await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(2);

    const before = await listTrackChanges(superdoc.page);
    const insertion = before.changes.find((c: any) => c.type === 'insert');
    const deletion = before.changes.find((c: any) => c.type === 'delete');
    expect(insertion).toBeTruthy();
    expect(deletion).toBeTruthy();

    await rejectTrackChange(superdoc.page, { id: deletion!.id });
    await superdoc.waitForStable();

    const segmentsAfterReject = await listTrackedSegments(superdoc.page);
    const remainingDeletes = segmentsAfterReject.filter((s) => s.type === 'delete');
    const remainingInserts = segmentsAfterReject.filter((s) => s.type === 'insert');
    expect(remainingDeletes.length).toBe(0);
    expect(remainingInserts.length).toBeGreaterThanOrEqual(1);

    await acceptTrackChange(superdoc.page, { id: insertion!.id });
    await superdoc.waitForStable();

    await expect.poll(() => listTrackedSegments(superdoc.page)).toEqual([]);
  });
});
