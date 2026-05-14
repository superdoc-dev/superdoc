import { describe, it, expect } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'fs';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor } from '../helpers/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const findNumberingRoot = (json) => {
  if (!json?.elements?.length) return null;
  if (json.elements[0]?.name === 'w:numbering') return json.elements[0];
  return json.elements.find((el) => el?.name === 'w:numbering') || null;
};

const countByName = (numberingRoot, elementName) =>
  (numberingRoot?.elements || []).filter((el) => el?.name === elementName).length;

const collectIds = (numberingRoot, elementName, attrName) =>
  (numberingRoot?.elements || [])
    .filter((el) => el?.name === elementName)
    .map((el) => String(el.attributes?.[attrName]))
    .filter(Boolean)
    .sort();

async function roundTripNumberingCounts(fileName) {
  const docxPath = join(__dirname, '../data', fileName);
  const docxBuffer = await fs.readFile(docxPath);

  const originalZipper = new DocxZipper();
  const originalEntries = await originalZipper.getDocxData(docxBuffer, true);
  const originalNumberingEntry = originalEntries.find((entry) => entry.name === 'word/numbering.xml');
  expect(originalNumberingEntry, 'fixture must contain word/numbering.xml').toBeDefined();
  const originalRoot = findNumberingRoot(parseXmlToJson(originalNumberingEntry.content));

  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
  const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

  const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
  const exportedZipper = new DocxZipper();
  const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);
  const exportedNumberingEntry = exportedFiles.find((entry) => entry.name === 'word/numbering.xml');
  expect(exportedNumberingEntry, 'export must contain word/numbering.xml').toBeDefined();
  const exportedRoot = findNumberingRoot(parseXmlToJson(exportedNumberingEntry.content));

  return { originalRoot, exportedRoot };
}

// SD-2911 P2 (Luccas review). Documents whose source package contained NO
// `word/numbering.xml` must not gain one on round-trip. The importer falls
// back to `baseNumbering` when the part is missing (docxImporter.js:644), so
// `this.numbering` is populated with SuperDoc's fallback definitions even for
// plain documents. The previous SD-2911 fix wrote those out unconditionally,
// silently injecting unused definitions into the exported package. The
// exporter must skip writing `word/numbering.xml` when the source had none
// AND no body paragraph references a numId.

describe('SD-2911 P2 — plain documents do not gain numbering.xml on round-trip', () => {
  async function exportAndCheckNumberingPart(fileName) {
    const docxPath = join(__dirname, '../data', fileName);
    const docxBuffer = await fs.readFile(docxPath);

    const originalZipper = new DocxZipper();
    const originalEntries = await originalZipper.getDocxData(docxBuffer, true);
    const originalHasNumbering = originalEntries.some((entry) => entry.name === 'word/numbering.xml');

    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const exportedZipper = new DocxZipper();
    const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);
    const exportedNumberingEntry = exportedFiles.find((entry) => entry.name === 'word/numbering.xml');

    return { originalHasNumbering, exportedHasNumbering: Boolean(exportedNumberingEntry), exportedNumberingEntry };
  }

  it('source fixture has no word/numbering.xml (sanity for the assertion below)', async () => {
    const { originalHasNumbering } = await exportAndCheckNumberingPart('blank-doc.docx');
    expect(originalHasNumbering).toBe(false);
  });

  it('does not emit word/numbering.xml on export when the source package had none (blank-doc.docx)', async () => {
    const { originalHasNumbering, exportedHasNumbering } = await exportAndCheckNumberingPart('blank-doc.docx');
    expect(originalHasNumbering).toBe(false);
    expect(exportedHasNumbering).toBe(false);
  });

  it('does not emit word/numbering.xml on export for a plain text document with no list usage (Hello docx world.docx)', async () => {
    const { originalHasNumbering, exportedHasNumbering } = await exportAndCheckNumberingPart('Hello docx world.docx');
    expect(originalHasNumbering).toBe(false);
    expect(exportedHasNumbering).toBe(false);
  });
});

describe('SD-2911 — numbering.xml definitions preserved on DOCX round-trip', () => {
  it('preserves every abstractNum and num for the active-numbering fixture (numId 1 is used)', async () => {
    const { originalRoot, exportedRoot } = await roundTripNumberingCounts('sd-2911-active-numbering.docx');

    expect(countByName(originalRoot, 'w:abstractNum')).toBe(8);
    expect(countByName(originalRoot, 'w:num')).toBe(8);
    expect(countByName(exportedRoot, 'w:abstractNum')).toBe(countByName(originalRoot, 'w:abstractNum'));
    expect(countByName(exportedRoot, 'w:num')).toBe(countByName(originalRoot, 'w:num'));
  });

  it('preserves every abstractNumId and numId verbatim for the active-numbering fixture', async () => {
    const { originalRoot, exportedRoot } = await roundTripNumberingCounts('sd-2911-active-numbering.docx');
    expect(collectIds(exportedRoot, 'w:abstractNum', 'w:abstractNumId')).toEqual(
      collectIds(originalRoot, 'w:abstractNum', 'w:abstractNumId'),
    );
    expect(collectIds(exportedRoot, 'w:num', 'w:numId')).toEqual(collectIds(originalRoot, 'w:num', 'w:numId'));
  });

  it('preserves tentative numbering even when no numId is referenced in the document body', async () => {
    const { originalRoot, exportedRoot } = await roundTripNumberingCounts('sd-2911-tentative-numbering.docx');

    expect(countByName(originalRoot, 'w:abstractNum')).toBe(2);
    expect(countByName(originalRoot, 'w:num')).toBe(1);
    expect(countByName(exportedRoot, 'w:abstractNum')).toBe(countByName(originalRoot, 'w:abstractNum'));
    expect(countByName(exportedRoot, 'w:num')).toBe(countByName(originalRoot, 'w:num'));
  });
});
