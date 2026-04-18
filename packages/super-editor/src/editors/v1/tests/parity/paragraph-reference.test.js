import { beforeAll, describe, expect, it } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { computeParagraphReferenceSnapshot } from '@tests/helpers/paragraphReference.js';
import { zipFolderToBuffer } from '@tests/helpers/zipFolderToBuffer.js';
import { Editor } from '@core/Editor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const findParagraphAt = (doc, predicate) => {
  let match = null;
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    if (predicate(node)) {
      match = { node, pos };
      return false;
    }
  });
  return match;
};

describe('paragraph reference snapshot', () => {
  let basicDocx;
  let listDocx;
  let spacingDocx;

  beforeAll(async () => {
    const basic = await loadTestDataForEditorTests('basic-paragraph.docx');
    basicDocx = basic;
    const list = await loadTestDataForEditorTests('basic-list.docx');
    listDocx = list;
    spacingDocx = await loadTestDataForEditorTests('doc_with_spacing.docx');
  });

  it('captures plain paragraph styling from NodeView logic', () => {
    const { editor } = initTestEditor({
      content: basicDocx.docx,
      media: basicDocx.media,
      mediaFiles: basicDocx.mediaFiles,
      fonts: basicDocx.fonts,
    });

    const match = findParagraphAt(editor.state.doc, () => true);
    expect(match).toBeTruthy();

    const snapshot = computeParagraphReferenceSnapshot(editor, match.node, match.pos);
    expect(snapshot.list).toBeNull();
    expect(snapshot.paragraphProperties).toBeTruthy();
    expect(snapshot.cssFromPPr).toBeTypeOf('object');

    editor.destroy();
  });

  it('captures list paragraph marker styling', () => {
    const { editor } = initTestEditor({
      content: listDocx.docx,
      media: listDocx.media,
      mediaFiles: listDocx.mediaFiles,
      fonts: listDocx.fonts,
    });

    const match = findParagraphAt(editor.state.doc, (node) => Boolean(node.attrs?.listRendering));
    expect(match).toBeTruthy();

    const snapshot = computeParagraphReferenceSnapshot(editor, match.node, match.pos);
    expect(snapshot.list).not.toBeNull();
    expect(snapshot.list.markerText).toBeTruthy();
    expect(snapshot.list.markerRunProps).toBeTruthy();
    expect(snapshot.list.markerCss).toBeTypeOf('object');

    editor.destroy();
  });

  it('captures spacing/indent from styled paragraphs', () => {
    const { editor } = initTestEditor({
      content: spacingDocx.docx,
      media: spacingDocx.media,
      mediaFiles: spacingDocx.mediaFiles,
      fonts: spacingDocx.fonts,
    });

    let match = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return;
      const snapshot = computeParagraphReferenceSnapshot(editor, node, pos);
      if (snapshot.paragraphProperties.spacing || snapshot.paragraphProperties.indent) {
        match = snapshot;
        return false;
      }
    });
    expect(match).toBeTruthy();
    expect(match.paragraphProperties.spacing || match.paragraphProperties.indent).toBeTruthy();

    editor.destroy();
  });

  it('captures tab stop data when present', async () => {
    const buffer = await zipFolderToBuffer(join(__dirname, '../data/tab_stops_basic_test'));
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    let paraIndex = -1;
    let match = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return;
      paraIndex += 1;
      // Paragraph index 3 (0-based) has a custom tab stop in the fixture
      if (paraIndex === 3) {
        match = { node, pos };
        return false;
      }
    });
    expect(match).toBeTruthy();

    const snapshot = computeParagraphReferenceSnapshot(editor, match.node, match.pos);
    expect(snapshot.paragraphProperties.tabStops).toBeTruthy();
    expect(snapshot.paragraphProperties.tabStops.length).toBeGreaterThan(0);

    editor.destroy();
  });
});
