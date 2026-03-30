/* @vitest-environment jsdom */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';

const TEST_DOC = 'advanced-text.docx';

describe('page-number footer export', () => {
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

  const exportFooters = async () => {
    ({ editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, useImmediateSetTimeout: false }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const zipper = new DocxZipper();
    const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
    return exportedFiles.reduce((acc, { name, content }) => {
      acc[name] = content;
      return acc;
    }, {});
  };

  const assertHasWordPageField = (xmlText) => {
    expect(xmlText).not.toContain('sd:autoPageNumber');
    expect(xmlText).not.toContain('sd:totalPageNumber');
    expect(xmlText).toMatch(/<w:fldChar[^>]+fldCharType="begin"/);
    expect(xmlText).toMatch(/<w:instrText[^>]*>\s*PAGE\b/i);
  };

  it('keeps PAGE fields in footers when exporting (no sd placeholders leak)', async () => {
    const files = await exportFooters();

    const footer1 = files['word/footer1.xml'];
    const footer2 = files['word/footer2.xml'];

    expect(footer1).toBeTruthy();
    expect(footer2).toBeTruthy();

    assertHasWordPageField(footer1);
    assertHasWordPageField(footer2);
  });
});
