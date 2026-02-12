import { test } from '../../fixtures/superdoc.js';

test('@behavior insert hyperlink on selected text', async ({ superdoc }) => {
  await superdoc.type('Visit our website for more information');
  await superdoc.screenshot('hyperlink-text-typed');

  // Select "website" by finding its position
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const doc = editor.state.doc;
    const text = doc.textContent;
    const start = text.indexOf('website');
    // +1 because ProseMirror positions are 1-indexed from doc start
    editor.commands.setTextSelection({ from: start + 1, to: start + 1 + 'website'.length });
  });
  await superdoc.screenshot('hyperlink-text-selected');

  // Apply hyperlink
  await superdoc.executeCommand('setLink', { href: 'https://example.com' });
  await superdoc.press('ArrowRight');
  await superdoc.screenshot('hyperlink-applied');
});
