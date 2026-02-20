import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'fs';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor } from '../helpers/helpers.js';
import { createFootnoteElement, prepareFootnotesXmlForExport } from '@converter/v2/exporter/footnotesExporter.js';
import { importFootnoteData } from '@converter/v2/importer/documentFootnotesImporter.js';
import { carbonCopy } from '@core/utilities/carbonCopy.js';

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
