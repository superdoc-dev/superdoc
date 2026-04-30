import { describe, it, expect } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

const findFirstTable = (doc) => {
  let tableNode = null;
  doc.descendants((node) => {
    if (!tableNode && node.type?.name === 'table') {
      tableNode = node;
      return false;
    }
    return true;
  });
  return tableNode;
};

describe('SD-1797: autofit tables with colspan should not drop columns', () => {
  it('preserves all grid columns when rows use colspan patterns', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('table-autofit-colspan.docx');
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    try {
      const table = findFirstTable(editor.state.doc);
      expect(table).toBeDefined();

      // The table has a 4-column grid
      const grid = Array.isArray(table.attrs?.grid) ? table.attrs.grid : [];
      expect(grid.length).toBe(4);

      // Verify no row has more than 3 physical cells
      // (this is the condition that triggers the bug — physical cells < grid columns)
      let maxPhysicalCells = 0;
      const rowPatterns = [];
      table.forEach((row) => {
        let cellCount = 0;
        row.forEach(() => {
          cellCount++;
        });
        maxPhysicalCells = Math.max(maxPhysicalCells, cellCount);
        rowPatterns.push(
          row.content.content.map((cell) => ({
            colspan: cell.attrs?.colspan ?? 1,
            colwidthLength: Array.isArray(cell.attrs?.colwidth) ? cell.attrs.colwidth.length : 0,
          })),
        );
      });
      expect(maxPhysicalCells).toBeLessThan(grid.length);
      expect(rowPatterns).toContainEqual([
        { colspan: 3, colwidthLength: 3 },
        { colspan: 1, colwidthLength: 1 },
      ]);
      expect(rowPatterns).toContainEqual([
        { colspan: 1, colwidthLength: 1 },
        { colspan: 2, colwidthLength: 2 },
        { colspan: 1, colwidthLength: 1 },
      ]);
      expect(rowPatterns).toContainEqual([{ colspan: 4, colwidthLength: 4 }]);

      // The key assertion: all cells should have valid colwidth arrays with positive values
      // If the bug is present, cells in the last grid column would be missing or have zero width
      let allColwidthsValid = true;
      table.forEach((row) => {
        row.forEach((cell) => {
          const colwidth = cell.attrs?.colwidth;
          const colspan = cell.attrs?.colspan ?? 1;
          if (!colwidth || !Array.isArray(colwidth) || colwidth.length !== colspan || colwidth.some((w) => w <= 0)) {
            allColwidthsValid = false;
          }
        });
      });
      expect(allColwidthsValid).toBe(true);
    } finally {
      editor.destroy();
    }
  });
});
