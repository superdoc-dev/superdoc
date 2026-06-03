import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

test('default toolbar disables mutation controls inside content-locked SDT content', async ({ superdoc }) => {
  await superdoc.type('Before ');
  await superdoc.waitForStable();

  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertStructuredContentInline({
      attrs: { id: '6201', alias: 'Toolbar Lock', lockMode: 'contentLocked' },
      text: 'Locked value',
    });
  });
  await superdoc.waitForStable();

  const lockedTextPos = await superdoc.findTextPos('Locked value');
  await superdoc.setTextSelection(lockedTextPos + 1);
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('[data-item="btn-bold"]')).toHaveClass(/disabled/);
  await expect(superdoc.page.locator('[data-item="btn-italic"]')).toHaveClass(/disabled/);
  await expect(superdoc.page.locator('[data-item="btn-underline"]')).toHaveClass(/disabled/);
  await expect(superdoc.page.locator('[data-item="btn-link"]')).toHaveClass(/disabled/);
});
