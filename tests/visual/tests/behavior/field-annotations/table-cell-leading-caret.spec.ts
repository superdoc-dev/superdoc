import { test } from '../../fixtures/superdoc.js';

test.use({ config: { hideCaret: false } });

test('@behavior cursor placement before field annotation at start of table cell', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();
  await superdoc.screenshot('table-cell-caret-table');

  // Insert field annotation at cursor (start of first cell)
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    editor.commands.addFieldAnnotationAtSelection({
      type: 'text',
      displayLabel: 'Enter value',
      fieldId: 'field-in-cell',
      fieldColor: '#6366f1',
      highlighted: true,
    });
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('table-cell-caret-annotation');

  // Navigate to start of cell
  await superdoc.press('End');
  await superdoc.shortcut('ArrowLeft');
  await superdoc.waitForStable();
  await superdoc.screenshot('table-cell-caret-at-start');

  // Type before annotation
  await superdoc.type('Prefix: ');
  await superdoc.waitForStable();
  await superdoc.screenshot('table-cell-caret-typed-before');
});
