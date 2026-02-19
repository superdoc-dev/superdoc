import { defineStory } from '@superdoc-testing/helpers';
import { clickOnLine } from '../../helpers/index.js';

const WAIT_MS = 300;
const WAIT_LONG_MS = 600;

export default defineStory({
  name: 'slash-menu-paste',
  description: 'Verify the slash menu shows a Paste action and that pasting formatted HTML preserves formatting.',
  tickets: ['SD-1302'],
  startDocument: null,
  hideCaret: true,

  async run(page, helpers): Promise<void> {
    const { step, type, newLine, press, waitForStable, milestone } = helpers;

    await step('Type a normal line', async () => {
      await type('Normal line');
      await newLine();
      await waitForStable(WAIT_MS);
      await milestone('before-paste', 'One line typed, cursor on second line.');
    });

    await step('Open slash menu via right-click to show Paste option', async () => {
      const lines = page.locator('.superdoc-line');
      const lastLine = lines.last();
      const box = await lastLine.boundingBox();
      if (!box) throw new Error('Last line not visible');

      await page.mouse.click(box.x + 20, box.y + box.height / 2, { button: 'right' });
      await waitForStable(WAIT_MS);

      const menu = page.locator('.slash-menu');
      await menu.waitFor({ state: 'visible', timeout: 5000 });
      await waitForStable(WAIT_MS);

      await milestone('slash-menu-open', 'Slash menu visible with Paste action.');
    });

    await step('Dismiss menu and paste bold HTML via editor API', async () => {
      await press('Escape');
      await waitForStable(WAIT_MS);

      // Reposition cursor on line 2 (lost when slash menu closed)
      await clickOnLine(page, 1);
      await waitForStable(WAIT_MS);

      // Paste formatted HTML directly via ProseMirror's pasteHTML API.
      // This exercises the same rendering path as the slash menu paste action
      // without depending on browser clipboard permissions.
      // A clipboard event shim is required — pasteHTML internally accesses
      // event.clipboardData.getData().
      await page.evaluate(
        `(function() {
          var view = window.editor && window.editor.view;
          if (!view) return;
          var html = '<b>Bold pasted text</b>';
          var text = 'Bold pasted text';
          var fakeEvent = {
            type: 'paste',
            preventDefault: function() {},
            stopPropagation: function() {},
            clipboardData: {
              getData: function(type) {
                if (type === 'text/html') return html;
                if (type === 'text/plain') return text;
                return '';
              }
            }
          };
          if (typeof view.pasteHTML === 'function') {
            view.pasteHTML(html, fakeEvent);
          } else if (window.editor.commands && window.editor.commands.insertContent) {
            window.editor.commands.insertContent(html);
          }
        })()`,
      );

      await waitForStable(WAIT_LONG_MS);
      await milestone('after-paste', 'Bold text pasted on line 2 — formatting should be preserved.');
    });
  },
});
