/**
 * Integration: HTML paste → ProseMirror JSON for `tableCell` (`<td>`) and `tableHeader` (`<th>`).
 *
 * ParseDOM fills `attrs.borders`; the table extension then migrates them to
 * `attrs.tableCellProperties.borders` (OOXML, eighths of a point) and sets `attrs.borders` to null.
 * Border assertions read that migrated shape.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { handleHtmlPaste } from '@core/InputRule.js';
import { initTestEditor, loadTestDataForEditorTests } from '../../tests/helpers/helpers.js';

let docData;
let editor;

/** Same as legacyBorderMigration: px → OOXML eighths of a point. */
const pxToEighthPt = (px) => Math.round((px / (96 / 72)) * 8);

beforeAll(async () => {
  docData = await loadTestDataForEditorTests('blank-doc.docx');
});

afterEach(() => {
  editor?.destroy();
  editor = null;
});

/**
 * Fresh editor from blank doc, paste HTML, return `tableCell` / `tableHeader` nodes (depth-first)
 * from the first `table` in the document.
 */
function pasteTableCells(html) {
  ({ editor } = initTestEditor({
    content: docData.docx,
    media: docData.media,
    mediaFiles: docData.mediaFiles,
    fonts: docData.fonts,
    mode: 'docx',
  }));

  expect(handleHtmlPaste(html, editor)).toBe(true);

  const table = editor.getJSON().content?.find((n) => n?.type === 'table');
  expect(table).toBeTruthy();

  const cells = [];
  const collectTableCellNodesInOrder = (node) => {
    if (node?.type === 'tableCell' || node?.type === 'tableHeader') {
      cells.push(node);
    }
    for (const child of node?.content ?? []) {
      collectTableCellNodesInOrder(child);
    }
  };
  collectTableCellNodesInOrder(table);

  return cells;
}

