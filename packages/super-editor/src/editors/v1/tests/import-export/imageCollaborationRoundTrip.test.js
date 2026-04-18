import { describe, it, expect, vi } from 'vitest';
import { Doc as YDoc } from 'yjs';
import { Awareness } from 'y-protocols/awareness.js';
import JSZip from 'jszip';

import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { Editor } from '@core/Editor.js';

const FILENAME = 'anchor_images.docx';
const RED_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const BLUE_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4EIwAhSAwYAQY4B/b6IxjQAAAAASUVORK5CYII=';
const RED_PIXEL_BASE64 = RED_PIXEL.split(',')[1];

const createProviderStub = (ydoc) => ({
  synced: true,
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
  awareness: new Awareness(ydoc),
});

const insertCollaborationImage = ({ editor, ydoc, mediaPath, fileData }) => {
  editor.storage.image.media[mediaPath] = fileData;

  const inserted = editor.commands.setImage({ src: mediaPath });
  if (!inserted) {
    throw new Error('Failed to insert image content');
  }

  if (ydoc && editor.commands.addImageToCollaboration) {
    const added = editor.commands.addImageToCollaboration({ mediaPath, fileData });
    if (!added) {
      throw new Error('Failed to push image into collaboration map');
    }
  }
};

const destroyEditor = (editor, { preserveYdoc = false } = {}) => {
  if (!editor) return;
  if (preserveYdoc) {
    editor.options.ydoc = null;
    editor.options.collaborationProvider = null;
  }
  editor.destroy();
};

const getRelationshipsFromDocx = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const relsFile = zip.files['word/_rels/document.xml.rels'];
  if (!relsFile) return [];

  const relsContent = await relsFile.async('string');
  const rels = [];
  const relRegex = /<Relationship[^>]*>/g;
  const matches = relsContent.match(relRegex) || [];

  matches.forEach((match) => {
    const idMatch = match.match(/Id="([^"]+)"/);
    const targetMatch = match.match(/Target="([^"]+)"/);
    if (idMatch && targetMatch) {
      rels.push({ id: idMatch[1], target: targetMatch[1] });
    }
  });
  return rels;
};

const getMediaFromDocx = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const media = {};

  await Promise.all(
    Object.entries(zip.files).map(async ([path, file]) => {
      if (path.startsWith('word/media/') && !file.dir) {
        media[path] = await file.async('base64');
      }
    }),
  );

  return media;
};

const getXmlFromDocx = async (buffer, path) => {
  const zip = await JSZip.loadAsync(buffer);
  return zip.files[path]?.async('string');
};

const findRelationshipByFilename = (relationships, filename) => {
  return relationships.find((rel) => rel.target.includes(filename));
};

describe('image collaboration round trip', () => {
  it('exports collaboration images and restores them on reopen', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(FILENAME);
    const ydoc = new YDoc();
    const provider = createProviderStub(ydoc);

    const { editor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      ydoc,
      collaborationProvider: provider,
      isNewFile: false,
    });

    const mediaPath = 'word/media/collaboration-test-image.png';
    insertCollaborationImage({ editor, ydoc, mediaPath, fileData: RED_PIXEL });

    const exported = await editor.exportDocx();
    const relationships = await getRelationshipsFromDocx(exported);
    const rel = findRelationshipByFilename(relationships, 'collaboration-test-image.png');
    expect(rel).toBeDefined();

    const documentXml = await getXmlFromDocx(exported, 'word/document.xml');
    expect(documentXml).toContain(rel.id);

    const mediaEntries = await getMediaFromDocx(exported);
    expect(mediaEntries[mediaPath]).toBe(RED_PIXEL_BASE64);

    const [importedDocx, importedMedia, importedMediaFiles, importedFonts] = await Editor.loadXmlData(exported, true);
    const { editor: reopened } = initTestEditor({
      content: importedDocx,
      media: importedMedia,
      mediaFiles: importedMediaFiles,
      fonts: importedFonts,
      isNewFile: false,
    });

    await vi.waitFor(() => {
      expect(reopened.storage.image.media[mediaPath]).toBeDefined();
    });

    destroyEditor(editor, { preserveYdoc: true });
    destroyEditor(reopened);
    ydoc.destroy();
  });

  it('syncs images between collaborators through the Yjs media map', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(FILENAME);
    const sharedYdoc = new YDoc();

    const { editor: editorA } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      ydoc: sharedYdoc,
      collaborationProvider: createProviderStub(sharedYdoc),
      isNewFile: false,
    });

    const { editor: editorB } = initTestEditor({
      content: docx,
      media: { ...media },
      mediaFiles: { ...mediaFiles },
      fonts,
      ydoc: sharedYdoc,
      collaborationProvider: createProviderStub(sharedYdoc),
      isNewFile: false,
    });

    const mediaPath = 'word/media/user-a-upload.png';

    insertCollaborationImage({ editor: editorA, ydoc: sharedYdoc, mediaPath, fileData: BLUE_PIXEL });

    await vi.waitFor(() => {
      expect(editorB.storage.image.media[mediaPath]).toBe(BLUE_PIXEL);
    });

    const collaboratorExport = await editorB.exportDocx();
    const relationships = await getRelationshipsFromDocx(collaboratorExport);
    const rel = findRelationshipByFilename(relationships, 'user-a-upload.png');
    expect(rel).toBeDefined();

    destroyEditor(editorA, { preserveYdoc: true });
    destroyEditor(editorB, { preserveYdoc: true });
    sharedYdoc.destroy();
  });

  it('preserves relationship ids for collaboration images across export cycles', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(FILENAME);
    const ydoc = new YDoc();
    const provider = createProviderStub(ydoc);

    const { editor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      ydoc,
      collaborationProvider: provider,
      isNewFile: false,
    });

    const mediaPath = 'word/media/preserved-id.png';
    insertCollaborationImage({ editor, ydoc, mediaPath, fileData: RED_PIXEL });

    const exportOne = await editor.exportDocx();
    const relationshipsOne = await getRelationshipsFromDocx(exportOne);
    const relOne = findRelationshipByFilename(relationshipsOne, 'preserved-id.png');
    expect(relOne).toBeDefined();

    const [docxTwo, mediaTwo, mediaFilesTwo, fontsTwo] = await Editor.loadXmlData(exportOne, true);
    const { editor: reopened } = initTestEditor({
      content: docxTwo,
      media: mediaTwo,
      mediaFiles: mediaFilesTwo,
      fonts: fontsTwo,
      isNewFile: false,
    });

    const exportTwo = await reopened.exportDocx();
    const relationshipsTwo = await getRelationshipsFromDocx(exportTwo);
    const relTwo = findRelationshipByFilename(relationshipsTwo, 'preserved-id.png');
    expect(relTwo).toBeDefined();
    expect(relTwo.id).toBe(relOne.id);

    destroyEditor(editor, { preserveYdoc: true });
    destroyEditor(reopened);
    ydoc.destroy();
  });
});
