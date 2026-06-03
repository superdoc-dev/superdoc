import { test, expect } from '../../fixtures/superdoc.js';
import { rightClickAtDocPos } from '../../helpers/editor-interactions.js';

test.use({ config: { toolbar: 'full' } });

test('right-click does not open empty context menu when defaults are disabled and no custom items exist', async ({
  superdoc,
  page,
}) => {
  const errors: string[] = [];
  const onPageError = (error: Error) => errors.push(`pageerror:${error.message}`);
  const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
    if (msg.type() === 'error') {
      errors.push(`console:${msg.text()}`);
    }
  };

  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  try {
    await page.evaluate(() => {
      const editor = (window as any).editor;
      if (!editor?.options) {
        throw new Error('Expected window.editor.options to be available.');
      }
      editor.options.contextMenuConfig = {
        includeDefaultItems: false,
        customItems: [],
      };
    });

    await superdoc.type('Context menu should stay hidden');
    await superdoc.waitForStable();

    const pos = await superdoc.findTextPos('Context');
    await rightClickAtDocPos(page, pos + 1);
    await superdoc.waitForStable();

    await expect(page.locator('.context-menu')).toHaveCount(0);
    expect(errors.join('\n')).not.toContain('#storySessionManager');
    expect(errors.join('\n')).not.toContain('Cannot read private member');
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }
});
