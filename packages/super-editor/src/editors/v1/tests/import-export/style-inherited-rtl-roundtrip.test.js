/**
 * Roundtrip test: a run that inherits w:rtl from a character style must NOT
 * get inline <w:rtl/> flattened onto it during export.
 *
 * Per ECMA Annex I, run rtl participates in the style cascade. If a character
 * style sets <w:rtl/> and a run references that style without inline w:rtl,
 * the export should preserve the style reference, not flatten the rtl into
 * direct formatting on every run.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { initTestEditor, getTestDataAsFileBuffer } from '../helpers/helpers.js';

const TEST_DOC = 'instrtext-angled-brackets-bug.docx';

const RTL_CHAR_STYLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr/></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="character" w:styleId="RtlChar">
    <w:name w:val="RtlChar"/>
    <w:rPr><w:rtl/></w:rPr>
  </w:style>
</w:styles>`;

const DOCUMENT_XML_WITH_STYLE_RTL = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:rStyle w:val="RtlChar"/></w:rPr>
        <w:t>style-inherited rtl run</w:t>
      </w:r>
      <w:r>
        <w:rPr><w:rStyle w:val="RtlChar"/><w:b/></w:rPr>
        <w:t>style-inherited rtl + inline bold</w:t>
      </w:r>
      <w:r>
        <w:rPr><w:rtl/></w:rPr>
        <w:t>inline rtl no style</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

async function buildStyleInheritedRtlDocx() {
  // Take a known-working docx as the base so other parts (font tables, settings, etc.)
  // are present in the right shape, then surgically replace document.xml and styles.xml.
  const baseBuffer = await getTestDataAsFileBuffer(TEST_DOC);
  const zip = await JSZip.loadAsync(baseBuffer);
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/_rels/document.xml.rels', DOC_RELS);
  zip.file('word/document.xml', DOCUMENT_XML_WITH_STYLE_RTL);
  zip.file('word/styles.xml', RTL_CHAR_STYLE_XML);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('style-inherited rtl import/export roundtrip', () => {
  it('does NOT flatten style-inherited w:rtl into inline w:rtl on export', async () => {
    const buffer = await buildStyleInheritedRtlDocx();

    const inputFiles = await new DocxZipper().getDocxData(buffer, true);
    const inputDoc = inputFiles.find((entry) => entry.name === 'word/document.xml')?.content;
    expect(inputDoc).toContain('<w:rStyle w:val="RtlChar"/>');

    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const exportedFiles = await new DocxZipper().getDocxData(exportedBuffer, true);
    const exportedDoc = exportedFiles.find((entry) => entry.name === 'word/document.xml')?.content;

    expect(exportedDoc).toBeTruthy();

    // Helper: extract the run XML containing a given text marker.
    const extractRun = (text) => {
      const idx = exportedDoc.indexOf(text);
      if (idx === -1) return null;
      // Walk backwards to find <w:r> opening
      const start = exportedDoc.lastIndexOf('<w:r ', idx);
      const altStart = exportedDoc.lastIndexOf('<w:r>', idx);
      const runOpen = Math.max(start, altStart);
      const runClose = exportedDoc.indexOf('</w:r>', idx);
      return runOpen >= 0 && runClose >= 0 ? exportedDoc.slice(runOpen, runClose + '</w:r>'.length) : null;
    };

    const styleOnlyRun = extractRun('style-inherited rtl run');
    const styleAndBoldRun = extractRun('style-inherited rtl + inline bold');
    const inlineRtlRun = extractRun('inline rtl no style');

    expect(styleOnlyRun, 'first run should be present in export').toBeTruthy();
    expect(styleAndBoldRun, 'second run should be present in export').toBeTruthy();
    expect(inlineRtlRun, 'third run should be present in export').toBeTruthy();

    // First run: rStyle ref only, NO inline <w:rtl/>
    expect(styleOnlyRun).toContain('<w:rStyle w:val="RtlChar"');
    expect(
      styleOnlyRun.match(/<w:rtl[\s/]/),
      `style-only run should NOT have inline <w:rtl/>; got: ${styleOnlyRun}`,
    ).toBeFalsy();

    // Second run: rStyle + inline bold, but still NO inline <w:rtl/>
    expect(styleAndBoldRun).toContain('<w:rStyle w:val="RtlChar"');
    expect(styleAndBoldRun).toMatch(/<w:b[\s/]/);
    expect(
      styleAndBoldRun.match(/<w:rtl[\s/]/),
      `style+inline-bold run should NOT have inline <w:rtl/>; got: ${styleAndBoldRun}`,
    ).toBeFalsy();

    // Third run: explicit inline w:rtl, no style; SHOULD have <w:rtl/>
    expect(inlineRtlRun).toMatch(/<w:rtl[\s/]/);

    editor.destroy();
  });
});
