import { describe, it, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';

/**
 * A legacy HYPERLINK field code (w:fldChar / w:instrText) can span a paragraph
 * boundary: the field begins (begin -> instrText -> separate) in the first
 * paragraph of a table cell and closes (end) in the second paragraph. A
 * <w:hyperlink> is inline and cannot wrap a <w:p>, so the importer must emit one
 * <w:hyperlink> per paragraph rather than hoisting a single hyperlink that wraps
 * both paragraphs.
 */
describe('HYPERLINK field code spanning a paragraph boundary inside a table cell', () => {
  it('imports without a schema error and keeps the link on both paragraphs', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(
      'hyperlink-fldchar-across-paragraphs-in-cell.docx',
    );
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    const json = editor.getJSON();
    const table = json.content.find((node) => node.type === 'table');
    expect(table).toBeDefined();

    const cell = table.content[0].content[0];
    expect(cell.type).toBe('tableCell');

    // The cross-paragraph field must survive as two separate paragraphs; the cell
    // must never collapse to zero block children.
    const paragraphs = cell.content.filter((node) => node.type === 'paragraph');
    expect(paragraphs).toHaveLength(2);

    // Every visible run from the field should carry the link mark pointing at the
    // field's target URL.
    const linkedText = [];
    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      const linkMark = node.marks.find((mark) => mark.type.name === 'link');
      if (linkMark) {
        linkedText.push(node.text);
        expect(linkMark.attrs.href).toBe('https://example.com/data-in-transit');
      }
    });

    expect(linkedText.join('')).toContain('CSP - 1');
    expect(linkedText.join('')).toContain('Data in transit protection');

    editor.destroy();
  });
});
