import { test, expect } from '../../fixtures/superdoc.js';
import type { Page } from '@playwright/test';

test.use({ config: { toolbar: 'none' } });

/** Read colwidth arrays from every cell in the first table found in the document. */
async function getCellColwidths(page: Page): Promise<(number[] | null)[]> {
  return page.evaluate(() => {
    const doc = (window as any).editor.state.doc;
    const widths: (number[] | null)[] = [];
    let inTable = false;

    doc.descendants((node: any) => {
      if (node.type.name === 'table') {
        inTable = true;
        return true; // descend into this table
      }
      if (inTable && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) {
        widths.push(node.attrs.colwidth ?? null);
      }
    });

    return widths;
  });
}

test.describe('insertTable column widths', () => {
  test('auto-calculates equal column widths from page dimensions', async ({ superdoc }) => {
    await superdoc.executeCommand('insertTable', { rows: 3, cols: 3 });
    await superdoc.waitForStable();

    await superdoc.assertTableExists(3, 3);

    const colwidths = await getCellColwidths(superdoc.page);

    // Every cell should have a colwidth set (not null)
    for (const cw of colwidths) {
      expect(cw).not.toBeNull();
      expect(cw).toHaveLength(1);
    }

    // All columns should have the same width (equal division of page width)
    const uniqueWidths = new Set(colwidths.map((cw) => cw![0]));
    expect(uniqueWidths.size).toBe(1);

    // The auto-calculated width should be a reasonable page-derived value (not the 100px default)
    const autoWidth = colwidths[0]![0];
    expect(autoWidth).toBeGreaterThan(100);
  });

  test('uses explicit columnWidths when provided', async ({ superdoc }) => {
    const explicitWidths = [200, 100, 200];

    await superdoc.executeCommand('insertTable', {
      rows: 2,
      cols: 3,
      columnWidths: explicitWidths,
    });
    await superdoc.waitForStable();

    await superdoc.assertTableExists(2, 3);

    const colwidths = await getCellColwidths(superdoc.page);

    // 2 rows x 3 cols = 6 cells
    expect(colwidths).toHaveLength(6);

    // Each cell's colwidth should match the explicit width for its column
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const cellIndex = row * 3 + col;
        expect(colwidths[cellIndex]).toEqual([explicitWidths[col]]);
      }
    }
  });

  test('auto widths differ from explicit widths', async ({ superdoc }) => {
    // Insert table with auto widths
    await superdoc.executeCommand('insertTable', { rows: 2, cols: 3 });
    await superdoc.waitForStable();

    const autoColwidths = await getCellColwidths(superdoc.page);
    const autoWidth = autoColwidths[0]![0];

    // Clear the editor and insert with explicit widths
    await superdoc.selectAll();
    await superdoc.press('Backspace');
    await superdoc.waitForStable();

    await superdoc.executeCommand('insertTable', {
      rows: 2,
      cols: 3,
      columnWidths: [200, 100, 200],
    });
    await superdoc.waitForStable();

    const explicitColwidths = await getCellColwidths(superdoc.page);

    // Auto-calculated widths should all be equal
    expect(autoColwidths[0]![0]).toBe(autoColwidths[1]![0]);
    expect(autoColwidths[1]![0]).toBe(autoColwidths[2]![0]);

    // Explicit widths should not all be equal
    expect(explicitColwidths[0]![0]).not.toBe(explicitColwidths[1]![0]);

    // The auto width should differ from any of the explicit widths
    expect(autoWidth).not.toBe(200);
    expect(autoWidth).not.toBe(100);
  });
});
