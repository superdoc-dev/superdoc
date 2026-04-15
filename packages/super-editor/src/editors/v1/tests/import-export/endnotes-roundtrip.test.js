import { describe, it, expect, afterEach } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'fs';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor } from '../helpers/helpers.js';
import { prepareEndnotesXmlForExport } from '@converter/v2/exporter/footnotesExporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCX_FIXTURE_NAME = 'basic-footnotes.docx';

const findEndnotesRoot = (json) => {
  if (!json?.elements?.length) return null;
  if (json.elements[0]?.name === 'w:endnotes') return json.elements[0];
  return json.elements.find((el) => el?.name === 'w:endnotes') || null;
};

const findEndnotesByType = (root, type) =>
  root?.elements?.filter((el) => el?.name === 'w:endnote' && el.attributes?.['w:type'] === type) || [];

const collectEndnoteIds = (root) =>
  root?.elements
    ?.filter((el) => el?.name === 'w:endnote')
    ?.map((el) => el.attributes?.['w:id'])
    ?.filter((id) => id != null) || [];

const findContentTypes = (files) => {
  const entry = files.find((f) => f.name === '[Content_Types].xml');
  return entry ? parseXmlToJson(entry.content) : null;
};

const hasContentTypeOverride = (json, partName) => {
  const types = json?.elements?.find((el) => el.name === 'Types');
  return types?.elements?.some((el) => el.name === 'Override' && el.attributes?.PartName === partName) || false;
};

const findDocumentRels = (files) => {
  const entry = files.find((f) => f.name === 'word/_rels/document.xml.rels');
  return entry ? parseXmlToJson(entry.content) : null;
};

const hasEndnotesRelationship = (relsJson) => {
  const rels = relsJson?.elements?.find((el) => el.name === 'Relationships');
  return (
    rels?.elements?.some(
      (el) =>
        el.name === 'Relationship' &&
        el.attributes?.Type === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes',
    ) || false
  );
};

describe('endnotes import/export roundtrip', () => {
  let editor;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  describe('roundtrip preservation', () => {
    it('preserves endnotes.xml through import → export cycle', async () => {
      const docxPath = join(__dirname, '../data', DOCX_FIXTURE_NAME);
      const docxBuffer = await fs.readFile(docxPath);

      // Get original endnotes
      const originalZipper = new DocxZipper();
      const originalFiles = await originalZipper.getDocxData(docxBuffer, true);
      const originalEndnotesEntry = originalFiles.find((f) => f.name === 'word/endnotes.xml');
      expect(originalEndnotesEntry).toBeDefined();

      const originalEndnotesJson = parseXmlToJson(originalEndnotesEntry.content);
      const originalRoot = findEndnotesRoot(originalEndnotesJson);
      expect(originalRoot).toBeDefined();
      expect(originalRoot.name).toBe('w:endnotes');

      const originalIds = collectEndnoteIds(originalRoot);
      expect(originalIds.length).toBeGreaterThan(0);

      // Import and export
      const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
      const { editor: testEditor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
      editor = testEditor;

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedZipper = new DocxZipper();
      const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);
      const exportedEndnotesEntry = exportedFiles.find((f) => f.name === 'word/endnotes.xml');

      // The fix: word/endnotes.xml MUST appear in the export so the package
      // is internally consistent with the endnotes relationship in document.xml.rels
      expect(exportedEndnotesEntry).toBeDefined();

      const exportedEndnotesJson = parseXmlToJson(exportedEndnotesEntry.content);
      const exportedRoot = findEndnotesRoot(exportedEndnotesJson);
      expect(exportedRoot).toBeDefined();
      expect(exportedRoot.name).toBe('w:endnotes');
    });

    it('preserves separator endnotes (w:type="separator") through roundtrip', async () => {
      const docxPath = join(__dirname, '../data', DOCX_FIXTURE_NAME);
      const docxBuffer = await fs.readFile(docxPath);

      const originalZipper = new DocxZipper();
      const originalFiles = await originalZipper.getDocxData(docxBuffer, true);
      const originalEndnotesJson = parseXmlToJson(originalFiles.find((f) => f.name === 'word/endnotes.xml').content);
      const originalRoot = findEndnotesRoot(originalEndnotesJson);
      const originalSeparators = findEndnotesByType(originalRoot, 'separator');
      const originalContinuationSeparators = findEndnotesByType(originalRoot, 'continuationSeparator');

      const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
      const { editor: testEditor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
      editor = testEditor;

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedZipper = new DocxZipper();
      const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);
      const exportedEndnotesJson = parseXmlToJson(exportedFiles.find((f) => f.name === 'word/endnotes.xml').content);
      const exportedRoot = findEndnotesRoot(exportedEndnotesJson);

      const exportedSeparators = findEndnotesByType(exportedRoot, 'separator');
      const exportedContinuationSeparators = findEndnotesByType(exportedRoot, 'continuationSeparator');

      expect(exportedSeparators.length).toBe(originalSeparators.length);
      expect(exportedContinuationSeparators.length).toBe(originalContinuationSeparators.length);
    });
  });

  describe('content types and relationships', () => {
    it('includes endnotes.xml override in [Content_Types].xml', async () => {
      const docxPath = join(__dirname, '../data', DOCX_FIXTURE_NAME);
      const docxBuffer = await fs.readFile(docxPath);

      const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
      const { editor: testEditor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
      editor = testEditor;

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedZipper = new DocxZipper();
      const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);

      const contentTypes = findContentTypes(exportedFiles);
      expect(contentTypes).toBeDefined();
      expect(hasContentTypeOverride(contentTypes, '/word/endnotes.xml')).toBe(true);
    });

    it('includes endnotes relationship in document.xml.rels', async () => {
      const docxPath = join(__dirname, '../data', DOCX_FIXTURE_NAME);
      const docxBuffer = await fs.readFile(docxPath);

      const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
      const { editor: testEditor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
      editor = testEditor;

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedZipper = new DocxZipper();
      const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);

      const rels = findDocumentRels(exportedFiles);
      expect(rels).toBeDefined();
      expect(hasEndnotesRelationship(rels)).toBe(true);
    });

    it('keeps endnotes relationship and endnotes.xml in sync (no dangling reference)', async () => {
      // Regression for SD-2534: the bug was that endnotes.xml went missing but the
      // relationship to it remained, leaving Word with a dangling reference.
      const docxPath = join(__dirname, '../data', DOCX_FIXTURE_NAME);
      const docxBuffer = await fs.readFile(docxPath);

      const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
      const { editor: testEditor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
      editor = testEditor;

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedZipper = new DocxZipper();
      const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);

      const hasRelationship = hasEndnotesRelationship(findDocumentRels(exportedFiles));
      const hasPart = exportedFiles.some((f) => f.name === 'word/endnotes.xml');

      // If the relationship exists, the part MUST exist too.
      if (hasRelationship) {
        expect(hasPart).toBe(true);
      }
    });
  });
});

