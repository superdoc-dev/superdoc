/**
 * SD-3400 footnote interactions, end to end through the presentation surface:
 *
 * 1. Double-click a BODY reference marker navigates to (and focuses) the note.
 * 2. Staged Backspace: first press selects the marker, second press removes it
 *    AND prunes the w:footnote element ("remove on both sides"), renumbering
 *    the remaining notes.
 * 3. Area-delete: clearing all note content removes the footnote everywhere
 *    (body marker + OOXML element) and exits the session.
 * 4. insertFootnote command: inserts the marker at the cursor, creates the
 *    note, and focuses the new note session, on a document without footnotes.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import { BASIC_FOOTNOTES_DOC_PATH, H_F_NORMAL_DOC_PATH } from '../../helpers/story-fixtures.js';

test.use({ config: { showCaret: true, showSelection: true } });

async function getActiveStorySession(page: Page) {
  return page.evaluate(() => {
    const session = (window as any).editor?.presentationEditor?.getStorySessionManager?.()?.getActiveSession?.();
    return session?.locator ?? null;
  });
}

/** Body footnoteReference positions and ids, in document order. */
async function getBodyNoteRefs(page: Page): Promise<Array<{ pos: number; id: string }>> {
  return page.evaluate(() => {
    const refs: Array<{ pos: number; id: string }> = [];
    (window as any).editor.state.doc.descendants((node: any, pos: number) => {
      if (node.type?.name === 'footnoteReference') refs.push({ pos, id: String(node.attrs?.id ?? '') });
      return true;
    });
    return refs;
  });
}

/** w:footnote ids present in the canonical footnotes part (separators excluded). */
async function getFootnoteElementIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const xml = (window as any).editor?.converter?.convertedXml?.['word/footnotes.xml'];
    const root = xml?.elements?.[0];
    if (!root?.elements) return [];
    return root.elements
      .filter(
        (el: any) =>
          el.name === 'w:footnote' &&
          el.attributes?.['w:type'] !== 'separator' &&
          el.attributes?.['w:type'] !== 'continuationSeparator',
      )
      .map((el: any) => String(el.attributes?.['w:id'] ?? ''));
  });
}

async function focusBodyAt(page: Page, pos: number) {
  await page.evaluate((position) => {
    const editor = (window as any).editor;
    const TextSelection = editor.state.selection.constructor;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position)));
    editor.view.focus();
  }, pos);
}

test('double-click a body reference marker opens the referenced note session', async ({ superdoc }) => {
  await superdoc.loadDocument(BASIC_FOOTNOTES_DOC_PATH);
  await superdoc.waitForStable();

  const marker = superdoc.page.locator('[data-note-reference][data-note-id="1"]').first();
  await marker.scrollIntoViewIfNeeded();
  await marker.waitFor({ state: 'visible', timeout: 15_000 });

  const box = await marker.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();

  await expect
    .poll(() => getActiveStorySession(superdoc.page))
    .toEqual({ kind: 'story', storyType: 'footnote', noteId: '1' });
});

test('staged Backspace removes the marker and prunes the note on both sides', async ({ superdoc }) => {
  await superdoc.loadDocument(BASIC_FOOTNOTES_DOC_PATH);
  await superdoc.waitForStable();

  const refsBefore = await getBodyNoteRefs(superdoc.page);
  expect(refsBefore.map((r) => r.id)).toEqual(['1', '2']);
  expect(await getFootnoteElementIds(superdoc.page)).toEqual(['1', '2']);

  // Caret immediately after footnote 1's marker (inside the body editor).
  const firstRef = refsBefore[0];
  await superdoc.page
    .locator('[data-block-id]:not([data-block-id^="footnote-"])')
    .filter({ hasText: 'Simple text' })
    .first()
    .click();
  await superdoc.waitForStable();
  await focusBodyAt(superdoc.page, firstRef.pos + 1);

  // First Backspace: the marker is SELECTED, not deleted (Word-like staging).
  await superdoc.page.keyboard.press('Backspace');
  await expect.poll(() => getBodyNoteRefs(superdoc.page).then((r) => r.length)).toBe(2);
  const selection = await superdoc.page.evaluate(() => {
    const sel = (window as any).editor.state.selection;
    return { from: sel.from, to: sel.to };
  });
  expect(selection).toEqual({ from: firstRef.pos, to: firstRef.pos + 1 });

  // Second Backspace: marker gone, w:footnote element pruned, note renumbered.
  await superdoc.page.keyboard.press('Backspace');
  await superdoc.waitForStable();

  await expect.poll(() => getBodyNoteRefs(superdoc.page).then((r) => r.map((x) => x.id))).toEqual(['2']);
  await expect.poll(() => getFootnoteElementIds(superdoc.page)).toEqual(['2']);
  // Former footnote 2 renumbers to display "1".
  const note2 = superdoc.page.locator('[data-block-id^="footnote-2-"]').first();
  await note2.scrollIntoViewIfNeeded();
  await expect(note2).toContainText(/^\s*1/);
});

test('clearing all note content removes the footnote on both sides', async ({ superdoc }) => {
  await superdoc.loadDocument(BASIC_FOOTNOTES_DOC_PATH);
  await superdoc.waitForStable();

  const note = superdoc.page.locator('[data-block-id^="footnote-1-"]').first();
  await note.scrollIntoViewIfNeeded();
  await note.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await note.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();
  await expect
    .poll(() => getActiveStorySession(superdoc.page))
    .toEqual({ kind: 'story', storyType: 'footnote', noteId: '1' });

  // Clear all content in the note area.
  await superdoc.page.keyboard.press('ControlOrMeta+a');
  await superdoc.page.keyboard.press('Backspace');
  await superdoc.waitForStable();

  // Emptied-note commit: session exits, marker AND element are removed.
  await expect.poll(() => getActiveStorySession(superdoc.page)).toBeNull();
  await expect.poll(() => getBodyNoteRefs(superdoc.page).then((r) => r.map((x) => x.id))).toEqual(['2']);
  await expect.poll(() => getFootnoteElementIds(superdoc.page)).toEqual(['2']);
  await expect(superdoc.page.locator('[data-block-id^="footnote-1-"]')).toHaveCount(0);
});

test('insertFootnote places a marker at the cursor and focuses the new note', async ({ superdoc }) => {
  // h_f-normal has no body footnote references.
  await superdoc.loadDocument(H_F_NORMAL_DOC_PATH);
  await superdoc.waitForStable();

  expect(await getBodyNoteRefs(superdoc.page)).toEqual([]);

  await superdoc.page
    .locator('[data-block-id]:not([data-block-id^="footnote-"])')
    .filter({ hasText: 'This is a document' })
    .first()
    .click();
  await superdoc.waitForStable();

  const inserted = await superdoc.page.evaluate(() => (window as any).editor.commands.insertFootnote?.() ?? false);
  expect(inserted).toBe(true);
  await superdoc.waitForStable();

  const refs = await getBodyNoteRefs(superdoc.page);
  expect(refs).toHaveLength(1);
  expect(await getFootnoteElementIds(superdoc.page)).toEqual([refs[0].id]);

  // The new note paints with its marker and the session is focused on it.
  const noteFragment = superdoc.page.locator(`[data-block-id^="footnote-${refs[0].id}-"]`).first();
  await noteFragment.scrollIntoViewIfNeeded();
  await expect(noteFragment).toBeVisible();
  await expect
    .poll(() => getActiveStorySession(superdoc.page))
    .toEqual({ kind: 'story', storyType: 'footnote', noteId: refs[0].id });
});
