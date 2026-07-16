import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'fs';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor } from '../helpers/helpers.js';
import {
  createFootnoteElement,
  prepareFootnotesXmlForExport,
  pruneSessionDeletedNotesPart,
} from '@converter/v2/exporter/footnotesExporter.js';
import { importFootnoteData } from '@converter/v2/importer/documentFootnotesImporter.js';
import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { resolveNoteRuntime } from '../../document-api-adapters/story-runtime/note-story-runtime.ts';
import { registerLiveStorySessionRuntime } from '../../document-api-adapters/story-runtime/live-story-session-runtime-registry.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCX_FIXTURE_NAME = 'basic-footnotes.docx';
const minimalStylesXml = parseXmlToJson(
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults>' +
    '<w:rPrDefault><w:rPr/></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr/></w:pPrDefault>' +
    '</w:docDefaults>' +
    '<w:style w:type="paragraph" w:styleId="Normal">' +
    '<w:name w:val="Normal"/>' +
    '<w:qFormat/>' +
    '<w:pPr/>' +
    '<w:rPr/>' +
    '</w:style>' +
    '</w:styles>',
);

// ============================================
// Helper Functions
// ============================================

const findFootnotesRoot = (json) => {
  if (!json?.elements?.length) return null;
  if (json.elements[0]?.name === 'w:footnotes') return json.elements[0];
  return json.elements.find((el) => el?.name === 'w:footnotes') || null;
};

const findFootnoteById = (footnotesRoot, id) =>
  footnotesRoot?.elements?.find((el) => el?.name === 'w:footnote' && String(el.attributes?.['w:id']) === String(id)) ||
  null;

const findFootnotesByType = (footnotesRoot, type) =>
  footnotesRoot?.elements?.filter((el) => el?.name === 'w:footnote' && el.attributes?.['w:type'] === type) || [];

const collectFootnoteIds = (footnotesRoot) =>
  footnotesRoot?.elements
    ?.filter((el) => el?.name === 'w:footnote')
    ?.map((el) => el.attributes?.['w:id'])
    ?.filter((id) => id != null) || [];

const hasFootnoteRef = (node) => {
  if (!node) return false;
  if (node.name === 'w:footnoteRef') return true;
  const children = Array.isArray(node.elements) ? node.elements : [];
  return children.some((child) => hasFootnoteRef(child));
};

const extractTextContent = (node) => {
  if (!node) return '';
  if (node.name === 'w:t' && node.elements?.[0]?.text) {
    return node.elements[0].text;
  }
  const parts = [];
  const elements = Array.isArray(node.elements) ? node.elements : [];
  elements.forEach((child) => {
    parts.push(extractTextContent(child));
  });
  return parts.join('');
};

const findContentTypes = (files) => {
  const entry = files.find((f) => f.name === '[Content_Types].xml');
  return entry ? parseXmlToJson(entry.content) : null;
};

const hasContentTypeOverride = (contentTypesJson, partName) => {
  const types = contentTypesJson?.elements?.find((el) => el.name === 'Types');
  return types?.elements?.some((el) => el.name === 'Override' && el.attributes?.PartName === partName) || false;
};

const findDocumentRels = (files) => {
  const entry = files.find((f) => f.name === 'word/_rels/document.xml.rels');
  return entry ? parseXmlToJson(entry.content) : null;
};

const hasFootnotesRelationship = (relsJson) => {
  const rels = relsJson?.elements?.find((el) => el.name === 'Relationships');
  return (
    rels?.elements?.some(
      (el) =>
        el.name === 'Relationship' &&
        el.attributes?.Type === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes',
    ) || false
  );
};

const findSettingsXml = (files) => {
  const entry = files.find((f) => f.name === 'word/settings.xml');
  return entry ? parseXmlToJson(entry.content) : null;
};

const findFootnotePrInSettings = (settingsJson) => {
  const root = settingsJson?.elements?.[0];
  return root?.elements?.find((el) => el?.name === 'w:footnotePr') || null;
};

const findSectPr = (documentJson) => {
  const body = documentJson?.elements?.[0]?.elements?.find((el) => el?.name === 'w:body');
  return body?.elements?.find((el) => el?.name === 'w:sectPr') || null;
};

const findFootnotePrInSectPr = (sectPr) => {
  return sectPr?.elements?.find((el) => el?.name === 'w:footnotePr') || null;
};

