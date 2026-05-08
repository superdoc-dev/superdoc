import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { initTestEditor, getTestDataAsFileBuffer } from '../helpers/helpers.js';

const TEST_DOC = 'instrtext-angled-brackets-bug.docx';

async function buildDocxWithFooterRunRtl() {
  const baseBuffer = await getTestDataAsFileBuffer(TEST_DOC);
  const zip = await JSZip.loadAsync(baseBuffer);
  const footerEntry = zip.file('word/footer1.xml');
  if (!footerEntry) throw new Error('word/footer1.xml not found in fixture.');

  const footerXml = await footerEntry.async('string');
  const patchedFooterXml = footerXml.replace(
    /<w:rPr><w:rStyle w:val="PageNumber"\s*\/><\/w:rPr>/,
    '<w:rPr><w:rStyle w:val="PageNumber"/><w:rtl/></w:rPr>',
  );
  zip.file('word/footer1.xml', patchedFooterXml);

  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('footer run-level rtl import/export roundtrip', () => {
  it('preserves w:rtl in footer run properties on export', async () => {
    const patchedBuffer = await buildDocxWithFooterRunRtl();
    const inputFiles = await new DocxZipper().getDocxData(patchedBuffer, true);
    const inputFooter = inputFiles.find((entry) => entry.name === 'word/footer1.xml')?.content;
    expect(inputFooter).toContain('<w:rtl');

    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(patchedBuffer, true);

    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const zipper = new DocxZipper();
    const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
    const footer = exportedFiles.find((entry) => entry.name === 'word/footer1.xml')?.content;

    expect(footer).toBeTruthy();
    expect(footer).toContain('<w:rtl');

    editor.destroy();
  });
});
