import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentViaUI } from '../../helpers/comments.js';
import { clickAtDocPos } from '../../helpers/editor-interactions.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('SD-2442: clicking inside commented text places a caret and allows typing', async ({ superdoc }) => {
  await superdoc.type('alpha beta gamma');
  await superdoc.waitForStable();

  await addCommentViaUI(superdoc, {
    textToSelect: 'beta gamma',
    commentText: 'outer comment',
  });

  await superdoc.assertCommentHighlightExists({ text: 'beta gamma' });

  const betaStart = await superdoc.findTextPos('beta');
  const insertionPos = betaStart + 2;

  await superdoc.clickOnLine(0, 5);
  await superdoc.waitForStable();
  await expect((await superdoc.getSelection()).from).not.toBe(insertionPos);

  await clickAtDocPos(superdoc.page, insertionPos);
  await superdoc.waitForStable();

  await superdoc.assertSelection(insertionPos);

  await superdoc.page.keyboard.type('X');
  await superdoc.waitForStable();

  await expect.poll(() => superdoc.getTextContent()).toContain('alpha beXta gamma');
});

test('SD-2442: clicking inside commented text activates the comment bubble', async ({ superdoc }) => {
  await superdoc.type('hello world');
  await superdoc.waitForStable();

  await addCommentViaUI(superdoc, {
    textToSelect: 'world',
    commentText: 'bubble test',
  });

  await superdoc.assertCommentHighlightExists({ text: 'world' });

  // Click outside the comment to deselect it first
  await superdoc.clickOnLine(0, 0);
  await superdoc.waitForStable();
  await expect(superdoc.page.locator('.comments-dialog.is-active')).toHaveCount(0, { timeout: 3000 });

  // Click inside the commented text
  const worldPos = await superdoc.findTextPos('world');
  await clickAtDocPos(superdoc.page, worldPos + 2);
  await superdoc.waitForStable();

  // The comment bubble should be active and stay active
  await expect(superdoc.page.locator('.comments-dialog.is-active')).toBeVisible({ timeout: 5000 });
  await expect(superdoc.page.locator('.comments-dialog.is-active')).toContainText('bubble test');
});

test('SD-2442: double-clicking inside commented text selects a word', async ({ superdoc }) => {
  await superdoc.type('select this word');
  await superdoc.waitForStable();

  await addCommentViaUI(superdoc, {
    textToSelect: 'this word',
    commentText: 'dblclick test',
  });

  await superdoc.assertCommentHighlightExists({ text: 'this word' });

  // Click outside first
  await superdoc.clickOnLine(0, 0);
  await superdoc.waitForStable();

  // Double-click on "word" inside the comment highlight
  const wordPos = await superdoc.findTextPos('word');
  const coords = await superdoc.page.evaluate((pos) => {
    const editor = (window as any).editor;
    const rect = editor?.coordsAtPos?.(pos);
    if (!rect) return null;
    return { left: Number(rect.left), right: Number(rect.right), top: Number(rect.top), bottom: Number(rect.bottom) };
  }, wordPos);

  if (coords) {
    const x = coords.left + 5;
    const y = (coords.top + coords.bottom) / 2;
    await superdoc.page.mouse.dblclick(x, y);
    await superdoc.waitForStable();

    const sel = await superdoc.getSelection();
    const selectedText = await superdoc.page.evaluate(
      ({ from, to }) => {
        const editor = (window as any).editor;
        return editor.state.doc.textBetween(from, to);
      },
      { from: sel.from, to: sel.to },
    );
    expect(selectedText).toBe('word');
  }
});
