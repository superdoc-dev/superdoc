import { describe, it, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';

describe('contract_acc import', () => {
  it('preserves placeholder columns without creating visible cells', async () => {
    // The source document uses hidden placeholder cells to reserve grid space for columns that only exist in DOCX metadata.
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('contract-acc.docx');
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });
    const json = editor.getJSON();
    const table = json.content.find((node) => node.type === 'table');
    expect(table).toBeDefined();
    // This DOCX intentionally has no tblStyle. Import should preserve that state
    // and must not inject fallback table borders/cell margins.
    expect(table.attrs.tableStyleId).toBeNull();
    expect(table.attrs.needsTableStyleNormalization).not.toBe(true);
    expect(Object.keys(table.attrs.borders ?? {})).toHaveLength(0);
    expect(table.attrs.tableProperties?.cellMargins?.marginLeft?.value).toBe(10);
    expect(table.attrs.tableProperties?.cellMargins?.marginRight?.value).toBe(10);

    // Collect the placeholder markers for each cell so we can assert that only metadata-only columns are tracked.
    const placeholderReasons = table.content.map((row) =>
      row.content.map((cell) => cell.attrs?.__placeholder).filter(Boolean),
    );
    expect(placeholderReasons).toEqual([
      ['gridAfter'],
      ['gridAfter'],
      ['gridAfter'],
      ['gridAfter'],
      ['gridAfter'],
      ['gridBefore'],
    ]);

    table.content.forEach((row) => {
      row.content.forEach((cell) => {
        if (!cell.attrs?.__placeholder) return;
        // Placeholder cells should not have inline borders — borders are null (schema default).
        expect(cell.attrs.borders).toBeNull();
      });
    });
    editor.destroy();
  });
});
