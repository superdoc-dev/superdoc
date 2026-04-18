import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

describe('Editor markdown export', () => {
  let editor;
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx'));
  });

  beforeEach(() => {
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
  });

  afterEach(() => {
    if (editor) {
      editor.destroy();
      editor = null;
    }
  });

  it('returns markdown string from HTML content', async () => {
    const markdown = await editor.getMarkdown();

    expect(typeof markdown).toBe('string');
  });

  it('converts formatted text to markdown syntax', async () => {
    const { editor: htmlEditor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      html: '<p>Text with <strong>bold</strong> and <em>italic</em>.</p>',
    });

    const markdown = await htmlEditor.getMarkdown();

    expect(markdown).toContain('**bold**');
    expect(markdown).toContain('italic');

    htmlEditor.destroy();
  });
});
