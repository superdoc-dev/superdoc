import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'path';
import { Editor } from '@core/Editor.js';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { zipFolderToBuffer } from '@tests/helpers/zipFolderToBuffer.js';
import { twipsToPixels } from '@core/super-converter/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

describe('table indent grid widths', () => {
  it('uses tblGrid widths when tableIndent shrinks the grid', async () => {
    const buffer = await zipFolderToBuffer(join(__dirname, '../data/sd_1494_table_left_indent'));
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    try {
      const table = findFirstTable(editor.state.doc);
      expect(table).toBeDefined();

      const grid = Array.isArray(table.attrs?.grid) ? table.attrs.grid : [];
      const expectedWidth = grid.reduce((sum, col) => sum + twipsToPixels(col.col), 0);

      const firstRow = table.firstChild;
      expect(firstRow).toBeDefined();

      let actualWidth = 0;
      firstRow.forEach((cell) => {
        const colwidth = cell.attrs?.colwidth;
        if (Array.isArray(colwidth)) {
          actualWidth += colwidth.reduce((sum, width) => sum + (typeof width === 'number' ? width : 0), 0);
        } else if (typeof colwidth === 'number') {
          actualWidth += colwidth;
        }
      });

      expect(actualWidth).toBeGreaterThan(0);
      expect(Math.abs(actualWidth - expectedWidth)).toBeLessThanOrEqual(1);
    } finally {
      editor.destroy();
    }
  });
});
