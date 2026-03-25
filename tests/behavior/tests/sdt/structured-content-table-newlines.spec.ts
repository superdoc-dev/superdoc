import { test, expect } from '../../fixtures/superdoc.js';
import { insertBlockSdtWithHtml } from '../../helpers/sdt.js';

const SDT_ID = '100001';

/**
 * Insert a structured content block containing a 1×2 table,
 * then append rows using `appendRowsToStructuredContentTable`.
 */
async function insertSdtTableAndAppendRows(page: import('@playwright/test').Page, rows: Array<string[] | string>) {
  // Insert a structured content block with a simple 1-row, 2-column table
  await insertBlockSdtWithHtml(
    page,
    { id: SDT_ID, alias: 'Test Table' },
    '<table><tr><td>header1</td><td>header2</td></tr></table>',
  );

  // Append rows via the command under test
  await page.evaluate(
    ({ id, rows }) => {
      (window as any).editor.commands.appendRowsToStructuredContentTable({
        id,
        rows,
        copyRowStyle: true,
      });
    },
    { id: SDT_ID, rows },
  );
}

test.describe('appendRowsToStructuredContentTable with newlines', () => {
  test('cell value with newline characters preserves all text', async ({ superdoc }) => {
    await superdoc.type('before');
    await superdoc.newLine();
    await superdoc.waitForStable();

    await insertSdtTableAndAppendRows(superdoc.page, [
      ['cell1\ncell2\ncell3', 'cell2'],
      ['cell4', 'cell5'],
    ]);
    await superdoc.waitForStable();

    // All text segments from the newline-containing cell must be present
    await superdoc.assertTextContains('cell1');
    await superdoc.assertTextContains('cell2');
    await superdoc.assertTextContains('cell3');

    // The other cells should also be present
    await superdoc.assertTextContains('cell4');
    await superdoc.assertTextContains('cell5');
  });

  test('cell value with newline produces multiple paragraphs in the cell', async ({ superdoc }) => {
    await superdoc.type('before');
    await superdoc.newLine();
    await superdoc.waitForStable();

    await insertSdtTableAndAppendRows(superdoc.page, [['line1\nline2\nline3', 'single']]);
    await superdoc.waitForStable();

    // Inspect PM state: the first cell of the appended row should contain
    // three paragraph nodes (one per line), not a single text node with \n
    const cellParagraphs = await superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      const doc = editor.state.doc;
      const cells: Array<{ textContent: string; paragraphCount: number }> = [];

      doc.descendants((node: any) => {
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          let paragraphCount = 0;
          node.content.forEach((child: any) => {
            if (child.type.name === 'paragraph') paragraphCount++;
          });
          cells.push({ textContent: node.textContent, paragraphCount });
        }
        return true;
      });

      return cells;
    });

    // Find the cell that should contain line1, line2, line3
    const multiLineCell = cellParagraphs.find((c) => c.textContent.includes('line1'));
    expect(multiLineCell).toBeDefined();
    expect(multiLineCell!.textContent).toContain('line1');
    expect(multiLineCell!.textContent).toContain('line2');
    expect(multiLineCell!.textContent).toContain('line3');
    // Each line should be its own paragraph
    expect(multiLineCell!.paragraphCount).toBe(3);
  });
});