describe('tableCell & tableHeader HTML paste integration', () => {
  it('parses td border shorthand: solid, dashed, dotted, widths and colors', () => {
    const cells = pasteTableCells(`
      <table><tbody>
        <tr>
          <td style="border: 2px solid rgb(255, 0, 0)">A</td>
          <td style="border: 1px dashed rgb(0, 0, 255)">B</td>
        </tr>
        <tr>
          <td style="border: 3px dotted #00aa00">C</td>
          <td>D</td>
        </tr>
      </tbody></table>
    `);

    expect(cells).toHaveLength(4);

    const b0 = cells[0].attrs?.tableCellProperties?.borders;
    expect(b0?.top).toMatchObject({ val: 'single', color: '#ff0000' });
    expect(b0?.top?.size).toBe(pxToEighthPt(2));
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(b0?.[side]).toMatchObject({ val: 'single', color: '#ff0000' });
    }

    const b1 = cells[1].attrs?.tableCellProperties?.borders;
    expect(b1?.top).toMatchObject({ val: 'dashed', color: '#0000ff' });
    expect(b1?.top?.size).toBe(pxToEighthPt(1));

    const b2 = cells[2].attrs?.tableCellProperties?.borders;
    expect(b2?.top).toMatchObject({ val: 'dotted', color: '#00aa00' });
    expect(b2?.top?.size).toBe(pxToEighthPt(3));

    expect(cells[3].attrs?.tableCellProperties?.borders).toBeUndefined();
    expect(cells[3].attrs?.borders).toBeNull();
  });

  it('parses per-side borders when sides differ', () => {
    const cells = pasteTableCells(`
      <table><tbody><tr>
        <td style="border: 1px solid rgb(0, 0, 0); border-top: 2px dashed rgb(255, 0, 0); border-right: 1px dotted rgb(0, 0, 255)">X</td>
      </tr></tbody></table>
    `);

    expect(cells).toHaveLength(1);
    const b = cells[0].attrs?.tableCellProperties?.borders;
    expect(b?.top).toMatchObject({ val: 'dashed', color: '#ff0000' });
    expect(b?.top?.size).toBe(pxToEighthPt(2));
    expect(b?.right).toMatchObject({ val: 'dotted', color: '#0000ff' });
    expect(b?.bottom).toMatchObject({ val: 'single', color: 'auto' });
    expect(b?.left).toMatchObject({ val: 'single', color: 'auto' });
  });

  it('parses different background colors per row and cell', () => {
    const cells = pasteTableCells(`
      <table><tbody>
        <tr>
          <td style="background-color: rgb(255, 255, 0)">R0C0</td>
          <td style="background-color: rgb(0, 255, 255)">R0C1</td>
        </tr>
        <tr>
          <td style="background-color: rgb(128, 0, 128)">R1C0</td>
          <td>R1C1 plain</td>
        </tr>
      </tbody></table>
    `);

    expect(cells).toHaveLength(4);
    expect(cells[0].attrs?.background).toEqual({ color: 'ffff00' });
    expect(cells[1].attrs?.background).toEqual({ color: '00ffff' });
    expect(cells[2].attrs?.background).toEqual({ color: '800080' });
    expect(cells[3].attrs?.background == null).toBe(true);
  });

  it('parses vertical-align from td style', () => {
    const cells = pasteTableCells(`
      <table><tbody><tr>
        <td style="vertical-align: middle">M</td>
        <td style="vertical-align: bottom">B</td>
        <td>T</td>
      </tr></tbody></table>
    `);

    expect(cells).toHaveLength(3);
    expect(cells[0].attrs?.verticalAlign).toBe('center');
    expect(cells[1].attrs?.verticalAlign).toBe('bottom');
    expect(cells[2].attrs?.verticalAlign == null).toBe(true);
  });

  it('parses padding into cellMargins on pasted cells', () => {
    const cells = pasteTableCells(`
      <table><tbody><tr>
        <td style="padding: 5pt">P</td>
      </tr></tbody></table>
    `);

    expect(cells[0].attrs?.cellMargins).toEqual({
      top: 7,
      right: 7,
      bottom: 7,
      left: 7,
    });
  });

  it('parses Google Docs–style header row: th keeps padding, background, borders, vertical-align', () => {
    const cells = pasteTableCells(`
      <table>
        <thead>
          <tr>
            <th style="padding: 5pt; background-color: rgb(200, 220, 255); vertical-align: bottom; border: 2px dashed rgb(0, 0, 200)">H1</th>
            <th style="padding: 8px">H2</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>A</td><td>B</td></tr>
        </tbody>
      </table>
    `);

    expect(cells).toHaveLength(4);
    expect(cells[0].type).toBe('tableHeader');
    expect(cells[1].type).toBe('tableHeader');

    expect(cells[0].attrs?.cellMargins).toEqual({
      top: 7,
      right: 7,
      bottom: 7,
      left: 7,
    });
    expect(cells[0].attrs?.background).toEqual({ color: 'c8dcff' });
    expect(cells[0].attrs?.verticalAlign).toBe('bottom');

    const hb = cells[0].attrs?.tableCellProperties?.borders;
    expect(hb?.top).toMatchObject({ val: 'dashed', color: '#0000c8' });
    expect(hb?.top?.size).toBe(pxToEighthPt(2));

    expect(cells[1].attrs?.cellMargins).toEqual({
      top: 8,
      right: 8,
      bottom: 8,
      left: 8,
    });

    expect(cells[2].type).toBe('tableCell');
    expect(cells[3].type).toBe('tableCell');
  });

  describe('mixed tableHeader and tableCell layouts', () => {
    it('parses tbody rows that start with th (row headers) then td', () => {
      const cells = pasteTableCells(`
        <table><tbody>
          <tr>
            <th scope="row" style="background-color: rgb(230, 230, 230)">Label1</th>
            <td style="padding: 6px">A1</td>
            <td>A2</td>
          </tr>
          <tr>
            <th scope="row">Label2</th>
            <td style="border: 1px solid rgb(0, 128, 0)">B1</td>
            <td>B2</td>
          </tr>
        </tbody></table>
      `);

      expect(cells).toHaveLength(6);
      expect(cells.map((c) => c.type)).toEqual([
        'tableHeader',
        'tableCell',
        'tableCell',
        'tableHeader',
        'tableCell',
        'tableCell',
      ]);

      expect(cells[0].attrs?.background).toEqual({ color: 'e6e6e6' });
      expect(cells[1].attrs?.cellMargins).toEqual({
        top: 6,
        right: 6,
        bottom: 6,
        left: 6,
      });
      expect(cells[2].attrs?.cellMargins == null).toBe(true);

      expect(cells[3].attrs?.background == null).toBe(true);
      const bB1 = cells[4].attrs?.tableCellProperties?.borders;
      expect(bB1?.top).toMatchObject({ val: 'single', color: '#008000' });
    });

    it('parses a single body row mixing th and td with different inline styles', () => {
      const cells = pasteTableCells(`
        <table><tbody><tr>
          <th style="vertical-align: top; border: 1px solid rgb(200, 0, 0)">H</th>
          <td style="padding: 5pt; background-color: rgb(0, 200, 200)">D1</td>
          <th style="padding: 2px">Mid</th>
          <td>D2</td>
        </tr></tbody></table>
      `);

      expect(cells).toHaveLength(4);
      expect(cells.map((c) => c.type)).toEqual(['tableHeader', 'tableCell', 'tableHeader', 'tableCell']);

      expect(cells[0].attrs?.verticalAlign).toBe('top');
      const hBorder = cells[0].attrs?.tableCellProperties?.borders;
      expect(hBorder?.top).toMatchObject({ val: 'single', color: '#c80000' });

      expect(cells[1].attrs?.cellMargins?.top).toBe(7);
      expect(cells[1].attrs?.background).toEqual({ color: '00c8c8' });

      expect(cells[2].attrs?.cellMargins).toEqual({
        top: 2,
        right: 2,
        bottom: 2,
        left: 2,
      });
      expect(cells[3].attrs?.background == null).toBe(true);
    });

    it('parses two-row thead plus body: each header row th, then body td', () => {
      const cells = pasteTableCells(`
        <table>
          <thead>
            <tr>
              <th style="background-color: rgb(100, 100, 200)">Dept</th>
              <th>Code</th>
            </tr>
            <tr>
              <th colspan="2" style="padding: 3px">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Eng</td><td>E1</td></tr>
            <tr><td>Sales</td><td>S1</td></tr>
          </tbody>
        </table>
      `);

      // Row0: 2 headers; row1: 1 header (colspan 2); body: 2 rows × 2 cells = 7 cells
      expect(cells).toHaveLength(7);
      expect(cells[0].type).toBe('tableHeader');
      expect(cells[1].type).toBe('tableHeader');
      expect(cells[0].attrs?.background).toEqual({ color: '6464c8' });
      expect(cells[1].attrs?.background == null).toBe(true);

      expect(cells[2].type).toBe('tableHeader');
      expect(cells[2].attrs?.colspan).toBe(2);
      expect(cells[2].attrs?.cellMargins?.top).toBe(3);

      expect(cells.slice(3).every((c) => c.type === 'tableCell')).toBe(true);
      expect(cells[3].attrs?.background == null).toBe(true);
    });

    it('parses thead column headers and tbody with styled td next to plain th row header', () => {
      const cells = pasteTableCells(`
        <table>
          <thead>
            <tr>
              <th></th>
              <th style="border-bottom: 2px solid rgb(0, 0, 255)">Jan</th>
              <th>Feb</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Row A</th>
              <td style="background-color: rgb(255, 240, 240)">10</td>
              <td>20</td>
            </tr>
          </tbody>
        </table>
      `);

      expect(cells).toHaveLength(6);
      expect(cells[0].type).toBe('tableHeader');
      expect(cells[1].type).toBe('tableHeader');
      expect(cells[2].type).toBe('tableHeader');

      const janBottom = cells[1].attrs?.tableCellProperties?.borders?.bottom;
      expect(janBottom).toMatchObject({ val: 'single', color: '#0000ff' });
      expect(janBottom?.size).toBe(pxToEighthPt(2));

      expect(cells[3].type).toBe('tableHeader');
      expect(cells[4].type).toBe('tableCell');
      expect(cells[4].attrs?.background).toEqual({ color: 'fff0f0' });
      expect(cells[5].type).toBe('tableCell');
    });
  });
});
