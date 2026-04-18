import { describe, expect, it } from 'vitest';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { loadTestDataForEditorTests } from '../helpers/helpers.js';

const createHeadlessEditorFromDocx = async (fileName) => {
  const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(fileName);
  return new Editor({
    isHeadless: true,
    extensions: getStarterExtensions(),
    documentId: 'test-doc',
    content: docx,
    mode: 'docx',
    media,
    mediaFiles,
    fonts,
  });
};

describe('getDocumentDefaultStyles', () => {
  it('prefers Normal style ascii font when theme uses different typeface', async () => {
    const editor = await createHeadlessEditorFromDocx('font-formatting-runs.docx');
    const { typeface, fontFamilyCss } = editor.converter.getDocumentDefaultStyles();
    expect(typeface).toBe('Ubuntu');
    expect(fontFamilyCss).toBe('Ubuntu, Arial, sans-serif');
  });

  it('falls back gracefully when w:docDefaults is missing', async () => {
    const editor = await createHeadlessEditorFromDocx('superdoc-hyperlink-cases.docx');
    expect(editor.converter.getDocumentDefaultStyles()).toEqual({ fontSizePt: 10 });
  });
});
