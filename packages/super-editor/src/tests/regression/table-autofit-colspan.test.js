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
      table.forEach((row) => {
        let cellCount = 0;
        row.forEach(() => {
          cellCount++;
        });
        maxPhysicalCells = Math.max(maxPhysicalCells, cellCount);
      });
      expect(maxPhysicalCells).toBeLessThan(grid.length);

      // The key assertion: all cells should have valid colwidth arrays with positive values
      // If the bug is present, cells in the last grid column would be missing or have zero width
      let allColwidthsValid = true;
      table.forEach((row) => {
        row.forEach((cell) => {
          const colwidth = cell.attrs?.colwidth;
          if (!colwidth || !Array.isArray(colwidth) || colwidth.some((w) => w <= 0)) {
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
