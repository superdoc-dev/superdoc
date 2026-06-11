import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listTrackChanges } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', showSelection: true, trackChanges: true } });

async function expectEditorFocused(superdoc: SuperDocFixture): Promise<void> {
  await expect
    .poll(() =>
      superdoc.page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement && active.classList.contains('ProseMirror');
      }),
    )
    .toBe(true);
}

// Pin document fonts so async font detection cannot rebuild the toolbar items
// mid Tab-handoff (mirrors font-dropdown-document-options.spec.ts).
async function stubDocumentFontsAndNotify(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.page.evaluate(() => {
    const sd = (window as any).superdoc;
    sd.fonts.getDocumentFontOptions = () => [];
    sd.toolbar.activeEditor.emit('fonts-changed');
  });
  await superdoc.waitForStable();
}

async function trackedText(superdoc: SuperDocFixture, markName: 'trackInsert' | 'trackDelete'): Promise<string> {
  return superdoc.page.evaluate((name) => {
    const editor = (window as any).editor;
    let text = '';
    editor.state.doc.descendants((node: any) => {
      if (!node?.isText || !node.text) return;
      const hasMark = (node.marks ?? []).some((mark: any) => mark.type?.name === name);
      if (hasMark) text += node.text;
    });
    return text;
  }, markName);
}

test('typing over toolbar-preserved selection stays tracked in suggesting mode', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('Tracked toolbar sample');
  await superdoc.waitForStable();
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await stubDocumentFontsAndNotify(superdoc);

  const pos = await superdoc.findTextPos('Tracked toolbar sample');
  await superdoc.setTextSelection(pos, pos + 'Tracked toolbar sample'.length);
  await superdoc.waitForStable();

  const fontInput = superdoc.page.locator('[data-item="btn-fontFamily"] input');
  await fontInput.click();
  await fontInput.fill('cou');
  await fontInput.press('Tab');

  const fontSizeInput = superdoc.page.locator('#inlineTextInput-fontSize');
  await expect(fontSizeInput).toBeFocused();
  await fontSizeInput.fill('18');
  await fontSizeInput.press('Tab');
  await expectEditorFocused(superdoc);

  await superdoc.page.keyboard.type('Done');
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);
  await expect.poll(() => trackedText(superdoc, 'trackInsert')).toContain('Done');
  await expect.poll(() => trackedText(superdoc, 'trackDelete')).toContain('Tracked toolbar sample');
});
