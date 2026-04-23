#!/usr/bin/env bun
/**
 * Build SD-2672 edge-case fixtures by patching Word-authored base DOCX files.
 *
 * Input:  sd-2672-plain-3x3.docx (authored via Word COM API)
 * Output: sd-2672-gridbefore-vmerge.docx
 *         sd-2672-sdt-table.docx
 *         sd-2672-nested-table.docx
 *         sd-2672-multipara-cell.docx
 *
 * Each variant mutates `word/document.xml` inside the DOCX ZIP to inject
 * OOXML constructs that Word's UI and COM API can't cleanly produce via
 * scripted automation (tracked revisions, exact gridBefore placement,
 * nested tables, SDT wrappers).
 *
 * Run from repo root or anywhere:
 *   bun tests/behavior/tests/navigation/fixtures/build-sd-2672-fixtures.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = join(__dirname, 'sd-2672-plain-3x3.docx');

if (!existsSync(BASE)) {
  console.error(`Missing base fixture: ${BASE}`);
  console.error(
    'Generate it first via Word API (see commit history or PR #2925 description).',
  );
  process.exit(1);
}

/**
 * Loads the base DOCX, lets the caller mutate its document.xml (string in,
 * string out), and writes the result to `outputName` in the same folder.
 */
async function patchDocx(outputName, mutate) {
  const buf = readFileSync(BASE);
  const zip = await JSZip.loadAsync(buf);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('word/document.xml missing in base DOCX');
  const before = await docXmlFile.async('string');
  const after = mutate(before);
  if (after === before) {
    throw new Error(`patch for ${outputName} produced no change`);
  }
  zip.file('word/document.xml', after);
  const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
  const outPath = join(__dirname, outputName);
  writeFileSync(outPath, outBuf);
  console.log(`wrote ${outputName} (${outBuf.byteLength} bytes)`);
}

// ---------------------------------------------------------------------------
// Patches
// ---------------------------------------------------------------------------

/**
 * Injects `<w:gridBefore w:val="1"/>` on row 0 and `<w:vMerge w:val="restart"/>`
 * on (0,0) plus `<w:vMerge/>` on (1,0) so the first column of row 1 is a
 * vertical-merge continuation cell. Preserves the rest of the table.
 *
 * Target shape: a table where row 0's first cell is visually offset by one
 * grid column (gridBefore=1) AND row 1's first cell is a vMerge continuation
 * of row 0's now-offset first cell. This is the exact interaction codex flagged
 * as most likely to mis-handle: gridBefore + vMerge in the same column.
 */
function patchGridBeforeVMerge(xml) {
  // Inject <w:trPr><w:gridBefore w:val="1"/></w:trPr> into the first <w:tr>.
  // If <w:trPr> already exists we append; if not we prepend one.
  const trMatch = xml.match(/<w:tr\b[^>]*>/);
  if (!trMatch) throw new Error('no <w:tr> in base');
  const firstTrEnd = trMatch.index + trMatch[0].length;
  const gridBeforeTrPr = `<w:trPr><w:gridBefore w:val="1"/></w:trPr>`;
  let out = xml.slice(0, firstTrEnd) + gridBeforeTrPr + xml.slice(firstTrEnd);

  // Find the first cell of the SECOND <w:tr> and inject <w:vMerge/> on its
  // <w:tcPr>. This makes (1,0) a continuation of (0,0)'s vertical span.
  // (Note: (0,0) would normally need vMerge="restart", but SuperDoc's importer
  // folds continue cells into the origin regardless; what we want to
  // verify is that extract doesn't emit a phantom block at (1,0).)
  const secondTrRegex = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
  const trMatches = [...out.matchAll(secondTrRegex)];
  if (trMatches.length < 2) throw new Error('base does not have 2+ rows');
  const secondTr = trMatches[1];
  const secondTrText = secondTr[0];
  const firstTcInSecondTr = secondTrText.match(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/);
  if (!firstTcInSecondTr) throw new Error('no <w:tc> in second row');
  const tcBody = firstTcInSecondTr[1];

  // Inject vMerge into tcPr (create tcPr if missing).
  let patchedTcBody;
  if (/<w:tcPr>/.test(tcBody)) {
    patchedTcBody = tcBody.replace('<w:tcPr>', '<w:tcPr><w:vMerge/>');
  } else {
    patchedTcBody = `<w:tcPr><w:vMerge/></w:tcPr>` + tcBody;
  }
  const patchedTc =
    firstTcInSecondTr[0].replace(tcBody, patchedTcBody);
  const patchedSecondTr = secondTrText.replace(firstTcInSecondTr[0], patchedTc);
  out = out.slice(0, secondTr.index) + patchedSecondTr + out.slice(secondTr.index + secondTrText.length);

  // Also inject vMerge="restart" on (0,0) so the importer knows the origin.
  const firstTrRegex = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/;
  const firstTrMatch = out.match(firstTrRegex);
  if (!firstTrMatch) throw new Error('lost first row during patch');
  const firstTrText = firstTrMatch[0];
  const firstTcInFirstTr = firstTrText.match(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/);
  if (!firstTcInFirstTr) throw new Error('no <w:tc> in first row');
  const firstCellBody = firstTcInFirstTr[1];
  let patchedFirstCellBody;
  if (/<w:tcPr>/.test(firstCellBody)) {
    patchedFirstCellBody = firstCellBody.replace('<w:tcPr>', '<w:tcPr><w:vMerge w:val="restart"/>');
  } else {
    patchedFirstCellBody = `<w:tcPr><w:vMerge w:val="restart"/></w:tcPr>` + firstCellBody;
  }
  const patchedFirstTc = firstTcInFirstTr[0].replace(firstCellBody, patchedFirstCellBody);
  const patchedFirstTr = firstTrText.replace(firstTcInFirstTr[0], patchedFirstTc);
  out = out.replace(firstTrText, patchedFirstTr);

  return out;
}

