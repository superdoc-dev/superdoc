import { test, expect } from '../../fixtures/superdoc.js';
import type { Page } from '@playwright/test';
import { addCommentByText, assertDocumentApiReady } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

/**
 * SD-2792 — `editor.doc.selection.current()` exposes
 * `activeCommentIds` and `activeChangeIds` so custom sidebars can
 * answer "is there a comment / tracked change under the cursor?"
 * without DOM-shaped workarounds.
 *
 * Unit tests cover the resolver in isolation. This Playwright spec
 * runs the real PM transactions against a live editor + Document API
 * surface and verifies the projected ids reflect cursor placement
 * end-to-end.
 */

async function activeCommentIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const result = (window as any).editor.doc.selection.current({ includeText: false });
    return Array.isArray(result?.activeCommentIds) ? [...result.activeCommentIds] : [];
  });
}

/**
 * Walk the PM doc and return the first inline-text PM position that
 * carries a `commentMark` with the given id. Used to drop the caret
 * inside a known comment span.
 */
async function pmPositionInsideComment(page: Page, commentId: string): Promise<number | null> {
  return page.evaluate((id) => {
    const editor = (window as any).editor;
    let pos: number | null = null;
    editor.state.doc.descendants((node: any, nodePos: number) => {
      if (pos != null) return false;
      if (!node.isText || !Array.isArray(node.marks)) return true;
      const hit = node.marks.some((m: any) => m.type?.name === 'commentMark' && m.attrs?.commentId === id);
      if (hit && node.nodeSize > 1) {
        // Mid-text caret = nodePos + 1 lands on the second char,
        // which is unambiguously inside the mark.
        pos = nodePos + 1;
        return false;
      }
      return true;
    });
    return pos;
  }, commentId);
}

/**
 * Walk the PM doc and return the first inline-text PM position whose
 * inline node has NO `commentMark` (any id). Used to drop the caret
 * outside every comment.
 */
async function pmPositionOutsideAnyComment(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const editor = (window as any).editor;
    let pos: number | null = null;
    editor.state.doc.descendants((node: any, nodePos: number) => {
      if (pos != null) return false;
      if (!node.isText || node.nodeSize <= 1) return true;
      const marks = Array.isArray(node.marks) ? node.marks : [];
      const hasComment = marks.some((m: any) => m.type?.name === 'commentMark');
      if (!hasComment) {
        pos = nodePos + 1;
        return false;
      }
      return true;
    });
    return pos;
  });
}

test('caret inside a comment span surfaces commentId in selection.current().activeCommentIds', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Cursor target inside a comment span here');
  await superdoc.waitForStable();

  const commentId = await addCommentByText(superdoc.page, {
    pattern: 'inside',
    text: 'comment for selection probe',
  });
  await superdoc.waitForStable();

  const insidePos = await pmPositionInsideComment(superdoc.page, commentId);
  expect(insidePos).toBeGreaterThan(0);

  await superdoc.setTextSelection(insidePos as number);
  await superdoc.waitForStable();

  const ids = await activeCommentIds(superdoc.page);
  expect(ids).toContain(commentId);
});

test('caret outside any comment span returns an empty activeCommentIds array', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Outside zone with one commented word.');
  await superdoc.waitForStable();

  await addCommentByText(superdoc.page, {
    pattern: 'commented',
    text: 'isolated comment',
  });
  await superdoc.waitForStable();

  const outsidePos = await pmPositionOutsideAnyComment(superdoc.page);
  expect(outsidePos).toBeGreaterThan(0);

  await superdoc.setTextSelection(outsidePos as number);
  await superdoc.waitForStable();

  const ids = await activeCommentIds(superdoc.page);
  expect(ids).toEqual([]);
});

test('moving the caret between two distinct comment spans switches the active id', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('alpha bravo charlie delta');
  await superdoc.waitForStable();

  const commentA = await addCommentByText(superdoc.page, {
    pattern: 'bravo',
    text: 'comment A',
  });
  await superdoc.waitForStable();
  const commentB = await addCommentByText(superdoc.page, {
    pattern: 'charlie',
    text: 'comment B',
  });
  await superdoc.waitForStable();

  // Caret inside A → activeCommentIds reports A only.
  const insideA = await pmPositionInsideComment(superdoc.page, commentA);
  expect(insideA).toBeGreaterThan(0);
  await superdoc.setTextSelection(insideA as number);
  await superdoc.waitForStable();
  const idsA = await activeCommentIds(superdoc.page);
  expect(idsA).toContain(commentA);
  expect(idsA).not.toContain(commentB);

  // Caret inside B → switches to B only.
  const insideB = await pmPositionInsideComment(superdoc.page, commentB);
  expect(insideB).toBeGreaterThan(0);
  await superdoc.setTextSelection(insideB as number);
  await superdoc.waitForStable();
  const idsB = await activeCommentIds(superdoc.page);
  expect(idsB).toContain(commentB);
  expect(idsB).not.toContain(commentA);
});
