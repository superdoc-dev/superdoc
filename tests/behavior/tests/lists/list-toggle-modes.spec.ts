import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import {
  createOrderedList,
  countListMarkers,
  getParagraphNumberingByText,
  LIST_MARKER_SELECTOR,
} from '../../helpers/lists.js';

test.use({ config: { toolbar: 'full' } });

const ORDERED_LIST_BUTTON = '[data-item="btn-numberedlist"]';

async function clickOrderedListButton(superdoc: SuperDocFixture): Promise<void> {
  await superdoc.page.locator(ORDERED_LIST_BUTTON).click();
  await superdoc.waitForStable();
}

test.describe('list toggle modes', () => {
  test('toggles ordered list off when selection is already fully ordered', async ({ superdoc }) => {
    await createOrderedList(superdoc, ['alpha', 'beta', 'gamma']);

    expect(await countListMarkers(superdoc)).toBe(3);

    await superdoc.selectAll();
    await superdoc.waitForStable();
    await clickOrderedListButton(superdoc);

    await expect(superdoc.page.locator(LIST_MARKER_SELECTOR)).toHaveCount(0);
    await superdoc.assertTextContains('alpha');
    await superdoc.assertTextContains('beta');
    await superdoc.assertTextContains('gamma');
  });

  test('reuses numbering for existing list items when selection mixes list and plain paragraphs', async ({
    superdoc,
  }) => {
    await createOrderedList(superdoc, ['alpha', 'beta']);

    await superdoc.newLine();
    await superdoc.waitForStable();
    await superdoc.newLine();
    await superdoc.waitForStable();

    await superdoc.type('gamma');
    await superdoc.waitForStable();
    await superdoc.newLine();
    await superdoc.waitForStable();
    await superdoc.type('delta');
    await superdoc.waitForStable();

    const alphaBefore = await getParagraphNumberingByText(superdoc, 'alpha');
    const betaBefore = await getParagraphNumberingByText(superdoc, 'beta');

    expect(alphaBefore?.numId).not.toBeNull();
    expect(betaBefore?.numId).not.toBeNull();

    await superdoc.selectAll();
    await superdoc.waitForStable();
    await clickOrderedListButton(superdoc);

    const alphaAfter = await getParagraphNumberingByText(superdoc, 'alpha');
    const betaAfter = await getParagraphNumberingByText(superdoc, 'beta');
    const gammaAfter = await getParagraphNumberingByText(superdoc, 'gamma');
    const deltaAfter = await getParagraphNumberingByText(superdoc, 'delta');

    expect(alphaAfter).not.toBeNull();
    expect(betaAfter).not.toBeNull();
    expect(gammaAfter).not.toBeNull();
    expect(deltaAfter).not.toBeNull();

    expect(alphaAfter?.numId).toBe(alphaBefore?.numId);
    expect(alphaAfter?.ilvl).toBe(alphaBefore?.ilvl);
    expect(betaAfter?.numId).toBe(betaBefore?.numId);
    expect(betaAfter?.ilvl).toBe(betaBefore?.ilvl);

    expect(gammaAfter?.numId).not.toBeNull();
    expect(deltaAfter?.numId).not.toBeNull();
    expect(await countListMarkers(superdoc)).toBeGreaterThanOrEqual(4);
  });
});
