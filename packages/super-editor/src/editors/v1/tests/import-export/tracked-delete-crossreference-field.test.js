import { describe, expect, it, afterEach } from 'vitest';
import * as xmljs from 'xml-js';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';

// Regression fixture for the reported bug: a REF/cross-reference field entirely
// inside a tracked deletion loses its deletion context on V1 import/export —
// the single w:del splits into fragments and the field instruction revives as
// a live w:instrText. See plans/TASK.md.
const TEST_DOC = 'behavior-fixtures/tracked-delete-crossreference-field.docx';

const flattenText = (node) => {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  return (node.elements ?? []).map(flattenText).join('');
};

const findParagraphContaining = (bodyElements, needle) =>
  bodyElements.find((el) => el.name === 'w:p' && flattenText(el).includes(needle));

const countByName = (node, name, count = { value: 0 }) => {
  if (!node || typeof node !== 'object') return count.value;
  if (node.name === name) count.value += 1;
  (node.elements ?? []).forEach((child) => countByName(child, name, count));
  return count.value;
};

const findFldCharTypes = (node, types = []) => {
  if (!node || typeof node !== 'object') return types;
  if (node.name === 'w:fldChar') types.push(node.attributes?.['w:fldCharType']);
  (node.elements ?? []).forEach((child) => findFldCharTypes(child, types));
  return types;
};

describe('tracked deletion around a cross-reference field (round-trip, no edits)', () => {
  let editor;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  const exportAndParseDocumentXml = async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(TEST_DOC);
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true }));

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const zipper = new DocxZipper();
    const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
    const documentXml = exportedFiles.find((entry) => entry.name === 'word/document.xml')?.content;
    expect(documentXml).toBeTruthy();

    const parsed = xmljs.xml2js(documentXml, { compact: false });
    const documentRoot = parsed.elements.find((el) => el.name === 'w:document');
    const bodyRoot = documentRoot.elements.find((el) => el.name === 'w:body');
    return bodyRoot.elements;
  };

  it('keeps the deleted CASE field in one w:del with one w:delInstrText and no live w:instrText', async () => {
    const bodyElements = await exportAndParseDocumentXml();
    const caseParagraph = findParagraphContaining(bodyElements, 'CASE — Rights under');
    expect(caseParagraph).toBeTruthy();

    expect(countByName(caseParagraph, 'w:del')).toBe(1);
    expect(countByName(caseParagraph, 'w:delInstrText')).toBe(1);
    expect(countByName(caseParagraph, 'w:instrText')).toBe(0);

    const fldCharTypes = findFldCharTypes(caseParagraph);
    expect(fldCharTypes).toEqual(['begin', 'separate', 'end']);
  });

  it('leaves the untracked CONTROL field intact and outside any w:del', async () => {
    const bodyElements = await exportAndParseDocumentXml();
    const controlParagraph = findParagraphContaining(bodyElements, 'CONTROL — Rights under');
    expect(controlParagraph).toBeTruthy();

    expect(countByName(controlParagraph, 'w:del')).toBe(0);
    expect(countByName(controlParagraph, 'w:delInstrText')).toBe(0);
    expect(countByName(controlParagraph, 'w:instrText')).toBe(1);

    const fldCharTypes = findFldCharTypes(controlParagraph);
    expect(fldCharTypes).toEqual(['begin', 'separate', 'end']);
    expect(flattenText(controlParagraph)).toContain('10.6');
  });
});
