import { test, expect } from '../../fixtures/superdoc.js';

test.use({
  config: {
    extensions: ['customer-focus-highlight'],
    hideSelection: false,
  },
});

test('@behavior custom extension scaffold wires customer focus highlight', async ({ superdoc }) => {
  await superdoc.type('Customer focus extension smoke test');
  await superdoc.waitForStable();

  const extensionState = await superdoc.page.evaluate(() => {
    const superdocConfig = (window as any).superdoc?.config;
    const editor = (window as any).editor;

    return {
      locationSearch: window.location.search,
      configuredExtensions: (superdocConfig?.editorExtensions || []).map((ext: any) => ext?.name),
      externalExtensions: (editor?.options?.externalExtensions || []).map((ext: any) => ext?.name),
    };
  });

  expect(extensionState.locationSearch).toContain('extensions=customer-focus-highlight');
  expect(extensionState.configuredExtensions).toContain('customer-focus-highlight');
  expect(extensionState.externalExtensions).toContain('customer-focus-highlight');

  const commands = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    return {
      setFocus: typeof editor?.commands?.setFocus === 'function',
      clearFocus: typeof editor?.commands?.clearFocus === 'function',
    };
  });

  expect(commands.setFocus).toBe(true);
  expect(commands.clearFocus).toBe(true);

  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setFocus(1, 9);
  });
  await superdoc.waitForStable();

  const highlightCountsAfterSet = await superdoc.page.evaluate(() => {
    return {
      total: document.querySelectorAll('.highlight-selection').length,
      painted: document.querySelectorAll('.superdoc-page .highlight-selection').length,
      hiddenPm: document.querySelectorAll('[contenteditable="true"] .highlight-selection').length,
    };
  });
  expect(highlightCountsAfterSet.total).toBeGreaterThan(0);
  expect(highlightCountsAfterSet.painted).toBeGreaterThan(0);

  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.clearFocus();
  });
  await superdoc.waitForStable();

  const highlightCountAfterClear = await superdoc.page.locator('.highlight-selection').count();
  expect(highlightCountAfterClear).toBe(0);
});
