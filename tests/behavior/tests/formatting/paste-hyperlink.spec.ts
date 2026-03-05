import { test, type SuperDocFixture } from '../../fixtures/superdoc.js';

async function pasteClipboard(
  superdoc: SuperDocFixture,
  { text, html = '' }: { text: string; html?: string },
): Promise<void> {
  await superdoc.page.evaluate(
    ({ plain, rich }) => {
      const editor = (window as any).editor;
      const event = new Event('paste', { bubbles: true, cancelable: true });

      (event as any).clipboardData = {
        getData(type: string) {
          if (type === 'text/plain') return plain;
          if (type === 'text/html') return rich;
          return '';
        },
      };

      editor.view.dom.dispatchEvent(event);
    },
    { plain: text, rich: html },
  );

  await superdoc.waitForStable();
}

test('pasting a plain URL creates a hyperlink mark (IT-643)', async ({ superdoc }) => {
  await superdoc.type('Link: ');
  await superdoc.waitForStable();

  await pasteClipboard(superdoc, { text: 'https://example.com' });

  await superdoc.assertTextContains('Link: https://example.com');
  await superdoc.assertTextHasMarks('https://example.com', ['link']);
  await superdoc.assertTextMarkAttrs('https://example.com', 'link', { href: 'https://example.com' });
  await superdoc.assertLinkExists('https://example.com');
});

test('pasting a plain URL over selected text applies hyperlink to the selection (IT-643)', async ({ superdoc }) => {
  await superdoc.type('Visit website');
  await superdoc.waitForStable();

  const websitePos = await superdoc.findTextPos('website');
  await superdoc.setTextSelection(websitePos, websitePos + 'website'.length);
  await superdoc.waitForStable();

  await pasteClipboard(superdoc, { text: 'https://example.com' });

  await superdoc.assertTextContains('Visit website');
  await superdoc.assertTextNotContains('https://example.com');
  await superdoc.assertTextHasMarks('website', ['link']);
  await superdoc.assertTextMarkAttrs('website', 'link', { href: 'https://example.com' });
  await superdoc.assertTextLacksMarks('Visit', ['link']);
});
