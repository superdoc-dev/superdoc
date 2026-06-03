import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listComments, listTrackChanges } from '../../helpers/document-api.js';
import {
  activateCommentDialog,
  expectDialogTopNearLocator,
  expectNoDelayedFloatingCommentMotion,
  getCommentId,
} from '../../helpers/comments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/comments-tcs/gdocs-comment-on-change.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('comment thread on tracked change shows both the change and replies', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await listComments(superdoc.page, { includeResolved: true })).total).toBe(4);

  // Both "new text" and "Test" should have comment highlights
  await superdoc.assertCommentHighlightExists({ text: 'new text' });
  await superdoc.assertCommentHighlightExists({ text: 'Test' });

  // Click on the "new text" comment highlight to activate its dialog
  await superdoc.clickOnCommentedText('new text');
  await superdoc.waitForStable();

  // Find the dialog that contains "new text" tracked change info
  const dialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text', { hasText: 'new text' }),
  });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // Replacement tracked changes should show "Replaced <old> with <new>"
  await expect(dialog.locator('.change-type', { hasText: 'Replaced' }).first()).toBeVisible();
  await expect(dialog.locator('.tracked-change-text.is-inserted', { hasText: 'new text' })).toBeVisible();
  await expect(dialog.locator('.tracked-change-text.is-deleted').first()).toBeVisible();

  // Threads with >=2 replies are collapsed by default: only the latest reply is visible
  const collapsedPill = dialog.locator('.collapsed-replies');
  await expect(collapsedPill).toBeVisible({ timeout: 5_000 });
  await expect(collapsedPill).toContainText('1 more reply');

  // In collapsed state, only one reply body is visible
  const commentBodies = dialog.locator('.comment-body .comment');
  await expect(commentBodies).toHaveCount(1);
  await expect(commentBodies.first()).toContainText('reply to reply');

  // Hidden reply summary should remain visible in collapsed mode
  await expect(collapsedPill).toBeVisible();

  await superdoc.snapshot('comment thread on tracked change');
});

test('clicking a different comment activates its dialog', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  // Click on the "Test" comment highlight
  await superdoc.clickOnCommentedText('Test');
  await superdoc.waitForStable();

  // The active dialog should switch to the clicked "Test" thread
  const activeDialog = superdoc.page.locator('.comment-placeholder .comments-dialog.is-active').last();
  await expect(activeDialog).toBeVisible({ timeout: 5_000 });
  const activeComments = activeDialog.locator('.comment-body .comment');
  await expect(activeComments).toHaveCount(2);
  await expect(activeComments.nth(0)).toContainText('abc');
  await expect(activeComments.nth(1)).toContainText('xyz');

  // Click away to deselect
  await superdoc.clickOnLine(4);
  await superdoc.waitForStable();
  await expect(superdoc.page.locator('.comment-placeholder .comments-dialog.is-active')).toHaveCount(0);

  await superdoc.snapshot('comment deselected after clicking away');
});

test('clicking the tracked-change bubble keeps that overlapping thread active', async ({ superdoc, browserName }) => {
  test.skip(browserName !== 'chromium', 'Alignment assertions are currently stabilized in Chromium only.');

  await superdoc.loadDocument(DOC_PATH);
  await superdoc.page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  const trackedChangeBubble = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text', { hasText: 'new text' }),
  });

  await expect(trackedChangeBubble).toBeVisible({ timeout: 5_000 });
  await trackedChangeBubble.first().click({ position: { x: 12, y: 12 } });
  await superdoc.waitForStable();

  const activeDialog = superdoc.page.locator('.comment-placeholder .comments-dialog.is-active', {
    has: superdoc.page.locator('.tracked-change-text', { hasText: 'new text' }),
  });

  await expect(activeDialog).toBeVisible({ timeout: 5_000 });
  await expect(activeDialog.locator('.change-type', { hasText: 'Replaced' }).first()).toBeVisible();
  await expect(activeDialog.locator('.tracked-change-text.is-inserted', { hasText: 'new text' })).toBeVisible();

  const overlappingHighlight = superdoc.page.locator('.superdoc-comment-highlight', { hasText: 'new text' }).first();
  await expectDialogTopNearLocator(activeDialog, overlappingHighlight, { tolerancePx: 24 });
});

