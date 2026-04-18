import { describe, it, expect } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'fs';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { getNumberingCache } from '@core/super-converter/v2/importer/numberingCache.js';
import { initTestEditor } from '../helpers/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCX_FIXTURE_NAME = 'list_with_indents.docx';

const findNumberingRoot = (json) => {
  if (!json?.elements?.length) return null;
  if (json.elements[0]?.name === 'w:numbering') return json.elements[0];
  return json.elements.find((element) => element?.name === 'w:numbering') || null;
};

const findAbstractById = (numberingRoot, abstractId) =>
  numberingRoot?.elements?.find(
    (element) =>
      element?.name === 'w:abstractNum' && String(element.attributes?.['w:abstractNumId']) === String(abstractId),
  ) || null;

const findNumNodeById = (numberingRoot, numId) =>
  numberingRoot?.elements?.find(
    (element) => element?.name === 'w:num' && String(element.attributes?.['w:numId']) === String(numId),
  ) || null;

const normalizeIndentAttributes = (attrs = {}) =>
  Object.keys(attrs)
    .sort()
    .reduce((normalized, key) => {
      normalized[key] = String(attrs[key]);
      return normalized;
    }, {});

const collectIndentLevels = (abstractNode) => {
  if (!abstractNode?.elements?.length) return [];
  return abstractNode.elements
    .filter((element) => element?.name === 'w:lvl')
    .map((level) => {
      const ilvl = String(level?.attributes?.['w:ilvl'] ?? '0');
      const paragraphProps = level?.elements?.find((element) => element?.name === 'w:pPr');
      const indentNode = paragraphProps?.elements?.find((element) => element?.name === 'w:ind');
      const attrs = normalizeIndentAttributes(indentNode?.attributes || {});
      return { ilvl, attrs };
    })
    .filter(({ attrs }) => Object.keys(attrs).length > 0)
    .sort((a, b) => Number(a.ilvl) - Number(b.ilvl));
};

const collectUsedNumIds = (node, accumulator = new Set()) => {
  if (!node || typeof node !== 'object') return accumulator;

  if (Array.isArray(node)) {
    node.forEach((child) => collectUsedNumIds(child, accumulator));
    return accumulator;
  }

  const { name, elements } = node;
  if (name === 'w:numPr' && Array.isArray(elements)) {
    const numId = elements.find((element) => element?.name === 'w:numId')?.attributes?.['w:val'];
    if (numId != null) accumulator.add(String(numId));
  }

  if (Array.isArray(elements)) {
    elements.forEach((child) => collectUsedNumIds(child, accumulator));
  }
  return accumulator;
};

const mapNumToAbstract = (numberingRoot) => {
  const mapping = new Map();
  numberingRoot?.elements?.forEach((element) => {
    if (element?.name !== 'w:num') return;
    const numId = element.attributes?.['w:numId'];
    const abstractId = element.elements?.find((child) => child?.name === 'w:abstractNumId')?.attributes?.['w:val'];
    if (numId != null && abstractId != null) mapping.set(String(numId), String(abstractId));
  });
  return mapping;
};

describe('list-formatting-indents roundtrip', () => {
  it('caches numbering.xml during import and preserves list indentation on export', async () => {
    const docxPath = join(__dirname, '../data', DOCX_FIXTURE_NAME);
    const docxBuffer = await fs.readFile(docxPath);

    const originalZipper = new DocxZipper();
    const originalEntries = await originalZipper.getDocxData(docxBuffer, true);
    const numberingEntry = originalEntries.find((entry) => entry.name === 'word/numbering.xml');
    const documentEntry = originalEntries.find((entry) => entry.name === 'word/document.xml');
    expect(numberingEntry).toBeDefined();
    expect(documentEntry).toBeDefined();

    const originalNumberingJson = parseXmlToJson(numberingEntry.content);
    const originalDocumentJson = parseXmlToJson(documentEntry.content);

    const numberingRoot = findNumberingRoot(originalNumberingJson);
    expect(numberingRoot).toBeDefined();

    const usedNumIds = [...collectUsedNumIds(originalDocumentJson)].sort((a, b) => Number(a) - Number(b));
    expect(usedNumIds.length).toBeGreaterThan(0);

    const numToAbstract = mapNumToAbstract(numberingRoot);
    const abstractIds = [...new Set(usedNumIds.map((numId) => numToAbstract.get(numId)).filter(Boolean))];
    expect(abstractIds.length).toBeGreaterThan(0);

    const expectedIndentData = new Map();
    abstractIds.forEach((abstractId) => {
      const abstractNode = findAbstractById(numberingRoot, abstractId);
      expect(abstractNode).toBeDefined();
      const indents = collectIndentLevels(abstractNode);
      expect(indents.length).toBeGreaterThan(0);
      expectedIndentData.set(String(abstractId), indents);
    });

    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    // Verify the cache was created and populated during import
    const cache = getNumberingCache(editor.converter);
    expect(cache.numToDefinition.size).toBeGreaterThan(0);
    expect(cache.abstractById.size).toBeGreaterThan(0);
    expect(cache.numNodesById.size).toBeGreaterThan(0);

    usedNumIds.forEach((numId) => {
      expect(cache.numNodesById.get(numId)).toBeDefined();
      const abstractId = numToAbstract.get(numId);
      expect(abstractId).toBeDefined();
      expect(cache.numToDefinition.get(numId)).toBe(cache.abstractById.get(abstractId));

      const numericNumId = Number(numId);
      const definitionNode = editor.converter.numbering.definitions[numericNumId];
      expect(definitionNode).toBe(cache.numNodesById.get(numId));
    });

    abstractIds.forEach((abstractId) => {
      const numericAbstractId = Number(abstractId);
      const abstractNode = editor.converter.numbering.abstracts[numericAbstractId];
      expect(abstractNode).toBe(cache.abstractById.get(abstractId));
      const importedIndents = collectIndentLevels(abstractNode);
      expect(importedIndents).toEqual(expectedIndentData.get(abstractId));
    });

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    expect(exportedBuffer?.byteLength || exportedBuffer?.length || 0).toBeGreaterThan(0);

    const exportedZipper = new DocxZipper();
    const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);
    const exportedNumberingEntry = exportedFiles.find((entry) => entry.name === 'word/numbering.xml');
    expect(exportedNumberingEntry).toBeDefined();

    const exportedNumberingJson = parseXmlToJson(exportedNumberingEntry.content);
    const exportedNumberingRoot = findNumberingRoot(exportedNumberingJson);
    expect(exportedNumberingRoot).toBeDefined();

    usedNumIds.forEach((numId) => {
      const exportedNumNode = findNumNodeById(exportedNumberingRoot, numId);
      expect(exportedNumNode).toBeDefined();
      const exportedAbstractVal = exportedNumNode.elements?.find((child) => child?.name === 'w:abstractNumId')
        ?.attributes?.['w:val'];
      expect(exportedAbstractVal).toBe(numToAbstract.get(numId));
    });

    abstractIds.forEach((abstractId) => {
      const exportedAbstractNode = findAbstractById(exportedNumberingRoot, abstractId);
      expect(exportedAbstractNode).toBeDefined();
      const exportedIndents = collectIndentLevels(exportedAbstractNode);
      expect(exportedIndents).toEqual(expectedIndentData.get(abstractId));
    });

    editor.destroy();
  });
});