// ============================================
// Test Suite
// ============================================

describe('footnotes import/export roundtrip', () => {
  let editor;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  // ------------------------------------------
  // Roundtrip Tests
  // ------------------------------------------

  describe('roundtrip preservation', () => {
    it('preserves footnote content through import → export cycle', async () => {
      const docxPath = join(__dirname, '../data', DOCX_FIXTURE_NAME);
      const docxBuffer = await fs.readFile(docxPath);

      // Get original footnotes
      const originalZipper = new DocxZipper();
      const originalFiles = await originalZipper.getDocxData(docxBuffer, true);
      const originalFootnotesEntry = originalFiles.find((f) => f.name === 'word/footnotes.xml');
      expect(originalFootnotesEntry).toBeDefined();

      const originalFootnotesJson = parseXmlToJson(originalFootnotesEntry.content);
      const originalRoot = findFootnotesRoot(originalFootnotesJson);
      expect(originalRoot).toBeDefined();

      const originalIds = collectFootnoteIds(originalRoot);
      const regularFootnoteIds = originalIds.filter((id) => {
        const fn = findFootnoteById(originalRoot, id);
        const type = fn?.attributes?.['w:type'];
        return !type || (type !== 'separator' && type !== 'continuationSeparator');
      });
      expect(regularFootnoteIds.length).toBeGreaterThan(0);

      // Import and export
      const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
      const { editor: testEditor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
      editor = testEditor;

      // Verify footnotes were imported
      expect(editor.converter.footnotes).toBeDefined();
      expect(editor.converter.footnotes.length).toBeGreaterThan(0);

      // Export
      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      expect(exportedBuffer?.byteLength || exportedBuffer?.length || 0).toBeGreaterThan(0);

      // Verify exported footnotes
      const exportedZipper = new DocxZipper();
      const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);
      const exportedFootnotesEntry = exportedFiles.find((f) => f.name === 'word/footnotes.xml');
      expect(exportedFootnotesEntry).toBeDefined();

      const exportedFootnotesJson = parseXmlToJson(exportedFootnotesEntry.content);
      const exportedRoot = findFootnotesRoot(exportedFootnotesJson);
      expect(exportedRoot).toBeDefined();

      // Verify all regular footnotes are present
      regularFootnoteIds.forEach((id) => {
        const exportedFn = findFootnoteById(exportedRoot, id);
        expect(exportedFn).toBeDefined();
        expect(exportedFn.attributes?.['w:id']).toBe(id);
      });
    });

    it('preserves separator config and footnote linkage in the variant fixture (SD-3400)', async () => {
      // footnote-tests-B carries explicit separator/continuationSeparator notes
      // and the settings.xml special-footnote list — the configuration variants
      // from the SD-3400 Observatory check.
      const docxPath = join(__dirname, '../data', 'footnote-tests-B.docx');
      const docxBuffer = await fs.readFile(docxPath);

      const originalZipper = new DocxZipper();
      const originalFiles = await originalZipper.getDocxData(docxBuffer, true);
      const originalFootnotesJson = parseXmlToJson(originalFiles.find((f) => f.name === 'word/footnotes.xml').content);
      const originalRoot = findFootnotesRoot(originalFootnotesJson);
      const regularIds = collectFootnoteIds(originalRoot).filter((id) => {
        const type = findFootnoteById(originalRoot, id)?.attributes?.['w:type'];
        return !type || (type !== 'separator' && type !== 'continuationSeparator');
      });
      expect(regularIds.length).toBeGreaterThan(0);

      const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
      const { editor: testEditor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
      editor = testEditor;

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedZipper = new DocxZipper();
      const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);
      const exportedRoot = findFootnotesRoot(
        parseXmlToJson(exportedFiles.find((f) => f.name === 'word/footnotes.xml').content),
      );

      // Every regular footnote survives with its id.
      regularIds.forEach((id) => {
        expect(findFootnoteById(exportedRoot, id)).toBeTruthy();
      });
      // Separator notes survive with their types and reserved ids.
      expect(findFootnotesByType(exportedRoot, 'separator').map((el) => el.attributes['w:id'])).toEqual(['-1']);
      expect(findFootnotesByType(exportedRoot, 'continuationSeparator').map((el) => el.attributes['w:id'])).toEqual([
        '0',
      ]);
      // The settings.xml special-footnote list (§17.11.9) survives export.
      const settingsPr = findFootnotePrInSettings(findSettingsXml(exportedFiles));
      expect(settingsPr).toBeTruthy();
      const listedIds = (settingsPr.elements ?? [])
        .filter((el) => el.name === 'w:footnote')
        .map((el) => el.attributes?.['w:id']);
      expect(listedIds).toContain('-1');
      expect(listedIds).toContain('0');
      // Body references survive in document order.
      const exportedBody = parseXmlToJson(exportedFiles.find((f) => f.name === 'word/document.xml').content);
      const refIds = [];
      const walk = (node) => {
        if (node?.name === 'w:footnoteReference') refIds.push(node.attributes?.['w:id']);
        (node?.elements ?? []).forEach(walk);
      };
      walk(exportedBody.elements?.[0]);
      expect(refIds).toEqual(regularIds);
    });

    it('preserves footnoteReference nodes in document body', async () => {
      const docxPath = join(__dirname, '../data', DOCX_FIXTURE_NAME);
      const docxBuffer = await fs.readFile(docxPath);

      const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
      const { editor: testEditor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
      editor = testEditor;

      // Count footnoteReference nodes in editor
      let footnoteRefCount = 0;
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'footnoteReference') {
          footnoteRefCount++;
        }
      });
      expect(footnoteRefCount).toBeGreaterThan(0);

      // Export and verify
      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedZipper = new DocxZipper();
      const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);
      const documentEntry = exportedFiles.find((f) => f.name === 'word/document.xml');
      expect(documentEntry).toBeDefined();

      const documentJson = parseXmlToJson(documentEntry.content);
      const documentXml = documentEntry.content;

      // Verify footnoteReference elements exist in exported XML
      expect(documentXml).toContain('w:footnoteReference');
    });

    it('flushes active live footnote sessions before host-level DOCX export', async () => {
      const docxPath = join(__dirname, '../data', DOCX_FIXTURE_NAME);
      const docxBuffer = await fs.readFile(docxPath);

      const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
      const { editor: testEditor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
      editor = testEditor;

      const liveFootnote = editor.converter.footnotes.find((entry) => {
        const type = entry?.type;
        return type !== 'separator' && type !== 'continuationSeparator';
      });
      expect(liveFootnote).toBeDefined();

      const noteId = String(liveFootnote.id);
      const runtime = resolveNoteRuntime(editor, {
        kind: 'story',
        storyType: 'footnote',
        noteId,
      });
      const liveText = 'Live export session regression text';

      runtime.editor.commands.selectAll();
      runtime.editor.commands.insertContent(liveText);

      const unregister = registerLiveStorySessionRuntime(editor, runtime, runtime.editor);

      try {
        const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });
        const exportedFootnotesXml = updatedDocs['word/footnotes.xml'];
        expect(exportedFootnotesXml).toBeTruthy();

        const exportedFootnotesJson = parseXmlToJson(exportedFootnotesXml);
        const exportedRoot = findFootnotesRoot(exportedFootnotesJson);
        const exportedFn = findFootnoteById(exportedRoot, noteId);

        expect(exportedFn).toBeDefined();
        expect(extractTextContent(exportedFn)).toContain(liveText);
      } finally {
        unregister();
      }
    });
  });

  // ------------------------------------------
  // Separator Footnotes Tests
  // ------------------------------------------

  describe('separator footnotes', () => {
    it('preserves separator footnotes (w:type="separator") through roundtrip', async () => {
      const docxPath = join(__dirname, '../data', DOCX_FIXTURE_NAME);
      const docxBuffer = await fs.readFile(docxPath);

      // Get original separators
      const originalZipper = new DocxZipper();
      const originalFiles = await originalZipper.getDocxData(docxBuffer, true);
      const originalFootnotesEntry = originalFiles.find((f) => f.name === 'word/footnotes.xml');
      const originalFootnotesJson = parseXmlToJson(originalFootnotesEntry.content);
      const originalRoot = findFootnotesRoot(originalFootnotesJson);

      const originalSeparators = findFootnotesByType(originalRoot, 'separator');
      const originalContinuationSeparators = findFootnotesByType(originalRoot, 'continuationSeparator');

      // Import and export
      const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
      const { editor: testEditor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
      editor = testEditor;

      // Verify separators were imported
      const importedSeparators = editor.converter.footnotes.filter(
        (fn) => fn.type === 'separator' || fn.type === 'continuationSeparator',
      );
      expect(importedSeparators.length).toBe(originalSeparators.length + originalContinuationSeparators.length);

      // Export
      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedZipper = new DocxZipper();
      const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);
      const exportedFootnotesEntry = exportedFiles.find((f) => f.name === 'word/footnotes.xml');
      const exportedFootnotesJson = parseXmlToJson(exportedFootnotesEntry.content);
      const exportedRoot = findFootnotesRoot(exportedFootnotesJson);

      // Verify separators preserved
      const exportedSeparators = findFootnotesByType(exportedRoot, 'separator');
      const exportedContinuationSeparators = findFootnotesByType(exportedRoot, 'continuationSeparator');

      expect(exportedSeparators.length).toBe(originalSeparators.length);
      expect(exportedContinuationSeparators.length).toBe(originalContinuationSeparators.length);
    });
  });

  // ------------------------------------------
  // Content Types Tests
  // ------------------------------------------

  describe('content types', () => {
    it('includes footnotes.xml override in [Content_Types].xml', async () => {
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
      expect(hasContentTypeOverride(contentTypes, '/word/footnotes.xml')).toBe(true);
    });

    it('includes footnotes relationship in document.xml.rels', async () => {
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
      expect(hasFootnotesRelationship(rels)).toBe(true);
    });
  });

  // ------------------------------------------
  // w:footnoteRef Marker Tests
  // ------------------------------------------

  describe('w:footnoteRef marker', () => {
    it('includes w:footnoteRef in regular footnote content', async () => {
      const docxPath = join(__dirname, '../data', DOCX_FIXTURE_NAME);
      const docxBuffer = await fs.readFile(docxPath);

      const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
      const { editor: testEditor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
      editor = testEditor;

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedZipper = new DocxZipper();
      const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);
      const exportedFootnotesEntry = exportedFiles.find((f) => f.name === 'word/footnotes.xml');
      const exportedFootnotesJson = parseXmlToJson(exportedFootnotesEntry.content);
      const exportedRoot = findFootnotesRoot(exportedFootnotesJson);

      // Find regular footnotes (not separators)
      const regularFootnotes =
        exportedRoot?.elements?.filter((el) => {
          if (el?.name !== 'w:footnote') return false;
          const type = el.attributes?.['w:type'];
          return !type || (type !== 'separator' && type !== 'continuationSeparator');
        }) || [];

      expect(regularFootnotes.length).toBeGreaterThan(0);

      // Each regular footnote should have w:footnoteRef
      regularFootnotes.forEach((fn) => {
        expect(hasFootnoteRef(fn)).toBe(true);
      });
    });
  });
});