test('switching highlighted threads does not trigger a second delayed floating-sidebar movement', async ({
  superdoc,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Motion timing assertions are currently stabilized in Chromium only.');

  await superdoc.loadDocument(DOC_PATH);
  await superdoc.page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  const targetCommentId = await getCommentId(superdoc.page, 'Test');
  const targetDialog = superdoc.page.locator(
    `.comment-placeholder[data-comment-id="${targetCommentId}"] .comments-dialog`,
  );
  const targetHighlight = superdoc.page.locator('.superdoc-comment-highlight', { hasText: 'Test' }).first();

  await activateCommentDialog(superdoc, 'new text');
  await superdoc.waitForStable();

  await superdoc.clickOnCommentedText('Test');
  await expectNoDelayedFloatingCommentMotion(superdoc.page, targetCommentId, {
    ignoreInitialMs: 250,
    observeForMs: 700,
    tolerancePx: 4,
  });

  await expectDialogTopNearLocator(targetDialog, targetHighlight, { tolerancePx: 24 });
  await expect(targetDialog.locator('.comment-body .comment')).toHaveCount(2);
  await expect(targetDialog.locator('.comment-body .comment').nth(0)).toContainText('abc');
  await expect(targetDialog.locator('.comment-body .comment').nth(1)).toContainText('xyz');
});

// SD-2861 regression: explicit comment activation followed by a non-collapsed selection
// (the shape `presentation.navigateTo` produces when landing a NodeSelection on the SDT
// wrapper around a tracked change) must not enter a feedback loop. The plugin used to
// coerce `getActiveCommentId`'s `undefined` return for non-collapsed selections into
// `commentsUpdate({activeCommentId: null})`. The Vue host re-asserted the comment, the
// plugin re-emitted, and `.track-change-focused` toggled ~400 times/second.
//
// This test programmatically reproduces the two-transaction pattern at the live editor
// level so it covers the integrated path (plugin -> PresentationEditor bridge -> store
// listener -> commands.setActiveComment) without depending on a fixture that happens to
// have an SDT-wrapped tracked change.
test('explicit comment activation survives a follow-up non-collapsed selection', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  const result = await superdoc.page.evaluate(async () => {
    const editor = (window as any).editor;
    const view = editor?.view;
    if (!view?.dispatch) throw new Error('editor.view.dispatch not available');

    // Find the first comment-marked range in the doc and capture its id + bounds.
    const commentInfo = ((): { id: string; from: number; to: number } | null => {
      let id: string | null = null;
      let from = -1;
      let to = -1;
      view.state.doc.descendants((node: any, pos: number) => {
        for (const mark of node.marks ?? []) {
          if (mark.type.name !== 'commentMark') continue;
          const candidateId = mark.attrs?.commentId ?? mark.attrs?.importedId;
          if (!candidateId) continue;
          if (id === null) {
            id = candidateId;
            from = pos;
            to = pos + node.nodeSize;
          } else if (candidateId === id) {
            to = Math.max(to, pos + node.nodeSize);
          }
        }
      });
      return id !== null ? { id, from, to } : null;
    })();
    if (!commentInfo) throw new Error('No comment-marked range found in fixture');

    let dispatchCount = 0;
    const originalDispatch = view.dispatch.bind(view);
    view.dispatch = (tr: unknown) => {
      dispatchCount += 1;
      return originalDispatch(tr);
    };

    let toggles = 0;
    const observer = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.attributeName !== 'class') return;
        const oldVal = String(m.oldValue ?? '');
        const newVal = String((m.target as Element).className ?? '');
        if (oldVal === newVal) return;
        const before = oldVal.includes('track-change-focused');
        const after = newVal.includes('track-change-focused');
        if (before !== after) toggles += 1;
      });
    });
    const pages = document.querySelector('.presentation-editor__pages');
    if (pages) {
      observer.observe(pages, {
        attributes: true,
        attributeOldValue: true,
        subtree: true,
        attributeFilter: ['class'],
      });
    }

    try {
      // Tx 1: explicit activation, mirrors the sidebar-click path.
      editor.commands.setActiveComment({ commentId: commentInfo.id });

      // Tx 2: non-collapsed selection that wraps the comment range, mirrors the
      // NodeSelection from `presentation.navigateTo` on an SDT wrapper.
      const SelectionCtor = view.state.selection.constructor as any;
      view.dispatch(view.state.tr.setSelection(SelectionCtor.create(view.state.doc, commentInfo.from, commentInfo.to)));

      // Sample for 800ms. With the bug, the (id, null) emit pair plus the host re-assert
      // produces 200+ toggles/sec; the fix keeps it bounded.
      await new Promise((r) => setTimeout(r, 800));
    } finally {
      observer.disconnect();
      view.dispatch = originalDispatch;
    }

    const activePluginState = view.state.plugins
      .map((p: any) => p.getState?.(view.state))
      .find((s: any) => s && 'activeThreadId' in s);

    return {
      dispatchCount,
      toggles,
      finalActiveThreadId: activePluginState?.activeThreadId ?? null,
      expectedActiveCommentId: commentInfo.id,
    };
  });

  await superdoc.waitForStable();

  // Without the fix: dispatchCount climbs into the dozens (the host re-asserts on every
  // commentsUpdate emit) and toggles climbs into the hundreds. With the fix: bounded.
  expect(result.dispatchCount).toBeLessThanOrEqual(15);
  expect(result.toggles).toBeLessThanOrEqual(3);
  expect(result.finalActiveThreadId).toBe(result.expectedActiveCommentId);
});
