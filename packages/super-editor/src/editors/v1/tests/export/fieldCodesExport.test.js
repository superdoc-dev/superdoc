import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';

const TEST_DOC = 'instrtext-angled-brackets-bug.docx';

describe('field code export', () => {
  let editor;
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(TEST_DOC)));

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  const exportDocx = async () => {
    ({ editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts }));
    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const zipper = new DocxZipper();
    const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
    return exportedFiles.reduce((acc, { name, content }) => {
      acc[name] = content;
      return acc;
    }, {});
  };

  it('escapes reserved characters inside instruction text fields', async () => {
    const files = await exportDocx();
    const footer = files['word/footer1.xml'];
    expect(footer).toBeTruthy();
    expect(footer).toContain('Format=&lt;&lt;NUM&gt;&gt;_&lt;&lt;VER&gt;&gt;');
    expect(footer).not.toContain('Format=<<NUM>>_<<VER>>');
  });

  it('preserves xml:space and surrounding whitespace while escaping instruction text', async () => {
    const files = await exportDocx();
    const footer = files['word/footer1.xml'];
    expect(footer).toContain('<w:instrText xml:space="preserve"> DOCPROPERTY');
    expect(footer).toMatch(/\sFormat=&lt;&lt;NUM&gt;&gt;_&lt;&lt;VER&gt;&gt;\s/);
  });
});
