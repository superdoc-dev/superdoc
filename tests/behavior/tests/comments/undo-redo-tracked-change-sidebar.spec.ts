import { test, expect, type Page } from '../../fixtures/superdoc.js';
import {
  acceptTrackChange,
  assertDocumentApiReady,
  listTrackChanges,
  rejectTrackChange,
} from '../../helpers/document-api.js';
import { activateCommentDialog } from '../../helpers/comments.ts';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

type ChangeType = 'addition' | 'deletion' | 'replacement';
type Decision = 'accept' | 'reject';

const CHANGE_TYPES: ChangeType[] = ['addition', 'deletion', 'replacement'];

const getUnresolvedTrackedBubbleCount = async (page: Page): Promise<number> =>
  page
    .locator('.superdoc__right-sidebar .comment-placeholder .comments-dialog:not(.is-resolved)', {
      has: page.locator('.tracked-change-text'),
    })
    .count();

const expectTrackedState = async (page: Page, expected: { changes: number; bubbles: number }): Promise<void> => {
  await expect.poll(async () => (await listTrackChanges(page)).total).toBe(expected.changes);
  await expect.poll(async () => getUnresolvedTrackedBubbleCount(page)).toBe(expected.bubbles);
};

const prepareSuggestingDocument = async (superdoc: any): Promise<void> => {
  await assertDocumentApiReady(superdoc.page);
  await superdoc.type('alpha beta gamma');
  await superdoc.waitForStable();
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();
};

const applyTrackedChange = async (superdoc: any, changeType: ChangeType): Promise<void> => {
  const betaPos = await superdoc.findTextPos('beta');

  if (changeType === 'addition') {
    const gammaPos = await superdoc.findTextPos('gamma');
    await superdoc.setTextSelection(gammaPos + 'gamma'.length);
    await superdoc.waitForStable();
    await superdoc.type(' plus');
    await superdoc.waitForStable();
    return;
  }

  await superdoc.setTextSelection(betaPos, betaPos + 'beta'.length);
  await superdoc.waitForStable();

  if (changeType === 'deletion') {
    await superdoc.press('Backspace');
    await superdoc.waitForStable();
    return;
  }

  await superdoc.type('delta');
  await superdoc.waitForStable();
};

const getSingleTrackedChangeId = async (page: Page): Promise<string> => {
  const tracked = await listTrackChanges(page);
  expect(tracked.total).toBe(1);
  const id = tracked.changes?.[0]?.id;
  expect(typeof id).toBe('string');
  return id as string;
};

const applyDecision = async (page: Page, changeId: string, decision: Decision): Promise<void> => {
  if (decision === 'accept') {
    await acceptTrackChange(page, { id: changeId });
    return;
  }
  await rejectTrackChange(page, { id: changeId });
};

for (const changeType of CHANGE_TYPES) {
  test(`undo/redo restores tracked-change sidebar bubble for ${changeType}`, async ({ superdoc }) => {
    await prepareSuggestingDocument(superdoc);
    await applyTrackedChange(superdoc, changeType);
    await expectTrackedState(superdoc.page, { changes: 1, bubbles: 1 });

    await superdoc.undo();
    await superdoc.waitForStable();
    await expectTrackedState(superdoc.page, { changes: 0, bubbles: 0 });

    await superdoc.redo();
    await superdoc.waitForStable();
    await expectTrackedState(superdoc.page, { changes: 1, bubbles: 1 });
  });
}

for (const changeType of CHANGE_TYPES) {
  test(`accept then undo/redo keeps tracked-change sidebar bubble in sync for ${changeType}`, async ({ superdoc }) => {
    await prepareSuggestingDocument(superdoc);
    await applyTrackedChange(superdoc, changeType);
    await expectTrackedState(superdoc.page, { changes: 1, bubbles: 1 });

    const changeId = await getSingleTrackedChangeId(superdoc.page);
    await applyDecision(superdoc.page, changeId, 'accept');
    await superdoc.waitForStable();
    await expectTrackedState(superdoc.page, { changes: 0, bubbles: 0 });

    await superdoc.undo();
    await superdoc.waitForStable();
    await expectTrackedState(superdoc.page, { changes: 1, bubbles: 1 });

    await superdoc.redo();
    await superdoc.waitForStable();
    await expectTrackedState(superdoc.page, { changes: 0, bubbles: 0 });
  });
}

for (const changeType of CHANGE_TYPES) {
  test(`reject then undo/redo keeps tracked-change sidebar bubble in sync for ${changeType}`, async ({ superdoc }) => {
    await prepareSuggestingDocument(superdoc);
    await applyTrackedChange(superdoc, changeType);
    await expectTrackedState(superdoc.page, { changes: 1, bubbles: 1 });

    const changeId = await getSingleTrackedChangeId(superdoc.page);
    await applyDecision(superdoc.page, changeId, 'reject');
    await superdoc.waitForStable();
    await expectTrackedState(superdoc.page, { changes: 0, bubbles: 0 });

    await superdoc.undo();
    await superdoc.waitForStable();
    await expectTrackedState(superdoc.page, { changes: 1, bubbles: 1 });

    await superdoc.redo();
    await superdoc.waitForStable();
    await expectTrackedState(superdoc.page, { changes: 0, bubbles: 0 });
  });
}

test('partial undo updates tracked-change bubble text to match the document (SD-2277)', async ({ superdoc }) => {
  const sidebar = superdoc.page.locator('.superdoc__right-sidebar');
  const bubbleText = sidebar.locator('.tracked-change-text.is-inserted');

  await assertDocumentApiReady(superdoc.page);
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.type('hello');
  await superdoc.waitForStable();
  await superdoc.page.waitForTimeout(500);
  await superdoc.type(' world');
  await superdoc.waitForStable();

  await expectTrackedState(superdoc.page, { changes: 1, bubbles: 1 });
  await expect(bubbleText).toContainText('hello world');

  await superdoc.undo();
  await superdoc.waitForStable();
  await expect(bubbleText).toContainText('hello');
  await expect(bubbleText).not.toContainText('world');

  await superdoc.redo();
  await superdoc.waitForStable();
  await expect(bubbleText).toContainText('hello world');
});

test('accepting from the tracked-change bubble can be undone immediately with the keyboard shortcut', async ({
  superdoc,
}) => {
  await prepareSuggestingDocument(superdoc);
  await applyTrackedChange(superdoc, 'addition');
  await expectTrackedState(superdoc.page, { changes: 1, bubbles: 1 });

  const dialog = await activateCommentDialog(superdoc, 'plus');
  await dialog.locator('.comment-header .overflow-menu__icon').first().click();
  await superdoc.waitForStable();
  await expectTrackedState(superdoc.page, { changes: 0, bubbles: 0 });

  await superdoc.undo();
  await superdoc.waitForStable();
  await expectTrackedState(superdoc.page, { changes: 1, bubbles: 1 });
});

test('rejecting from the tracked-change bubble can be undone immediately with the keyboard shortcut', async ({
  superdoc,
}) => {
  await prepareSuggestingDocument(superdoc);
  await applyTrackedChange(superdoc, 'addition');
  await expectTrackedState(superdoc.page, { changes: 1, bubbles: 1 });

  const dialog = await activateCommentDialog(superdoc, 'plus');
  await dialog.locator('.comment-header .overflow-menu__icon').nth(1).click();
  await superdoc.waitForStable();
  await expectTrackedState(superdoc.page, { changes: 0, bubbles: 0 });

  await superdoc.undo();
  await superdoc.waitForStable();
  await expectTrackedState(superdoc.page, { changes: 1, bubbles: 1 });
});
