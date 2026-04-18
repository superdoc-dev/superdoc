import JSZip from 'jszip';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';

const FILENAME = 'anchor_images.docx';
const EXPECTED_MEDIA = ['word/media/image1.png', 'word/media/image2.png', 'word/media/image3.png'];

const getMediaEntries = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  return Object.keys(zip.files)
    .filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
    .sort();
};

describe('DOCX export image persistence', () => {
  let docx;
  let media;
  let mediaFiles;
  let fonts;
  let editor;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(FILENAME));
  });

  beforeEach(() => {
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
  });

  it('preserves embedded images across repeated exports', async () => {
    const firstExportBuffer = await editor.exportDocx();
    const firstMediaEntries = await getMediaEntries(firstExportBuffer);

    expect(firstMediaEntries).toEqual(EXPECTED_MEDIA);

    const secondExportBuffer = await editor.exportDocx();
    const secondMediaEntries = await getMediaEntries(secondExportBuffer);

    expect(secondMediaEntries).toEqual(EXPECTED_MEDIA);
  });
});