describe('prepareEndnotesXmlForExport unit tests', () => {
  it('returns empty result when no endnotes are provided', () => {
    const result = prepareEndnotesXmlForExport({
      endnotes: [],
      editor: null,
      converter: { convertedXml: {} },
      convertedXml: {},
    });

    expect(result.relationships).toEqual([]);
    expect(result.media).toEqual({});
    // updatedXml should still be returned (settings.xml view-setting passthrough)
    expect(result.updatedXml).toBeDefined();
  });

  it('produces an endnotes.xml entry with the correct root element', () => {
    const separatorEndnote = {
      id: '-1',
      type: 'separator',
      content: [],
      originalXml: {
        type: 'element',
        name: 'w:endnote',
        attributes: { 'w:id': '-1', 'w:type': 'separator' },
        elements: [
          {
            type: 'element',
            name: 'w:p',
            elements: [{ type: 'element', name: 'w:r', elements: [{ type: 'element', name: 'w:separator' }] }],
          },
        ],
      },
    };

    const result = prepareEndnotesXmlForExport({
      endnotes: [separatorEndnote],
      editor: { schema: { topNodeType: { name: 'doc' } }, options: {}, converter: { convertedXml: {} } },
      converter: { convertedXml: {} },
      convertedXml: {},
    });

    const endnotesXml = result.updatedXml['word/endnotes.xml'];
    expect(endnotesXml).toBeDefined();
    expect(endnotesXml.elements?.[0]?.name).toBe('w:endnotes');
  });

  it('emits the endnotes relationship type per OOXML spec', () => {
    const separatorEndnote = {
      id: '-1',
      type: 'separator',
      content: [],
      originalXml: {
        type: 'element',
        name: 'w:endnote',
        attributes: { 'w:id': '-1', 'w:type': 'separator' },
        elements: [],
      },
    };

    const result = prepareEndnotesXmlForExport({
      endnotes: [separatorEndnote],
      editor: { schema: { topNodeType: { name: 'doc' } }, options: {}, converter: { convertedXml: {} } },
      converter: { convertedXml: {} },
      convertedXml: {},
    });

    expect(result.relationships.length).toBeGreaterThan(0);
    const endnoteRel = result.relationships.find(
      (r) => r.attributes?.Type === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes',
    );
    expect(endnoteRel).toBeDefined();
    expect(endnoteRel.attributes.Target).toBe('endnotes.xml');
  });
});
