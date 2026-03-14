import { test, expect } from '../../fixtures/superdoc.js';

test('insert hyperlink on selected text via setLink command', async ({ superdoc }) => {
  await superdoc.type('Visit our website for more information');
  await superdoc.waitForStable();

  // Select "website"
  const pos = await superdoc.findTextPos('website');
  await superdoc.setTextSelection(pos, pos + 'website'.length);
  await superdoc.waitForStable();

  // Apply hyperlink
  await superdoc.executeCommand('setLink', { href: 'https://example.com' });
  await superdoc.waitForStable();

  // Link mark should exist on "website"
  await superdoc.assertTextHasMarks('website', ['link']);
  await superdoc.assertTextMarkAttrs('website', 'link', { href: 'https://example.com' });

  // Link should render in the DOM
  await superdoc.assertLinkExists('https://example.com');

  // Surrounding text should not have link mark
  await superdoc.assertTextLacksMarks('Visit our', ['link']);
  await superdoc.assertTextLacksMarks('for more', ['link']);

  await superdoc.snapshot('insert-hyperlink');
});
