// @ts-check
/**
 * Verify that the round-2 setCellText NO_OP fix also catches user-applied
 * color / font-family / font-size, not just bold-shaped marks.
 *
 * Hypothesis: `paragraphHasUserAppliedMarks` excludes the entire `textStyle`
 * mark via `DEFAULT_INHERITED_MARK_NAMES`. But in SuperDoc, user-applied
 * color (`Color.setColor`), font family (`FontFamily.setFontFamily`), and
 * font size (`FontSize.setFontSize`) all add their attrs to the `textStyle`
 * mark itself (via `addGlobalAttributes` with `types: ['textStyle']`).
 * So a cell whose text already says 'hi' in red, calling `setCellText('hi')`,
 * should rewrite (clearing the red) but currently NO_OPs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

let docxData;

beforeAll(async () => {
  docxData = await loadTestDataForEditorTests('blank-doc.docx');
});

describe('tables.setCellText - round 2 NO_OP edge case (textStyle attrs)', () => {
  it('rewrites a cell whose text carries a user-applied color', () => {
    const { editor } = initTestEditor({
      content: docxData.docx,
      media: docxData.media,
      mediaFiles: docxData.mediaFiles,
      fonts: docxData.fonts,
      element: null,
    });

    // Insert a 1x1 table at the document end so we have something to set.
    editor.commands.insertTableAt({ pos: editor.state.doc.content.size, rows: 1, columns: 1 });

    // Find the inserted table and its single cell.
    let tableId = null;
    let cellPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (tableId && cellPos !== -1) return false;
      if (node.type.name === 'table' && !tableId) {
        tableId = node.attrs?.sdBlockId;
        return true;
      }
      if (node.type.name === 'tableCell' && tableId && cellPos === -1) {
        cellPos = pos;
        return false;
      }
      return true;
    });
    expect(tableId, 'inserted table should be findable').toBeTruthy();
    expect(cellPos).toBeGreaterThan(-1);

    // Plant 'hi' via setCellText.
    const first = editor.doc.tables.setCellText({
      target: { kind: 'block', nodeType: 'tableCell', nodeId: editor.state.doc.nodeAt(cellPos)?.attrs?.sdBlockId },
      text: 'hi',
    });
    expect(first?.success, `setCellText 'hi' should succeed: ${JSON.stringify(first)}`).toBe(true);

    // Color it red. setColor uses Color extension which writes attrs onto the
    // textStyle mark (Color.addOptions: types: ['textStyle']).
    let textPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (textPos !== -1) return false;
      if (node.isText && node.text === 'hi') {
        textPos = pos;
        return false;
      }
      return true;
    });
    expect(textPos).toBeGreaterThan(-1);
    editor.commands.setTextSelection({ from: textPos, to: textPos + 'hi'.length });
    editor.commands.setColor('#ff0000');

    // Sanity: verify the text now actually carries a colored textStyle.
    let coloredMarkAttrs = null;
    editor.state.doc.descendants((node) => {
      if (coloredMarkAttrs) return false;
      if (node.isText && node.text === 'hi') {
        const ts = node.marks.find((m) => m.type.name === 'textStyle');
        if (ts) coloredMarkAttrs = ts.attrs;
        return false;
      }
      return true;
    });
    expect(coloredMarkAttrs?.color, 'red color must actually be applied').toBe('#ff0000');

    // Now call setCellText again with the same text. It MUST rewrite (and
    // clear the red), not NO_OP.
    const cellId = (() => {
      let id = null;
      editor.state.doc.descendants((node) => {
        if (id) return false;
        if (node.type.name === 'tableCell') {
          id = node.attrs?.sdBlockId;
          return false;
        }
        return true;
      });
      return id;
    })();

    const second = editor.doc.tables.setCellText({
      target: { kind: 'block', nodeType: 'tableCell', nodeId: cellId },
      text: 'hi',
    });

    // eslint-disable-next-line no-console
    console.log('[setCellText textStyle-attrs probe]', { second });

    expect(second?.success, `setCellText should succeed (not NO_OP); got: ${JSON.stringify(second)}`).toBe(true);

    // Verify the color is actually gone.
    let finalMarkAttrs = null;
    editor.state.doc.descendants((node) => {
      if (finalMarkAttrs !== null) return false;
      if (node.isText && node.text === 'hi') {
        const ts = node.marks.find((m) => m.type.name === 'textStyle');
        finalMarkAttrs = ts ? ts.attrs : {};
        return false;
      }
      return true;
    });
    expect(finalMarkAttrs?.color ?? null, 'color should be cleared after rewrite').toBeNull();
  });
});
