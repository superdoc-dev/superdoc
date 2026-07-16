// Fixture-backed end-to-end round-trip test.
// Loads a real Word-authored docx containing every CT_TcMar / CT_TblCellMar
// sibling pair under test, runs the v3 translators + generateTableCellProperties,
// and asserts the imported and re-exported shapes preserve the source key
// family per side (logical-only stays logical, physical-only stays physical)
// and respect the schema sequence order.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { xml2js } from 'xml-js';

import { translator as tcMarTranslator } from '../../tcMar/index.js';
import { translator as tblCellMarTranslator } from '../../tblCellMar/index.js';
import { generateTableCellProperties } from './translate-table-cell.js';
import { twipsToPixels } from '@converter/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  __dirname,
  '../../../../../../../tests/data/behavior-fixtures/sd-3152-tcmar-key-family.docx',
);

const findTblCellMar = (container) => container?.elements?.find((e) => e.name === 'w:tblCellMar');

describe('w:tcMar / w:tblCellMar fixture round-trip', () => {
  it('preserves logical and physical key families through import + export', async () => {
    const buf = fs.readFileSync(FIXTURE);
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file('word/document.xml').async('string');
    const parsed = xml2js(docXml, { compact: false });

    const doc = parsed.elements.find((e) => e.name === 'w:document');
    const body = doc.elements.find((e) => e.name === 'w:body');
    const tbl = body.elements.find((e) => e.name === 'w:tbl');
    const tblPr = tbl.elements.find((e) => e.name === 'w:tblPr');
    const rows = tbl.elements.filter((e) => e.name === 'w:tr');
    // tblCellMar may sit in tblPr (§17.4.42) or be moved to tblPrEx (§17.4.41)
    // by Word repair on save. Both share CT_TblCellMar and the same translator.
    const tblPrEx = rows[0].elements.find((e) => e.name === 'w:tblPrEx');
    const tblCellMar = findTblCellMar(tblPr) ?? findTblCellMar(tblPrEx);
    expect(tblCellMar).toBeTruthy();

    const cells = rows[0].elements.filter((e) => e.name === 'w:tc');
    const tcMar1 = cells[0].elements.find((e) => e.name === 'w:tcPr').elements.find((e) => e.name === 'w:tcMar');
    const tcMar2 = cells[1].elements.find((e) => e.name === 'w:tcPr').elements.find((e) => e.name === 'w:tcMar');

    // --- IMPORT side ---
    const tblMargins = tblCellMarTranslator.encode({ nodes: [tblCellMar] });
    const cell1Margins = tcMarTranslator.encode({ nodes: [tcMar1] });
    const cell2Margins = tcMarTranslator.encode({ nodes: [tcMar2] });

    // tblCellMar in fixture: logical-only.
    expect(tblMargins).toMatchObject({
      marginTop: { value: 120, type: 'dxa' },
      marginStart: { value: 240, type: 'dxa' },
      marginBottom: { value: 120, type: 'dxa' },
      marginEnd: { value: 180, type: 'dxa' },
    });
    expect(tblMargins.marginLeft).toBeUndefined();
    expect(tblMargins.marginRight).toBeUndefined();

    // Cell 1 tcMar: logical-only.
    expect(cell1Margins).toMatchObject({
      marginTop: { value: 120, type: 'dxa' },
      marginStart: { value: 480, type: 'dxa' },
      marginBottom: { value: 120, type: 'dxa' },
      marginEnd: { value: 60, type: 'dxa' },
    });
    expect(cell1Margins.marginLeft).toBeUndefined();
    expect(cell1Margins.marginRight).toBeUndefined();

    // Cell 2 tcMar: physical-only.
    expect(cell2Margins).toMatchObject({
      marginTop: { value: 120, type: 'dxa' },
      marginLeft: { value: 480, type: 'dxa' },
      marginBottom: { value: 120, type: 'dxa' },
      marginRight: { value: 60, type: 'dxa' },
    });
    expect(cell2Margins.marginStart).toBeUndefined();
    expect(cell2Margins.marginEnd).toBeUndefined();

    // --- EXPORT side ---
    // Mirror what legacy-handle-table-cell-node.js produces for attrs.cellMargins
    // (LTR-default physical, painter mirrors for RTL).
    const cell1Node = {
      attrs: {
        colwidth: [50],
        widthUnit: 'px',
        tableCellProperties: { cellMargins: cell1Margins },
        tableCellPropertiesInlineKeys: ['cellMargins'],
        cellMargins: {
          top: twipsToPixels(120),
          bottom: twipsToPixels(120),
          left: twipsToPixels(480),
          right: twipsToPixels(60),
        },
      },
    };
    const cell2Node = {
      attrs: {
        colwidth: [50],
        widthUnit: 'px',
        tableCellProperties: { cellMargins: cell2Margins },
        tableCellPropertiesInlineKeys: ['cellMargins'],
        cellMargins: {
          top: twipsToPixels(120),
          bottom: twipsToPixels(120),
          left: twipsToPixels(480),
          right: twipsToPixels(60),
        },
      },
    };
    const tcPr1 = generateTableCellProperties(cell1Node);
    const tcPr2 = generateTableCellProperties(cell2Node);
    const marNames = (tcPr) => {
      const mar = tcPr.elements.find((e) => e.name === 'w:tcMar');
      return mar.elements.map((e) => e.name);
    };
    // Logical-only export stays logical-only, in CT_TcMar sequence.
    expect(marNames(tcPr1)).toEqual(['w:top', 'w:start', 'w:bottom', 'w:end']);
    // Physical-only export stays physical-only, in CT_TcMar sequence.
    expect(marNames(tcPr2)).toEqual(['w:top', 'w:left', 'w:bottom', 'w:right']);

    // tblCellMar decode emits in CT_TblCellMar sequence.
    const tblOut = tblCellMarTranslator.decode({ node: { attrs: { cellMargins: tblMargins } } });
    expect(tblOut.elements.map((e) => e.name)).toEqual(['w:top', 'w:start', 'w:bottom', 'w:end']);
  });
});