/**
 * Wraps the first `<w:tbl>` in a block structured-document tag
 * (`<w:sdt>...<w:sdtContent>...</w:sdtContent></w:sdt>`). Tests that the
 * extract walker treats block SDTs transparently and emits the inner table's
 * cells as individual paragraph blocks with tableContext.
 */
function patchSdtTable(xml) {
  const tblRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>/;
  const m = xml.match(tblRegex);
  if (!m) throw new Error('no <w:tbl> in base');
  const tbl = m[0];
  const sdtId = Math.floor(Math.random() * 1e9);
  const wrapped = `<w:sdt><w:sdtPr><w:id w:val="${sdtId}"/><w:alias w:val="sd-2672-sdt"/><w:tag w:val="sd-2672-sdt"/></w:sdtPr><w:sdtContent>${tbl}</w:sdtContent></w:sdt>`;
  return xml.replace(tbl, wrapped);
}

/**
 * Replaces cell (1,1) with a cell containing a nested 2x2 table.
 * Verifies that extract emits the nested table's cells with a fresh
 * tableOrdinal and parent* coordinates pointing at the outer cell.
 */
function patchNestedTable(xml) {
  const rows = [...xml.matchAll(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g)];
  if (rows.length < 2) throw new Error('need 2+ rows');
  const secondTr = rows[1][0];
  const cellsInSecondTr = [...secondTr.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)];
  if (cellsInSecondTr.length < 2) throw new Error('need 2+ cells in row 2');
  const targetTc = cellsInSecondTr[1][0];

  // Build a minimal nested 2x2 table.
  const nestedTable = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>nested-a</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>nested-b</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>nested-c</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>nested-d</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;

  // Replace the cell's body with one paragraph ("before nested"), the nested
  // table, and one paragraph ("after nested"). A cell must end in a
  // paragraph per OOXML, so we append a trailing empty <w:p/>.
  const newTcBody = `<w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>before-nested</w:t></w:r></w:p>${nestedTable}<w:p><w:r><w:t>after-nested</w:t></w:r></w:p>`;
  const newTc = `<w:tc>${newTcBody}</w:tc>`;
  return xml.replace(targetTc, newTc);
}

/**
 * Replaces cell (0,0)'s single paragraph with two paragraphs in sequence.
 * Tests that paragraph-granular extraction emits ONE block per paragraph
 * (not joined with a separator) and that each carries the same tableContext.
 */
function patchMultiParaCell(xml) {
  const tcMatch = xml.match(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/);
  if (!tcMatch) throw new Error('no <w:tc> in base');
  const tcBody = tcMatch[1];
  // Find the first <w:p>...</w:p> and replace it with two paragraphs.
  const pMatch = tcBody.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/);
  if (!pMatch) throw new Error('no <w:p> in first cell');
  const newParas = `<w:p><w:r><w:t>cell-00-line-1</w:t></w:r></w:p><w:p><w:r><w:t>cell-00-line-2</w:t></w:r></w:p>`;
  const newTcBody = tcBody.replace(pMatch[0], newParas);
  const newTc = tcMatch[0].replace(tcBody, newTcBody);
  return xml.replace(tcMatch[0], newTc);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

await patchDocx('sd-2672-gridbefore-vmerge.docx', patchGridBeforeVMerge);
await patchDocx('sd-2672-sdt-table.docx', patchSdtTable);
await patchDocx('sd-2672-nested-table.docx', patchNestedTable);
await patchDocx('sd-2672-multipara-cell.docx', patchMultiParaCell);

console.log('\nall fixtures built');
