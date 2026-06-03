import { test, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

async function clickAlignment(superdoc: SuperDocFixture, ariaLabel: string): Promise<void> {
  // Open alignment dropdown
  await superdoc.page.locator('[data-item="btn-textAlign"]').click();
  await superdoc.waitForStable();

  // Click the alignment option
  await superdoc.page.locator(`[data-item="btn-textAlign-option"][aria-label="${ariaLabel}"]`).click();
  await superdoc.waitForStable();
}

test('align text center', async ({ superdoc }) => {
  await superdoc.type('Center this text');
  await superdoc.waitForStable();
  await superdoc.snapshot('typed text');

  const pos = await superdoc.findTextPos('Center this text');
  await superdoc.setTextSelection(pos);
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align center');
  await superdoc.snapshot('after align center');

  await superdoc.assertTextAlignment('Center this text', 'center');
});

test('align text right', async ({ superdoc }) => {
  await superdoc.type('Right aligned text');
  await superdoc.waitForStable();
  await superdoc.snapshot('typed text');

  const pos = await superdoc.findTextPos('Right aligned text');
  await superdoc.setTextSelection(pos);
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align right');
  await superdoc.snapshot('after align right');

  await superdoc.assertTextAlignment('Right aligned text', 'right');
});

test('justify text', async ({ superdoc }) => {
  await superdoc.type(
    'Justified text needs to be long enough to wrap across multiple lines so that the spacing between words is visually stretched to fill the full width of each line',
  );
  await superdoc.waitForStable();
  await superdoc.snapshot('typed long text');

  const pos = await superdoc.findTextPos('Justified text needs');
  await superdoc.setTextSelection(pos);
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Justify');
  await superdoc.snapshot('after justify');

  await superdoc.assertTextAlignment('Justified text needs', 'justify');
});

test('cycle through alignments', async ({ superdoc }) => {
  await superdoc.type('Cycling alignment');
  await superdoc.waitForStable();
  await superdoc.snapshot('typed text');

  const pos = await superdoc.findTextPos('Cycling alignment');
  await superdoc.setTextSelection(pos);
  await superdoc.waitForStable();

  // Center
  await clickAlignment(superdoc, 'Align center');
  await superdoc.snapshot('centered');
  await superdoc.assertTextAlignment('Cycling alignment', 'center');

  // Right
  await clickAlignment(superdoc, 'Align right');
  await superdoc.snapshot('right aligned');
  await superdoc.assertTextAlignment('Cycling alignment', 'right');

  // Back to left
  await clickAlignment(superdoc, 'Align left');
  await superdoc.snapshot('back to left');
  await superdoc.assertTextAlignment('Cycling alignment', 'left');
});

test('alignment inside a table cell', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();

  await superdoc.type('Cell text');
  await superdoc.waitForStable();
  await superdoc.snapshot('table with text');

  const pos = await superdoc.findTextPos('Cell text');
  await superdoc.setTextSelection(pos);
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align center');
  await superdoc.snapshot('cell text centered');

  await superdoc.assertTextAlignment('Cell text', 'center');
});
