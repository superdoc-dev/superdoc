import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

async function getFirstParagraphIndentLeft(superdoc: SuperDocFixture): Promise<number | undefined> {
  return superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    return editor?.state?.doc?.firstChild?.attrs?.paragraphProperties?.indent?.left;
  });
}

test('Increase Indent toolbar button on a fresh paragraph adds indent without crashing', async ({ superdoc }) => {
  await superdoc.type('Indent me');
  await superdoc.waitForStable();

  expect(await getFirstParagraphIndentLeft(superdoc)).toBeUndefined();

  await superdoc.page.locator('[data-item="btn-indentright"]').click();
  await superdoc.waitForStable();

  const left = await getFirstParagraphIndentLeft(superdoc);
  expect(typeof left).toBe('number');
  expect(left).toBeGreaterThan(0);
});

test('Decrease Indent removes the indent applied by Increase Indent', async ({ superdoc }) => {
  await superdoc.type('Round trip');
  await superdoc.waitForStable();

  await superdoc.page.locator('[data-item="btn-indentright"]').click();
  await superdoc.waitForStable();
  expect(await getFirstParagraphIndentLeft(superdoc)).toBeGreaterThan(0);

  await superdoc.page.locator('[data-item="btn-indentleft"]').click();
  await superdoc.waitForStable();
  expect(await getFirstParagraphIndentLeft(superdoc)).toBeUndefined();
});

test('Repeated Increase Indent compounds the left indent', async ({ superdoc }) => {
  await superdoc.type('Compounding');
  await superdoc.waitForStable();

  await superdoc.page.locator('[data-item="btn-indentright"]').click();
  await superdoc.waitForStable();
  const afterOne = await getFirstParagraphIndentLeft(superdoc);

  await superdoc.page.locator('[data-item="btn-indentright"]').click();
  await superdoc.waitForStable();
  const afterTwo = await getFirstParagraphIndentLeft(superdoc);

  expect(afterOne).toBeGreaterThan(0);
  expect(afterTwo).toBeGreaterThan(afterOne!);
});
