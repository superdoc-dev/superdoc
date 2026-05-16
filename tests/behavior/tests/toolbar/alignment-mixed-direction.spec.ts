import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type SuperDocFixture } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC = path.resolve(__dirname, 'fixtures/mixed-ltr-rtl-alignment-repro.docx');

test.use({ config: { toolbar: 'full', showSelection: true } });

async function clickAlignment(superdoc: SuperDocFixture, ariaLabel: string): Promise<void> {
  await superdoc.page.locator('[data-item="btn-textAlign"]').click();
  await superdoc.waitForStable();
  await superdoc.page.locator(`[data-item="btn-textAlign-option"][aria-label="${ariaLabel}"]`).click();
  await superdoc.waitForStable();
}

test('Align Left across mixed LTR/RTL paragraphs maps stored justification per paragraph', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC);
  await superdoc.waitForStable();

  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const docSize = editor.state.doc.content.size;
    editor.commands.setTextSelection({ from: 1, to: docSize - 1 });
  });
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align left');
  await superdoc.waitForStable();

  await superdoc.assertTextAlignment('LTR CENTER paragraph', 'left');
  await superdoc.assertTextAlignment('RTL CENTER paragraph', 'right');
});
