import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type SuperDocFixture } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC = path.resolve(__dirname, '../formatting/fixtures/rtl-paragraph-alignment.docx');

test.use({ config: { toolbar: 'full', showSelection: true } });

async function clickAlignment(superdoc: SuperDocFixture, ariaLabel: string): Promise<void> {
  await superdoc.page.locator('[data-item="btn-textAlign"]').click();
  await superdoc.waitForStable();
  await superdoc.page.locator(`[data-item="btn-textAlign-option"][aria-label="${ariaLabel}"]`).click();
  await superdoc.waitForStable();
}

// SD-3094: changing alignment across a selection that spans multiple RTL
// paragraphs must apply the mirror per-paragraph (each paragraph is its
// own bidi context). Selecting all three Hebrew paragraphs in the
// fixture and clicking Align Left should write w:jc="right" on all of
// them.

test('Align Left across a 3-paragraph RTL selection mirrors each paragraph', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC);
  await superdoc.waitForStable();

  // Use the doc-api to select all text (covers all three paragraphs).
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const docSize = editor.state.doc.content.size;
    editor.commands.setTextSelection({ from: 1, to: docSize - 1 });
  });
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align left');
  await superdoc.waitForStable();

  // All three RTL paragraphs should now store w:jc="right".
  await superdoc.assertTextAlignment('jc=left', 'right');
  await superdoc.assertTextAlignment('jc=right', 'right');
  await superdoc.assertTextAlignment('jc=center', 'right');
});
