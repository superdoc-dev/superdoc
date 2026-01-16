import { describe, it, expect, beforeAll } from 'vitest';
import { createDocumentJson } from '@converter/v2/importer/docxImporter.js';
import { exportSchemaToJson } from '@converter/exporter.js';
import { getTestDataByFileName } from '@tests/helpers/helpers.js';

const BOOKMARK_DOC = 'bookmark_use_cases.docx';

const collectXmlElements = (elements = [], predicate, acc = []) => {
  if (!Array.isArray(elements)) return acc;

  elements.forEach((el) => {
    if (!el || typeof el !== 'object') return;
    if (predicate(el)) acc.push(el);
    if (Array.isArray(el.elements)) collectXmlElements(el.elements, predicate, acc);
  });

  return acc;
};

const collectPmNodes = (node, predicate, acc = []) => {
  if (!node || typeof node !== 'object') return acc;
  if (predicate(node)) acc.push(node);
  if (Array.isArray(node.content)) node.content.forEach((child) => collectPmNodes(child, predicate, acc));
  return acc;
};

const collectPmBookmarkOrder = (node, acc = []) => {
  if (!node || typeof node !== 'object') return acc;
  if (node.type === 'bookmarkStart') acc.push(`start:${node.attrs?.id}`);
  if (node.type === 'bookmarkEnd') acc.push(`end:${node.attrs?.id}`);
  if (Array.isArray(node.content)) node.content.forEach((child) => collectPmBookmarkOrder(child, acc));
  return acc;
};

const collectXmlBookmarkOrder = (elements = [], acc = []) => {
  if (!Array.isArray(elements)) return acc;
  elements.forEach((el) => {
    if (!el || typeof el !== 'object') return;
    if (el.name === 'w:bookmarkStart') acc.push(`start:${el.attributes?.['w:id']}`);
    if (el.name === 'w:bookmarkEnd') acc.push(`end:${el.attributes?.['w:id']}`);
    if (Array.isArray(el.elements)) collectXmlBookmarkOrder(el.elements, acc);
  });
  return acc;
};

describe('Bookmark import/export round trip', () => {
  let docx;
  let converter;
  let editor;
  let pmDoc;
  let importedBookmarkStarts;
  let importedBookmarkEnds;
  let originalBookmarkStarts;
  let originalBookmarkEnds;
  let originalBookmarkOrder;
  let importedBookmarkOrder;

  beforeAll(async () => {
    docx = await getTestDataByFileName(BOOKMARK_DOC);

    converter = {
      headers: {},
      headerIds: {},
      footers: {},
      footerIds: {},
      docHiglightColors: new Set(),
    };

    editor = {
      options: {},
      extensionService: { extensions: [] },
    };

    const { pmDoc: importedDoc } = createDocumentJson(docx, converter, editor);
    pmDoc = importedDoc;

    importedBookmarkStarts = collectPmNodes(pmDoc, (node) => node.type === 'bookmarkStart');
    importedBookmarkEnds = collectPmNodes(pmDoc, (node) => node.type === 'bookmarkEnd');
    importedBookmarkOrder = collectPmBookmarkOrder(pmDoc, []);

    const documentXml = docx['word/document.xml'];
    const bodyElements = documentXml?.elements?.[0]?.elements ?? [];
    originalBookmarkStarts = collectXmlElements(bodyElements, (el) => el.name === 'w:bookmarkStart');
    originalBookmarkEnds = collectXmlElements(bodyElements, (el) => el.name === 'w:bookmarkEnd');
    originalBookmarkOrder = collectXmlBookmarkOrder(bodyElements, []);
  });

  it('imports all bookmark starts with matching attributes', () => {
    expect(importedBookmarkStarts.length).toBe(originalBookmarkStarts.length);

    const importedById = new Map(importedBookmarkStarts.map((node) => [String(node.attrs?.id), node]));

    originalBookmarkStarts.forEach((bookmark) => {
      const id = String(bookmark.attributes?.['w:id']);
      const originalName = bookmark.attributes?.['w:name'];
      const imported = importedById.get(id);
      expect(imported).toBeTruthy();
      expect(imported.attrs?.id).toBe(id);
      expect(imported.attrs?.name).toBe(originalName);
    });
  });

  it('imports all bookmark ends with matching ids', () => {
    expect(importedBookmarkEnds.length).toBe(originalBookmarkEnds.length);

    const importedById = new Map(importedBookmarkEnds.map((node) => [String(node.attrs?.id), node]));

    originalBookmarkEnds.forEach((bookmark) => {
      const id = String(bookmark.attributes?.['w:id']);
      const imported = importedById.get(id);
      expect(imported).toBeTruthy();
      expect(imported.attrs?.id).toBe(id);
    });
  });

  it('preserves document order of bookmark boundaries', () => {
    expect(importedBookmarkOrder).toEqual(originalBookmarkOrder);
  });

  it('exports bookmark starts retaining original attributes', () => {
    const originalById = new Map(
      originalBookmarkStarts.map((bookmark) => [String(bookmark.attributes?.['w:id']), bookmark.attributes]),
    );

    importedBookmarkStarts.forEach((node) => {
      const exported = exportSchemaToJson({ node, relationships: [], converter, editor });
      expect(exported.name).toBe('w:bookmarkStart');
      const originalAttributes = originalById.get(String(node.attrs?.id));
      expect(exported.attributes).toEqual(originalAttributes);
    });
  });

  it('exports bookmark ends retaining original attributes', () => {
    const originalById = new Map(
      originalBookmarkEnds.map((bookmark) => [String(bookmark.attributes?.['w:id']), bookmark.attributes]),
    );

    importedBookmarkEnds.forEach((node) => {
      const exported = exportSchemaToJson({ node, relationships: [], converter, editor });
      expect(exported.name).toBe('w:bookmarkEnd');
      const originalAttributes = originalById.get(String(node.attrs?.id));
      expect(exported.attributes).toEqual(originalAttributes);
    });
  });
});
