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

const collectTrackFormatMarkIds = (doc) => {
  const formatIds = new Set();

  doc.descendants((node) => {
    node.marks?.forEach((mark) => {
      if (mark.type.name === 'trackFormat') {
        formatIds.add(String(mark.attrs.id));
      }
    });
  });

  return [...formatIds];
};

const collectTextsWithTrackFormatId = (doc, targetId) => {
  const matchingTexts = [];

  doc.descendants((node) => {
    if (!node.isText) return;

    const hasTargetMark = node.marks?.some(
      (mark) => mark.type.name === 'trackFormat' && String(mark.attrs.id) === String(targetId),
    );

    if (hasTargetMark && node.text) {
      matchingTexts.push(node.text);
    }
  });

  return matchingTexts;
};

const replaceEditorDocumentContent = (editor, docJson) => {
  const replacementDoc = editor.schema.nodeFromJSON(docJson);
  const transaction = editor.state.tr.replaceWith(0, editor.state.doc.content.size, replacementDoc.content);
  editor.dispatch(transaction);
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

const collectRunPropertyChangeIdsFromXml = (rootNode) => {
  const ids = new Set();

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.name === 'w:rPrChange') {
      const id = node.attributes?.['w:id'];
      if (id !== undefined) ids.add(String(id));
    }
    if (Array.isArray(node.elements)) node.elements.forEach(visit);
  };

  visit(rootNode);
  return [...ids];
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

  it('combines Word replacements internally while preserving separate OOXML ids on export', async () => {
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
      expect(getIntersection(exportedIds.insert, exportedIds.delete)).toHaveLength(0);
    } finally {
      editor.destroy();
    }
  });
});

describe('tracked format import/export round trip', () => {
  const createTrackedFormatDoc = () => {
    const trackFormatMark = {
      type: 'trackFormat',
      attrs: {
        id: 'format-1',
        author: 'Missy Fox',
        authorEmail: '',
        date: '2026-01-07T20:24:39Z',
        before: [],
        after: [
          { type: 'bold', attrs: { value: true } },
          { type: 'italic', attrs: { value: true } },
        ],
      },
    };

    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'run',
              content: [
                {
                  type: 'text',
                  text: 'Here is some text with updated ',
                },
              ],
            },
            {
              type: 'run',
              content: [
                {
                  type: 'text',
                  text: 'styles',
                  marks: [
                    { type: 'bold', attrs: { value: true } },
                    { type: 'italic', attrs: { value: true } },
                    trackFormatMark,
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  };

  it('exports and reimports trackFormat marks as w:rPrChange revisions', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    try {
      replaceEditorDocumentContent(editor, createTrackedFormatDoc());
      expect(collectTrackFormatMarkIds(editor.state.doc)).toEqual(['format-1']);
      expect(collectTextsWithTrackFormatId(editor.state.doc, 'format-1')).toEqual(['styles']);

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedBody = await loadExportedDocumentBody(exportedBuffer);
      expect(collectRunPropertyChangeIdsFromXml(exportedBody)).toEqual(['format-1']);

      const [reimportedDocx, reimportedMedia, reimportedMediaFiles, reimportedFonts] = await Editor.loadXmlData(
        exportedBuffer,
        true,
      );
      const { editor: reimportedEditor } = await initTestEditor({
        content: reimportedDocx,
        media: reimportedMedia,
        mediaFiles: reimportedMediaFiles,
        fonts: reimportedFonts,
        isHeadless: true,
      });

      try {
        expect(collectTrackFormatMarkIds(reimportedEditor.state.doc)).toEqual(['format-1']);
        expect(collectTextsWithTrackFormatId(reimportedEditor.state.doc, 'format-1')).toEqual(['styles']);
      } finally {
        reimportedEditor.destroy();
      }
    } finally {
      editor.destroy();
    }
  });
});
