import { describe, it, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '../helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';

const countTrackNodes = (node, tracker) => {
  if (!node || typeof node !== 'object') return;
  if (node.name === 'w:ins') tracker.ins += 1;
  if (node.name === 'w:del') tracker.del += 1;
  if (Array.isArray(node.elements)) node.elements.forEach((child) => countTrackNodes(child, tracker));
};

const loadExportedHeaderCensus = async (exportedBuffer) => {
  const zipper = new DocxZipper();
  const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
  const headerXmlEntry = exportedFiles.find((entry) => entry.name === 'word/header1.xml');
  expect(headerXmlEntry).toBeDefined();

  const headerJson = parseXmlToJson(headerXmlEntry.content);
  const tracker = { ins: 0, del: 0 };
  countTrackNodes(headerJson, tracker);
  return tracker;
};

describe('header tracked changes across repeated exports (#3893)', () => {
  // Once a header sub-editor is registered (the UI mounts one as soon as the
  // user clicks into the header), #exportProcessHeadersFooters serializes the
  // converter's persistent import-time header tree. The tracked-change decoders
  // used to strip trackInsert/trackDelete marks off that tree in place, so the
  // first export was correct and every later export silently dropped the
  // header redline — a counterparty's tracked deletion came back as accepted
  // plain text. Saving twice with no intervening edit must produce the same
  // tracked changes both times.
  it('preserves header w:ins/w:del on the second export once a header sub-editor is registered', async () => {
    const fileName = 'header-tracked-changes.docx';
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(fileName);
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
    const { editor: headerSubEditor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    const headerIds = Object.keys(editor.converter.headers);
    expect(headerIds.length).toBeGreaterThan(0);

    // Register a sub-editor for every header part, the way
    // HeaderFooterEditorManager does when a user clicks into a header; the
    // export loop only reads `.editor` off each entry.
    headerIds.forEach((id) => {
      editor.converter.headerEditors.push({ id, editor: headerSubEditor });
    });

    const firstExport = await loadExportedHeaderCensus(await editor.exportDocx({ isFinalDoc: false }));
    expect(firstExport).toEqual({ ins: 1, del: 1 });

    const secondExport = await loadExportedHeaderCensus(await editor.exportDocx({ isFinalDoc: false }));
    expect(secondExport).toEqual({ ins: 1, del: 1 });
  });
});
