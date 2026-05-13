import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

// Direction buttons are in `itemsToHideXL` (defaultItems.js); below the XL
// cutoff (~1494px container width) they collapse into the overflow popup.
// Playwright's `devices['Desktop Chrome']` defaults the viewport to 1280, so
// pin a wider viewport here to exercise the direct-toolbar click path. The
// narrow-viewport test below opts back into a smaller width to cover overflow.
test.use({
  config: { toolbar: 'full', showSelection: true },
  viewport: { width: 1600, height: 1200 },
});

// PR #3226: end-to-end coverage for the LTR/RTL toolbar buttons. Each test
// clicks the actual button users see, then reads the ProseMirror doc to
// confirm the rightToLeft attr was written / deleted as expected.

async function clickDirectionButton(superdoc: SuperDocFixture, name: 'directionLtr' | 'directionRtl') {
  await superdoc.page.locator(`[data-item="btn-${name}"]`).first().click();
  await superdoc.waitForStable();
}

async function readParagraphProperties(
  superdoc: SuperDocFixture,
): Promise<Array<{ text: string; rightToLeft: boolean | '<absent>' }>> {
  return superdoc.page.evaluate(() => {
    const editor = (window as any).editor || (window as any).superdoc?.editor;
    const out: Array<{ text: string; rightToLeft: boolean | '<absent>' }> = [];
    editor?.state?.doc?.descendants((node: any) => {
      if (node.type.name !== 'paragraph') return true;
      const pp = node.attrs?.paragraphProperties || {};
      out.push({
        text: (node.textContent || '').slice(0, 40),
        rightToLeft: 'rightToLeft' in pp ? pp.rightToLeft : '<absent>',
      });
      return false;
    });
    return out;
  });
}

test('clicking Right-to-left sets paragraphProperties.rightToLeft = true', async ({ superdoc }) => {
  await superdoc.type('Hello world');
  await superdoc.waitForStable();

  const pos = await superdoc.findTextPos('Hello world');
  await superdoc.setTextSelection(pos);
  await superdoc.waitForStable();

  const before = await readParagraphProperties(superdoc);
  expect(before[0].rightToLeft).toBe('<absent>');

  await clickDirectionButton(superdoc, 'directionRtl');

  const after = await readParagraphProperties(superdoc);
  expect(after[0].rightToLeft).toBe(true);
});

test('clicking Left-to-right on a vanilla paragraph deletes the rightToLeft key', async ({ superdoc }) => {
  await superdoc.type('Will toggle direction');
  await superdoc.waitForStable();

  const pos = await superdoc.findTextPos('Will toggle direction');
  await superdoc.setTextSelection(pos);
  await superdoc.waitForStable();

  // First mark RTL so there's something to revert.
  await clickDirectionButton(superdoc, 'directionRtl');
  const afterRtl = await readParagraphProperties(superdoc);
  expect(afterRtl[0].rightToLeft).toBe(true);

  // LTR on a no-cascade paragraph deletes the inline override (vanilla
  // paragraph stays vanilla, doesn't carry an explicit <w:bidi w:val="0"/>).
  await clickDirectionButton(superdoc, 'directionLtr');
  const afterLtr = await readParagraphProperties(superdoc);
  expect(afterLtr[0].rightToLeft).toBe('<absent>');
});

test('Right-to-left then Left-to-right is one undo step (atomic transaction)', async ({ superdoc }) => {
  await superdoc.type('Undo me');
  await superdoc.waitForStable();

  const pos = await superdoc.findTextPos('Undo me');
  await superdoc.setTextSelection(pos);
  await superdoc.waitForStable();

  await clickDirectionButton(superdoc, 'directionRtl');
  expect((await readParagraphProperties(superdoc))[0].rightToLeft).toBe(true);

  // Single undo should fully revert the direction change.
  await superdoc.page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
  await superdoc.waitForStable();

  expect((await readParagraphProperties(superdoc))[0].rightToLeft).toBe('<absent>');
});

test('multi-paragraph selection: Right-to-left applies to every selected paragraph', async ({ superdoc }) => {
  await superdoc.type('First paragraph');
  await superdoc.press('Enter');
  await superdoc.type('Second paragraph');
  await superdoc.press('Enter');
  await superdoc.type('Third paragraph');
  await superdoc.waitForStable();

  // Select from start of the first paragraph's text through end of the third.
  // findTextPos returns a single number (the start position); end = start + length.
  const firstStart = await superdoc.findTextPos('First paragraph');
  const thirdStart = await superdoc.findTextPos('Third paragraph');
  const thirdEnd = thirdStart + 'Third paragraph'.length;
  await superdoc.setTextSelection(firstStart, thirdEnd);
  await superdoc.waitForStable();

  await clickDirectionButton(superdoc, 'directionRtl');

  const after = await readParagraphProperties(superdoc);
  const firstThree = after.slice(0, 3);
  for (const p of firstThree) {
    expect(p.rightToLeft).toBe(true);
  }
});

test('direction buttons reachable via overflow popup at narrow widths', async ({ superdoc }) => {
  await superdoc.type('Narrow viewport test');
  await superdoc.waitForStable();

  // Below XL cutoff (~1494): direction items move into the overflow popup.
  await superdoc.page.setViewportSize({ width: 900, height: 800 });
  await superdoc.waitForStable();

  const pos = await superdoc.findTextPos('Narrow viewport test');
  await superdoc.setTextSelection(pos);
  await superdoc.waitForStable();

  // Open the overflow popup, then click RTL from inside it.
  await superdoc.page.locator('[data-item="btn-overflow"]').first().click();
  await superdoc.waitForStable();
  await superdoc.page.locator('[data-item="btn-directionRtl"]').first().click();
  await superdoc.waitForStable();

  expect((await readParagraphProperties(superdoc))[0].rightToLeft).toBe(true);
});