// ============================================
// Unit Tests for Export Functions
// ============================================

describe('footnotesExporter unit tests', () => {
  describe('createFootnoteElement', () => {
    it('returns original XML for separator footnotes', () => {
      const separatorXml = {
        type: 'element',
        name: 'w:footnote',
        attributes: { 'w:id': '-1', 'w:type': 'separator' },
        elements: [{ name: 'w:p', elements: [] }],
      };

      const footnote = {
        id: '-1',
        type: 'separator',
        originalXml: separatorXml,
        content: [],
      };

      const result = createFootnoteElement(footnote, {});
      expect(result).toBeDefined();
      expect(result.attributes['w:type']).toBe('separator');
      expect(result.attributes['w:id']).toBe('-1');
    });

    it('creates footnote element with translated content', () => {
      const footnote = {
        id: '1',
        type: null,
        originalXml: {
          type: 'element',
          name: 'w:footnote',
          attributes: { 'w:id': '1' },
          elements: [
            {
              name: 'w:p',
              elements: [
                { name: 'w:r', elements: [{ name: 'w:footnoteRef' }] },
                { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Test' }] }] },
              ],
            },
          ],
        },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test' }] }],
      };

      const exportContext = {
        editor: { schema: {}, extensionService: { extensions: [] } },
        editorSchema: {},
        converter: {},
      };

      const result = createFootnoteElement(footnote, exportContext);
      expect(result).toBeDefined();
      expect(result.name).toBe('w:footnote');
      expect(result.attributes['w:id']).toBe('1');
    });

    it('adds superscript formatting to generated w:footnoteRef run', () => {
      const footnote = {
        id: '1',
        type: null,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inserted from command' }] }],
      };

      const exportContext = {
        editor: { schema: {}, extensionService: { extensions: [] } },
        editorSchema: {},
        converter: {},
      };

      const result = createFootnoteElement(footnote, exportContext);
      expect(result).toBeDefined();

      const paragraph = result.elements?.find((el) => el?.name === 'w:p');
      const markerRun =
        paragraph?.elements?.find((el) => el?.name === 'w:r' && hasFootnoteRef(el)) || paragraph?.elements?.[0];
      const runProps = markerRun?.elements?.find((el) => el?.name === 'w:rPr');
      expect(runProps).toBeDefined();

      const runStyle = runProps?.elements?.find((el) => el?.name === 'w:rStyle');
      expect(runStyle?.attributes?.['w:val']).toBe('FootnoteReference');

      const vertAlign = runProps?.elements?.find((el) => el?.name === 'w:vertAlign');
      expect(vertAlign?.attributes?.['w:val']).toBe('superscript');
    });

    it('does not add w:footnoteRef if original did not have one (custom mark)', () => {
      // Simulate a custom mark footnote - original has no w:footnoteRef
      const originalXmlNoFootnoteRef = {
        type: 'element',
        name: 'w:footnote',
        attributes: { 'w:id': '1' },
        elements: [
          {
            name: 'w:p',
            elements: [
              // No w:footnoteRef here - this is a custom mark footnote
              { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Custom' }] }] },
            ],
          },
        ],
      };

      const footnote = {
        id: '1',
        type: null,
        originalXml: originalXmlNoFootnoteRef,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Custom' }] }],
      };

      const exportContext = {
        editor: { schema: {}, extensionService: { extensions: [] } },
        editorSchema: {},
        converter: {},
      };

      const result = createFootnoteElement(footnote, exportContext);
      expect(result).toBeDefined();

      // Should NOT have w:footnoteRef since original didn't have one
      expect(hasFootnoteRef(result)).toBe(false);
    });
  });

  describe('prepareFootnotesXmlForExport', () => {
    it('returns unchanged xml when no footnotes', () => {
      const convertedXml = { 'word/document.xml': {} };
      const result = prepareFootnotesXmlForExport({
        footnotes: [],
        editor: {},
        converter: {},
        convertedXml,
      });

      expect(result.updatedXml).toEqual(convertedXml);
      expect(result.relationships).toEqual([]);
    });

    it('creates footnotes.xml when footnotes exist', () => {
      const footnote = {
        id: '1',
        type: null,
        originalXml: {
          type: 'element',
          name: 'w:footnote',
          attributes: { 'w:id': '1' },
          elements: [
            {
              name: 'w:p',
              elements: [{ name: 'w:r', elements: [{ name: 'w:footnoteRef' }] }],
            },
          ],
        },
        content: [{ type: 'paragraph', content: [] }],
      };

      const result = prepareFootnotesXmlForExport({
        footnotes: [footnote],
        editor: { schema: {} },
        converter: {},
        convertedXml: {},
      });

      expect(result.updatedXml['word/footnotes.xml']).toBeDefined();
      expect(result.relationships.length).toBeGreaterThan(0);
      expect(result.relationships[0].attributes.Target).toBe('footnotes.xml');
    });
  });

  describe('export pruning of session-deleted notes (SD-3400 tombstones, zip-time transform)', () => {
    const makePart = (entries, noteName = 'w:footnote', rootName = 'w:footnotes') => ({
      elements: [
        {
          type: 'element',
          name: rootName,
          elements: entries.map((e) => ({
            type: 'element',
            name: noteName,
            attributes: { 'w:id': e.id, ...(e.type ? { 'w:type': e.type } : {}) },
            elements: [{ name: 'w:p', elements: [] }],
          })),
        },
      ],
    });

    const makeDocumentXml = (referencedIds, refName = 'w:footnoteReference') => ({
      elements: [
        {
          name: 'w:document',
          elements: [
            {
              name: 'w:body',
              elements: referencedIds.map((id) => ({
                name: 'w:p',
                elements: [
                  {
                    name: 'w:r',
                    elements: [{ name: refName, attributes: { 'w:id': id } }],
                  },
                ],
              })),
            },
          ],
        },
      ],
    });

    const prunedIds = (part, noteName = 'w:footnote') =>
      part.elements[0].elements.filter((el) => el.name === noteName).map((el) => el.attributes['w:id']);

    const makeConverter = (registered) => ({
      sessionManagedNoteIds: { footnotes: new Set(registered), endnotes: new Set() },
    });

    it('prunes a session-deleted note with no reference in the exported document', () => {
      const part = makePart([{ id: '1' }, { id: '2' }]);
      const pruned = pruneSessionDeletedNotesPart(part, {
        converter: makeConverter(['2']),
        documentXml: makeDocumentXml(['1']),
        type: 'footnote',
      });

      expect(prunedIds(pruned)).toEqual(['1']);
      // Pure transform: the input part keeps the tombstone (store intact).
      expect(prunedIds(part)).toEqual(['1', '2']);
    });

    it('keeps a session-deleted note whose reference is present (undo restored the marker)', () => {
      const part = makePart([{ id: '1' }, { id: '2' }]);
      const pruned = pruneSessionDeletedNotesPart(part, {
        converter: makeConverter(['2']),
        documentXml: makeDocumentXml(['1', '2']),
        type: 'footnote',
      });

      expect(prunedIds(pruned)).toEqual(['1', '2']);
    });

    it('never prunes separator/continuationSeparator entries even when registered', () => {
      const part = makePart([{ id: '-1', type: 'separator' }, { id: '0', type: 'continuationSeparator' }, { id: '1' }]);
      const pruned = pruneSessionDeletedNotesPart(part, {
        converter: makeConverter(['-1', '0', '1']),
        documentXml: makeDocumentXml([]),
        type: 'footnote',
      });

      expect(prunedIds(pruned)).toEqual(['-1', '0']);
    });

    it('preserves pre-existing unreferenced notes that were never session-deleted (Round-Trip Principle)', () => {
      const part = makePart([{ id: '1' }, { id: '9' }]);
      const pruned = pruneSessionDeletedNotesPart(part, {
        converter: makeConverter(['1']),
        documentXml: makeDocumentXml(['1']),
        type: 'footnote',
      });

      expect(prunedIds(pruned)).toEqual(['1', '9']);
    });

    it('prunes to an empty (but rewritten) part when the only note is session-deleted and separator-less', () => {
      // Some third-party producers omit separators; the exported part must be
      // the pruned copy, never the stale input carrying the deleted text.
      const part = makePart([{ id: '3' }]);
      const pruned = pruneSessionDeletedNotesPart(part, {
        converter: makeConverter(['3']),
        documentXml: makeDocumentXml([]),
        type: 'footnote',
      });

      expect(prunedIds(pruned)).toEqual([]);
      expect(pruned).not.toBe(part);
    });

    it('returns the part untouched when no ids are session-managed (imported docs export as before)', () => {
      const part = makePart([{ id: '1' }, { id: '9' }]);
      const pruned = pruneSessionDeletedNotesPart(part, {
        converter: {},
        documentXml: makeDocumentXml(['1']),
        type: 'footnote',
      });

      expect(pruned).toBe(part);
    });

    it('endnote symmetry: prunes via w:endnoteReference scan and the endnotes registry', () => {
      const part = makePart([{ id: '1' }, { id: '2' }], 'w:endnote', 'w:endnotes');
      const converter = { sessionManagedNoteIds: { footnotes: new Set(), endnotes: new Set(['1', '2']) } };
      const pruned = pruneSessionDeletedNotesPart(part, {
        converter,
        documentXml: makeDocumentXml(['2'], 'w:endnoteReference'),
        type: 'endnote',
      });

      expect(prunedIds(pruned, 'w:endnote')).toEqual(['2']);
    });
  });
});

// ============================================
// Unit Tests for Import Functions
// ============================================

describe('documentFootnotesImporter unit tests', () => {
  describe('importFootnoteData', () => {
    it('imports regular footnotes with content', () => {
      const footnotesXml = parseXmlToJson(
        '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          '<w:footnote w:id="1"><w:p><w:r><w:t>Test content</w:t></w:r></w:p></w:footnote>' +
          '</w:footnotes>',
      );

      const docx = { 'word/footnotes.xml': footnotesXml };
      const converter = {};
      const editor = { emit: () => {} };

      const result = importFootnoteData({ docx, editor, converter });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
      expect(result[0].content.length).toBeGreaterThan(0);
    });

    it('preserves separator footnotes with originalXml', () => {
      const footnotesXml = parseXmlToJson(
        '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          '<w:footnote w:id="-1" w:type="separator"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>' +
          '<w:footnote w:id="0" w:type="continuationSeparator"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>' +
          '</w:footnotes>',
      );

      const docx = { 'word/footnotes.xml': footnotesXml };
      const converter = {};
      const editor = { emit: () => {} };

      const result = importFootnoteData({ docx, editor, converter });

      expect(result.length).toBe(2);

      const separator = result.find((fn) => fn.type === 'separator');
      expect(separator).toBeDefined();
      expect(separator.originalXml).toBeDefined();
      expect(separator.content).toEqual([]);

      const continuation = result.find((fn) => fn.type === 'continuationSeparator');
      expect(continuation).toBeDefined();
      expect(continuation.originalXml).toBeDefined();
    });

    it('preserves originalXml for regular footnotes', () => {
      const footnotesXml = parseXmlToJson(
        '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          '<w:footnote w:id="1" w:customAttr="value"><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:footnote>' +
          '</w:footnotes>',
      );

      const docx = { 'word/footnotes.xml': footnotesXml };
      const converter = {};
      const editor = { emit: () => {} };

      const result = importFootnoteData({ docx, editor, converter });

      expect(result.length).toBe(1);
      expect(result[0].originalXml).toBeDefined();
      expect(result[0].originalXml.attributes?.['w:customAttr']).toBe('value');
    });
  });
});

// ============================================
// customMarkFollows Tests
// ============================================

describe('customMarkFollows attribute', () => {
  it('imports footnoteReference with customMarkFollows attribute', async () => {
    // Create minimal docx with customMarkFollows
    const documentXml = parseXmlToJson(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body>' +
        '<w:p><w:r><w:footnoteReference w:id="1" w:customMarkFollows="1"/></w:r><w:r><w:t>*</w:t></w:r></w:p>' +
        '</w:body>' +
        '</w:document>',
    );

    const footnotesXml = parseXmlToJson(
      '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:footnote w:id="1"><w:p><w:r><w:t>Custom mark footnote</w:t></w:r></w:p></w:footnote>' +
        '</w:footnotes>',
    );

    const docx = {
      'word/document.xml': documentXml,
      'word/footnotes.xml': footnotesXml,
      'word/styles.xml': minimalStylesXml,
    };

    // Import using createDocumentJson
    const { createDocumentJson } = await import('@converter/v2/importer/docxImporter.js');
    const converter = { headers: {}, footers: {}, headerIds: {}, footerIds: {}, docHiglightColors: new Set() };
    const editor = { options: {}, emit: () => {} };

    const result = createDocumentJson(docx, converter, editor);
    expect(result).toBeTruthy();

    // Find footnoteReference node
    let foundCustomMark = false;
    const walk = (node) => {
      if (!node) return;
      if (node.type === 'footnoteReference' && node.attrs?.customMarkFollows === true) {
        foundCustomMark = true;
      }
      if (Array.isArray(node.content)) {
        node.content.forEach(walk);
      }
    };
    walk(result.pmDoc);

    expect(foundCustomMark).toBe(true);
  });
});

// ============================================
// Bootstrap ID uniqueness regression
// ============================================

describe('bootstrapped notes part produces unique ids', () => {
  it('creates separator=-1, continuationSeparator=0, first real note=1 with no duplicates', async () => {
    // Import the bootstrap helper and the OOXML mutation helper
    const { bootstrapNotesPart, getNotesConfig, addNoteElement } = await import(
      '@core/parts/adapters/notes-part-descriptor.js'
    );

    // Simulate a fresh editor with no footnotes part
    const editor = {
      converter: {
        convertedXml: {
          'word/document.xml': {},
        },
      },
      state: { doc: { descendants: () => {} } },
    };

    // Bootstrap the part (creates separator boilerplate)
    bootstrapNotesPart(editor, 'footnote');

    // Add a real note (simulates what footnotesInsertWrapper does)
    const config = getNotesConfig('footnote');
    const part = editor.converter.convertedXml['word/footnotes.xml'];
    addNoteElement(part, config, '1', 'First real footnote');

    // Extract all w:footnote ids from the OOXML
    const root = part.elements[0];
    const noteElements = root.elements.filter((el) => el.name === 'w:footnote');
    const ids = noteElements.map((el) => el.attributes['w:id']);

    // Must be -1, 0, 1 — all unique, no collisions
    expect(ids).toEqual(expect.arrayContaining(['-1', '0', '1']));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ============================================
// w:footnotePr Properties Tests
// ============================================

describe('w:footnotePr properties', () => {
  it('parses footnotePr from settings.xml', async () => {
    const settingsXml = parseXmlToJson(
      '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:footnotePr>' +
        '<w:numFmt w:val="lowerRoman"/>' +
        '<w:numStart w:val="1"/>' +
        '</w:footnotePr>' +
        '</w:settings>',
    );

    const documentXml = parseXmlToJson(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:body>' +
        '</w:document>',
    );

    const docx = {
      'word/document.xml': documentXml,
      'word/settings.xml': settingsXml,
      'word/styles.xml': minimalStylesXml,
    };

    const { createDocumentJson } = await import('@converter/v2/importer/docxImporter.js');
    const converter = { headers: {}, footers: {}, headerIds: {}, footerIds: {}, docHiglightColors: new Set() };
    const editor = { options: {}, emit: () => {} };

    createDocumentJson(docx, converter, editor);

    expect(converter.footnoteProperties).toBeDefined();
    expect(converter.footnoteProperties.numFmt).toBe('lowerRoman');
    expect(converter.footnoteProperties.numStart).toBe('1');
    expect(converter.footnoteProperties.source).toBe('settings');
  });

  it('parses footnotePr from sectPr', async () => {
    const documentXml = parseXmlToJson(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body>' +
        '<w:p><w:r><w:t>Test</w:t></w:r></w:p>' +
        '<w:sectPr>' +
        '<w:footnotePr>' +
        '<w:numRestart w:val="eachPage"/>' +
        '<w:pos w:val="beneathText"/>' +
        '</w:footnotePr>' +
        '</w:sectPr>' +
        '</w:body>' +
        '</w:document>',
    );

    const docx = {
      'word/document.xml': documentXml,
      'word/styles.xml': minimalStylesXml,
    };

    const { createDocumentJson } = await import('@converter/v2/importer/docxImporter.js');
    const converter = { headers: {}, footers: {}, headerIds: {}, footerIds: {}, docHiglightColors: new Set() };
    const editor = { options: {}, emit: () => {} };

    createDocumentJson(docx, converter, editor);

    expect(converter.footnoteProperties).toBeDefined();
    expect(converter.footnoteProperties.numRestart).toBe('eachPage');
    expect(converter.footnoteProperties.pos).toBe('beneathText');
    expect(converter.footnoteProperties.source).toBe('sectPr');
  });

  it('preserves footnotePr originalXml for roundtrip', async () => {
    const settingsXml = parseXmlToJson(
      '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:footnotePr>' +
        '<w:numFmt w:val="decimal"/>' +
        '<w:unknownElement w:val="preserved"/>' +
        '</w:footnotePr>' +
        '</w:settings>',
    );

    const documentXml = parseXmlToJson(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:body>' +
        '</w:document>',
    );

    const docx = {
      'word/document.xml': documentXml,
      'word/settings.xml': settingsXml,
      'word/styles.xml': minimalStylesXml,
    };

    const { createDocumentJson } = await import('@converter/v2/importer/docxImporter.js');
    const converter = { headers: {}, footers: {}, headerIds: {}, footerIds: {}, docHiglightColors: new Set() };
    const editor = { options: {}, emit: () => {} };

    createDocumentJson(docx, converter, editor);

    expect(converter.footnoteProperties).toBeDefined();
    expect(converter.footnoteProperties.originalXml).toBeDefined();
    expect(converter.footnoteProperties.originalXml.name).toBe('w:footnotePr');

    // Verify unknown elements are preserved in originalXml
    const unknownEl = converter.footnoteProperties.originalXml.elements?.find((el) => el?.name === 'w:unknownElement');
    expect(unknownEl).toBeDefined();
  });
});
