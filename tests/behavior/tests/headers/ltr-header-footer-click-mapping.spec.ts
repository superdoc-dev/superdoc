import { expect, test } from '../../fixtures/superdoc.js';
import { TWO_SECTION_FOOTER_DOC_PATH } from '../../helpers/story-fixtures.js';
import { activateFooter, clickTextBoundary, expectActiveStoryText } from '../../helpers/story-surfaces.js';

test.use({
  config: {
    documentMode: 'editing',
    showCaret: true,
    showSelection: true,
  },
});

test('LTR footer click-to-caret stays on active page footer', async ({ superdoc }) => {
  await superdoc.loadDocument(TWO_SECTION_FOOTER_DOC_PATH);
  await superdoc.waitForStable();

  await superdoc.assertPageCount(2);

  const page1Footer = superdoc.page.locator('.superdoc-page-footer').first();
  await expect(page1Footer).toContainText('Main footer');

  const page2Footer = await activateFooter(superdoc, 1);
  await expectActiveStoryText(superdoc.page, 'Appendix footer');

  await clickTextBoundary(superdoc.page, page2Footer, 'Appendix footer', 0);
  await superdoc.page.keyboard.type('X');
  await superdoc.waitForStable();

  await expectActiveStoryText(superdoc.page, 'XAppendix footer');
  await expect(page2Footer).toContainText('XAppendix footer');
  await expect(page1Footer).toContainText('Main footer');
  await expect(page1Footer).not.toContainText('XAppendix');
});
