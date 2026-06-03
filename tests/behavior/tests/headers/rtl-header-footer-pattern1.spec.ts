import { expect, test } from '../../fixtures/superdoc.js';
import { RTL_PATTERN1_HEADER_FOOTER_DOC_PATH } from '../../helpers/story-fixtures.js';
import {
  activateFooter,
  activateHeader,
  getFooterEditorLocator,
  getActiveStoryText,
  getHeaderEditorLocator,
  moveActiveStoryCursorToEnd,
} from '../../helpers/story-surfaces.js';

test.use({
  config: {
    showCaret: true,
    showSelection: true,
  },
});

test('Pattern 1 run-level RTL enables dir="rtl" in active header/footer editor paragraphs', async ({ superdoc }) => {
  await superdoc.loadDocument(RTL_PATTERN1_HEADER_FOOTER_DOC_PATH);
  await superdoc.waitForStable();

  await activateHeader(superdoc);
  await expect(getHeaderEditorLocator(superdoc.page).locator('p').first()).toHaveAttribute('dir', 'rtl');

  await activateFooter(superdoc);
  await expect(getFooterEditorLocator(superdoc.page).locator('p').first()).toHaveAttribute('dir', 'rtl');
});

test('Backspace is stable in RTL Pattern 1 footer paragraph', async ({ superdoc }) => {
  await superdoc.loadDocument(RTL_PATTERN1_HEADER_FOOTER_DOC_PATH);
  await superdoc.waitForStable();

  await activateFooter(superdoc);
  await moveActiveStoryCursorToEnd(superdoc.page);
  await superdoc.press('Backspace');
  await superdoc.waitForStable();

  await expect.poll(async () => (await getActiveStoryText(superdoc.page))?.replace(/\s+/g, '').trim()).toBe('שלוםאב');
});

test('Shift+Arrow creates and updates selection in RTL Pattern 1 footer paragraph', async ({ superdoc }) => {
  await superdoc.loadDocument(RTL_PATTERN1_HEADER_FOOTER_DOC_PATH);
  await superdoc.waitForStable();

  await activateFooter(superdoc);
  await superdoc.page.evaluate(() => {
    const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
    const bodyEditor = (window as any).editor;
    if (!activeEditor || activeEditor === bodyEditor) return;

    const doc = activeEditor.state?.doc;
    if (!doc) return;

    let firstTextPos: number | null = null;
    let lastTextPos: number | null = null;
    doc.descendants((node: any, pos: number) => {
      if (!node?.isText || typeof node?.text !== 'string' || node.text.length === 0) return true;
      const from = pos;
      const to = pos + node.text.length;
      if (firstTextPos == null || from < firstTextPos) firstTextPos = from;
      if (lastTextPos == null || to > lastTextPos) lastTextPos = to;
      return true;
    });

    const fallback = Math.max(1, doc.content.size - 1);
    const middle =
      firstTextPos != null && lastTextPos != null
        ? firstTextPos + Math.max(0, Math.floor((lastTextPos - firstTextPos) / 2))
        : fallback;
    const pos = Math.max(1, Math.min(middle, doc.content.size - 1));
    activeEditor.commands?.setTextSelection?.({ from: pos, to: pos });
    activeEditor.view?.focus?.();
  });
  await getFooterEditorLocator(superdoc.page).focus();
  await superdoc.waitForStable();

  const selectionState = async () =>
    superdoc.page.evaluate(() => {
      const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      const selection = activeEditor?.state?.selection;
      if (!selection) return null;
      return {
        from: selection.from,
        to: selection.to,
        anchor: selection.anchor,
        head: selection.head,
      };
    });

  const before = await selectionState();
  expect(before).not.toBeNull();
  expect(before!.from).toBe(before!.to);

  await superdoc.press('Shift+ArrowLeft');
  await superdoc.waitForStable();
  const expanded = await selectionState();
  expect(expanded).not.toBeNull();
  expect(Math.abs(expanded!.to - expanded!.from)).toBeGreaterThan(0);
  expect(expanded!.head).not.toBe(before!.head);

  await superdoc.press('Shift+ArrowRight');
  await superdoc.waitForStable();
  const collapsed = await selectionState();
  expect(collapsed).not.toBeNull();
  expect(collapsed!.from).toBe(collapsed!.to);
});
