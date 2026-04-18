import JSZip from 'jszip';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import {
  replaceSelectionWithImagePlaceholder,
  uploadAndInsertImage,
} from '@extensions/image/imageHelpers/startImageUpload.js';
import { imageBase64 } from './data/imageBase64.js';

describe('DOCX export image filenames', () => {
  window.URL.createObjectURL = vi.fn().mockImplementation((file) => file.name);

  const filename = 'blank-doc.docx';
  let docx, media, mediaFiles, fonts, editor;

  beforeAll(async () => ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename)));

  beforeEach(() => ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts })));

  it('exports sanitized media filenames without breaking relationships', async () => {
    const blob = await fetch(imageBase64).then((res) => res.blob());
    const weirdName = 'Screenshot_2025-09-22 at 3.45.41\u202fPM.png';
    const firstId = {};

    replaceSelectionWithImagePlaceholder({
      view: editor.view,
      editorOptions: editor.options,
      id: firstId,
    });

    editor.options.handleImageUpload = vi.fn().mockResolvedValue(imageBase64);

    await uploadAndInsertImage({
      editor,
      view: editor.view,
      file: new File([blob], weirdName, { type: 'image/png' }),
      size: { width: 120, height: 120 },
      id: firstId,
    });

    const endPos = editor.state.doc.content.size;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, endPos)));

    const secondId = {};
    replaceSelectionWithImagePlaceholder({
      view: editor.view,
      editorOptions: editor.options,
      id: secondId,
    });

    await uploadAndInsertImage({
      editor,
      view: editor.view,
      file: new File([blob], weirdName, { type: 'image/png' }),
      size: { width: 80, height: 80 },
      id: secondId,
    });

    const buffer = await editor.exportDocx();

    const zip = await JSZip.loadAsync(buffer);

    const mediaEntries = Object.keys(zip.files)
      .filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
      .sort();

    expect(mediaEntries).toEqual([
      'word/media/Screenshot_2025-09-22_at_3.45.41_PM-1.png',
      'word/media/Screenshot_2025-09-22_at_3.45.41_PM.png',
    ]);

    mediaEntries.forEach((entry) => {
      expect(entry.includes('\u202f')).toBe(false);
    });

    const relsXml = await zip.file('word/_rels/document.xml.rels').async('string');
    expect(relsXml).toContain('Screenshot_2025-09-22_at_3.45.41_PM.png');
    expect(relsXml).toContain('Screenshot_2025-09-22_at_3.45.41_PM-1.png');
    expect(relsXml.includes('\u202f')).toBe(false);

    const documentXml = await zip.file('word/document.xml').async('string');
    const docPrMatches = [...documentXml.matchAll(/<wp:docPr[^>]*id="([^"]+)"/g)];
    expect(docPrMatches.length).toBeGreaterThan(0);
    docPrMatches.forEach((match) => {
      const [, value] = match;
      expect(Number.isFinite(Number(value))).toBe(true);
    });
  });
});
