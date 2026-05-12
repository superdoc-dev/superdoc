/**
 * Roundtrip test: when a user overrides a style-provided fontSize via the
 * editor, the export should write BOTH <w:sz> and <w:szCs> so mixed-script
 * (Latin + Hebrew/Arabic) content uses the new size for both Latin and CS chars.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { initTestEditor, getTestDataAsFileBuffer } from '../helpers/helpers.js';

const TEST_DOC = 'instrtext-angled-brackets-bug.docx';

const STYLES_WITH_BODY_STYLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr/></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="BodyStyle">
    <w:name w:val="BodyStyle"/>
    <w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
  </w:style>
</w:styles>`;

const DOCUMENT_WITH_BODY_STYLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="BodyStyle"/></w:pPr>
      <w:r><w:t>style-provided body text</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

async function buildBodyStyleDocx() {
  const baseBuffer = await getTestDataAsFileBuffer(TEST_DOC);
  const zip = await JSZip.loadAsync(baseBuffer);
  zip.file('word/styles.xml', STYLES_WITH_BODY_STYLE);
  zip.file('word/document.xml', DOCUMENT_WITH_BODY_STYLE);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const STYLES_DOCDEFAULTS_ONLY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr/></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

const DOCUMENT_WITH_INLINE_RPR_RUN = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
        <w:t>docDefaults sized text</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

async function buildDocDefaultsDocx() {
  const baseBuffer = await getTestDataAsFileBuffer(TEST_DOC);
  const zip = await JSZip.loadAsync(baseBuffer);
  zip.file('word/styles.xml', STYLES_DOCDEFAULTS_ONLY);
  zip.file('word/document.xml', DOCUMENT_WITH_INLINE_RPR_RUN);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('CS companion preservation on style-override roundtrip', () => {
  it('exports both w:sz and w:szCs when user overrides a style-provided fontSize', async () => {
    const buffer = await buildBodyStyleDocx();
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    // Select all text and apply a fontSize override via the editor command
    const docSize = editor.state.doc.content.size;
    editor.commands.setTextSelection({ from: 0, to: docSize });
    const applied = editor.commands.setFontSize('24pt');
    expect(applied, 'setFontSize command should succeed').toBe(true);

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const exportedFiles = await new DocxZipper().getDocxData(exportedBuffer, true);
    const exportedDoc = exportedFiles.find((entry) => entry.name === 'word/document.xml')?.content;

    expect(exportedDoc).toBeTruthy();

    // Find the run containing our text
    const idx = exportedDoc.indexOf('style-provided body text');
    expect(idx).toBeGreaterThan(-1);
    const runOpen = Math.max(exportedDoc.lastIndexOf('<w:r ', idx), exportedDoc.lastIndexOf('<w:r>', idx));
    const runClose = exportedDoc.indexOf('</w:r>', idx);
    const run = exportedDoc.slice(runOpen, runClose + '</w:r>'.length);

    // Override should produce w:sz with the new value (48 half-points = 24pt)
    expect(run, `run XML: ${run}`).toMatch(/<w:sz\s+w:val="48"/);

    // The CS companion should also be present at the same value
    expect(run, `run should have both <w:sz w:val="48"/> AND <w:szCs w:val="48"/>; got: ${run}`).toMatch(
      /<w:szCs\s+w:val="48"/,
    );

    editor.destroy();
  });

  it('exports w:sz and w:szCs when user overrides a docDefaults-provided fontSize', async () => {
    // The run has no inline w:sz; docDefaults provides sz=22. After setFontSize,
    // both w:sz (the override) AND w:szCs (the CS companion) must be in the export
    // so mixed-script text picks up the new size for both Latin and CS chars.
    const buffer = await buildDocDefaultsDocx();
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    const docSize = editor.state.doc.content.size;
    editor.commands.setTextSelection({ from: 0, to: docSize });
    const applied = editor.commands.setFontSize('18pt');
    expect(applied, 'setFontSize command should succeed').toBe(true);

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const exportedFiles = await new DocxZipper().getDocxData(exportedBuffer, true);
    const exportedDoc = exportedFiles.find((entry) => entry.name === 'word/document.xml')?.content;

    expect(exportedDoc).toBeTruthy();

    const idx = exportedDoc.indexOf('docDefaults sized text');
    expect(idx).toBeGreaterThan(-1);
    const runOpen = Math.max(exportedDoc.lastIndexOf('<w:r ', idx), exportedDoc.lastIndexOf('<w:r>', idx));
    const runClose = exportedDoc.indexOf('</w:r>', idx);
    const run = exportedDoc.slice(runOpen, runClose + '</w:r>'.length);

    // 18pt = 36 half-points
    expect(run, `run should have <w:sz w:val="36"/>; got: ${run}`).toMatch(/<w:sz\s+w:val="36"/);
    expect(run, `run should have <w:szCs w:val="36"/>; got: ${run}`).toMatch(/<w:szCs\s+w:val="36"/);

    editor.destroy();
  });
});
