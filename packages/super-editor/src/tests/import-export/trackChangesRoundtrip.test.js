import { beforeAll, describe, it, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '../helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { Editor } from '@core/Editor.js';

const TARGET_TRACK_NAMES = new Set(['w:ins', 'w:del']);

const collectNodesByName = (node, tracker) => {
  if (!node || typeof node !== 'object') return;

  if (TARGET_TRACK_NAMES.has(node.name)) {
    tracker[node.name].push(node);
  }

  if (Array.isArray(node.elements)) {
    node.elements.forEach((child) => collectNodesByName(child, tracker));
  }
};

const containsTextNode = (node, expectedName) => {
  let found = false;
  const visit = (current) => {
    if (!current || typeof current !== 'object' || found) return;
    if (current.name === expectedName) {
      found = true;
      return;
    }
    if (Array.isArray(current.elements)) current.elements.forEach(visit);
  };
  visit(node);
  return found;
};

const collectTrackMarkIds = (doc) => {
  const inserts = new Set();
  const deletes = new Set();

  doc.descendants((node) => {
    node.marks?.forEach((mark) => {
      if (mark.type.name === 'trackInsert') inserts.add(String(mark.attrs.id));
      if (mark.type.name === 'trackDelete') deletes.add(String(mark.attrs.id));
    });
  });

  return {
    insert: [...inserts],
    delete: [...deletes],
  };
};

const collectTrackIdsFromXml = (rootNode) => {
  const ids = { insert: new Set(), delete: new Set() };
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.name === 'w:ins') {
      const id = node.attributes?.['w:id'];
      if (id !== undefined) ids.insert.add(String(id));
    }
    if (node.name === 'w:del') {
      const id = node.attributes?.['w:id'];
      if (id !== undefined) ids.delete.add(String(id));
    }
    if (Array.isArray(node.elements)) node.elements.forEach(visit);
  };
  visit(rootNode);
  return {
    insert: [...ids.insert],
    delete: [...ids.delete],
  };
};

const loadExportedDocumentBody = async (exportedBuffer) => {
  const zipper = new DocxZipper();
  const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
  const documentXmlEntry = exportedFiles.find((entry) => entry.name === 'word/document.xml');
  expect(documentXmlEntry).toBeDefined();

  const documentJson = parseXmlToJson(documentXmlEntry.content);
  const documentNode = documentJson.elements?.find((el) => el.name === 'w:document');
  const body = documentNode?.elements?.find((el) => el.name === 'w:body');
  expect(body).toBeDefined();
  return body;
};

describe('features-redlines tracked changes round trip', () => {
  it('re-exports with tracked changes preserved', async () => {
    const fileName = 'features-redlines-comments-annotations-and-more.docx';
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(fileName);
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const byteLength = exportedBuffer?.byteLength ?? exportedBuffer?.length ?? 0;
    expect(byteLength).toBeGreaterThan(0);

    const zipper = new DocxZipper();
    const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
    const documentXmlEntry = exportedFiles.find((entry) => entry.name === 'word/document.xml');
    expect(documentXmlEntry).toBeDefined();

    const documentJson = parseXmlToJson(documentXmlEntry.content);
    const documentNode = documentJson.elements?.find((el) => el.name === 'w:document');
    const body = documentNode?.elements?.find((el) => el.name === 'w:body');
    expect(body).toBeDefined();

    const tracker = { 'w:ins': [], 'w:del': [] };
    collectNodesByName(body, tracker);

    expect(tracker['w:ins'].length).toBeGreaterThan(0);
    expect(tracker['w:del'].length).toBeGreaterThan(0);

    tracker['w:ins'].forEach((insNode) => {
      expect(containsTextNode(insNode, 'w:t')).toBe(true);
      expect(insNode.attributes?.['w:author']).toBeTruthy();
      expect(insNode.attributes?.['w:id']).toBeTruthy();
    });

    tracker['w:del'].forEach((delNode) => {
      expect(containsTextNode(delNode, 'w:delText')).toBe(true);
      expect(delNode.attributes?.['w:author']).toBeTruthy();
      expect(delNode.attributes?.['w:id']).toBeTruthy();
    });

    const [roundTripFiles] = await Editor.loadXmlData(exportedBuffer, true);
    const roundTripDocEntry = roundTripFiles.find((entry) => entry.name === 'word/document.xml');
    expect(roundTripDocEntry).toBeDefined();

    editor.destroy();
  });
});

const getIntersection = (a = [], b = []) => {
  const other = new Set(b);
  return a.filter((id) => other.has(id));
};

describe('gdocs tracked changes import/export round trip', () => {
  const filename = 'gdocs-tracked-changes.docx';
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
  });

  it('keeps combined add/delete revisions paired through export', async () => {
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    try {
      const initialMarks = collectTrackMarkIds(editor.state.doc);
      expect(initialMarks.insert.length).toBeGreaterThan(0);
      expect(initialMarks.delete.length).toBeGreaterThan(0);
      expect(getIntersection(initialMarks.insert, initialMarks.delete).length).toBeGreaterThan(0);

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedBody = await loadExportedDocumentBody(exportedBuffer);
      const exportedIds = collectTrackIdsFromXml(exportedBody);
      expect(exportedIds.insert.length).toBeGreaterThan(0);
      expect(exportedIds.delete.length).toBeGreaterThan(0);
      expect(getIntersection(exportedIds.insert, exportedIds.delete).length).toBeGreaterThan(0);
    } finally {
      editor.destroy();
    }
  });
});

describe('msword tracked changes import/export round trip', () => {
  const filename = 'msword-tracked-changes.docx';
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
  });

  it('preserves separate add and delete revisions through export', async () => {
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    try {
      const initialMarks = collectTrackMarkIds(editor.state.doc);
      expect(initialMarks.insert.length).toBeGreaterThan(0);
      expect(initialMarks.delete.length).toBeGreaterThan(0);
      expect(getIntersection(initialMarks.insert, initialMarks.delete)).toHaveLength(0);

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedBody = await loadExportedDocumentBody(exportedBuffer);
      const exportedIds = collectTrackIdsFromXml(exportedBody);
      expect(exportedIds.insert.length).toBeGreaterThan(0);
      expect(exportedIds.delete.length).toBeGreaterThan(0);
      expect(getIntersection(exportedIds.insert, exportedIds.delete)).toHaveLength(0);
    } finally {
      editor.destroy();
    }
  });
});
