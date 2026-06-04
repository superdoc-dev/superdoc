import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { StoryLocator } from '@superdoc/document-api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const editorFixtureRoot = path.resolve(repoRoot, 'packages/super-editor/src/editors/v1/tests/data');
const generatedFixtureRoot = path.resolve(os.tmpdir(), `superdoc-behavior-story-fixtures-${process.pid}`);

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(targetPath: string, contents: string): void {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, contents);
}

function run(command: string, args: string[], cwd?: string): void {
  execFileSync(command, args, {
    cwd,
    stdio: 'ignore',
  });
}

function rebuildDocx(sourceName: string, targetPath: string, replacements: Record<string, string>): void {
  const sourcePath = path.resolve(editorFixtureRoot, sourceName);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'superdoc-behavior-story-fixture-build-'));
  try {
    run('unzip', ['-qq', sourcePath, '-d', tempRoot]);
    for (const [relativePath, contents] of Object.entries(replacements)) {
      writeFile(path.resolve(tempRoot, relativePath), contents);
    }

    ensureDir(path.dirname(targetPath));
    fs.rmSync(targetPath, { force: true });
    run('zip', ['-q', '-X', '-r', targetPath, '.'], tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function ensureGeneratedFixture(filename: string, sourceName: string, replacements: Record<string, string>): string {
  const targetPath = path.resolve(generatedFixtureRoot, filename);
  if (!fs.existsSync(targetPath)) {
    rebuildDocx(sourceName, targetPath, replacements);
  }
  return targetPath;
}

function documentXmlWithEndnotes(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:body>
    <w:p>
      <w:r><w:t>Simple endnote text</w:t></w:r>
      <w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteReference w:id="1"/></w:r>
      <w:r><w:t xml:space="preserve"> with longer content</w:t></w:r>
      <w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteReference w:id="2"/></w:r>
    </w:p>
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId8"/>
      <w:footerReference w:type="default" r:id="rId10"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
`;
}

function complexFootnoteMappingDocumentXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:body>
    <w:p>
      <w:r><w:t>Complex mapped note</w:t></w:r>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r>
      <w:r><w:t xml:space="preserve"> and field-coded note</w:t></w:r>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="2"/></w:r>
      <w:r><w:t>.</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId8"/>
      <w:footerReference w:type="default" r:id="rId10"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
`;
}

function multiPageHeaderFooterDocumentXml(): string {
  const paragraphs = Array.from({ length: 48 }, (_, index) => {
    const number = index + 1;
    return `
    <w:p>
      <w:r><w:t>Multipage footer coverage paragraph ${number}. This filler text keeps the same default header and footer story flowing onto later pages.</w:t></w:r>
    </w:p>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId8"/>
      <w:footerReference w:type="default" r:id="rId10"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
`;
}

function twoSectionFooterDocumentXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Section 1</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>First section body content.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:sectPr>
          <w:footerReference w:type="default" r:id="rId10"/>
          <w:type w:val="nextPage"/>
          <w:pgSz w:w="12240" w:h="15840"/>
          <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
          <w:cols w:space="720"/>
          <w:docGrid w:linePitch="360"/>
        </w:sectPr>
      </w:pPr>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Section 2</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Second section content lives on the next page.</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId9"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
`;
}

function footerFootnoteTransitionDocumentXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:body>
    <w:p>
      <w:r><w:t>Footer transition anchor</w:t></w:r>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r>
      <w:r><w:t>.</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId10"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
`;
}

function footerTableAndFootnoteDocumentXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:body>
    <w:p>
      <w:r><w:t>Table Sample</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The summary below references the attached numbers</w:t></w:r>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r>
      <w:r><w:t>.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="3200"/>
        <w:gridCol w:w="3200"/>
        <w:gridCol w:w="3200"/>
      </w:tblGrid>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Quarter</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Revenue</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Status</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Q1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>$120,000</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>On track</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Q2</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>$128,500</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Ahead</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Q3</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>$119,300</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Review</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId8"/>
      <w:footerReference w:type="default" r:id="rId10"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
`;
}

function footerTableAndFootnoteInlinePageFieldDocumentXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:mv="urn:schemas-microsoft-com:mac:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="${NS_R}" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="${NS_W}" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Title"/><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>Table Sample</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The summary below references the attached numbers</w:t></w:r>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r>
      <w:r><w:t>.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:type="auto" w:w="0"/>
        <w:tblLook w:firstColumn="1" w:firstRow="1" w:lastColumn="0" w:lastRow="0" w:noHBand="0" w:noVBand="1" w:val="04A0"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="3216"/>
        <w:gridCol w:w="3216"/>
        <w:gridCol w:w="3216"/>
      </w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>Quarter</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>Revenue</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>Status</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>Q1</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>$120,000</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>On track</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>Q2</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>$128,500</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>Ahead</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>Q3</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>$119,300</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3216"/></w:tcPr><w:p><w:r><w:t>Review</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr w:rsidR="00FC693F" w:rsidRPr="0006063C" w:rsidSect="00034616">
      <w:headerReference w:type="default" r:id="rId9"/>
      <w:footerReference w:type="default" r:id="rId10"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1152" w:right="1296" w:bottom="1152" w:left="1296" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
`;
}

function simpleFootnotesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:footnote w:type="separator" w:id="-1">
    <w:p><w:r><w:separator/></w:r></w:p>
  </w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0">
    <w:p><w:r><w:continuationSeparator/></w:r></w:p>
  </w:footnote>
  <w:footnote w:id="1">
    <w:p>
      <w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>
      <w:r><w:t xml:space="preserve"> This is a simple footnote</w:t></w:r>
    </w:p>
  </w:footnote>
</w:footnotes>
`;
}

function simpleFooterXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r><w:t>${text}</w:t></w:r>
  </w:p>
</w:ftr>
`;
}

function complexFootnotesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:footnote w:type="separator" w:id="-1">
    <w:p><w:r><w:separator/></w:r></w:p>
  </w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0">
    <w:p><w:r><w:continuationSeparator/></w:r></w:p>
  </w:footnote>
  <w:footnote w:id="1">
    <w:p>
      <w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>
      <w:r><w:tab/></w:r>
      <w:r><w:t>If only one closing is contemplated, references to “Initial Closing” should be modified.</w:t></w:r>
    </w:p>
  </w:footnote>
  <w:footnote w:id="2">
    <w:p>
      <w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve"> STYLEREF 1 \\s </w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>1.2(b)</w:t></w:r>
      <w:r><w:fldChar w:fldCharType="end"/></w:r>
      <w:r><w:t xml:space="preserve"> The Company may have tax reporting and/or withholding obligations in connection with the conversion of Convertible Securities into Company stock.</w:t></w:r>
    </w:p>
  </w:footnote>
</w:footnotes>
`;
}

function endnotesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:endnotes xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:endnote w:type="separator" w:id="-1">
    <w:p><w:r><w:separator/></w:r></w:p>
  </w:endnote>
  <w:endnote w:type="continuationSeparator" w:id="0">
    <w:p><w:r><w:continuationSeparator/></w:r></w:p>
  </w:endnote>
  <w:endnote w:id="1">
    <w:p>
      <w:pPr><w:pStyle w:val="EndnoteText"/></w:pPr>
      <w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteRef/></w:r>
      <w:r><w:t xml:space="preserve"> This is a simple endnote</w:t></w:r>
    </w:p>
  </w:endnote>
  <w:endnote w:id="2">
    <w:p>
      <w:pPr><w:pStyle w:val="EndnoteText"/></w:pPr>
      <w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteRef/></w:r>
      <w:r><w:t xml:space="preserve"> A longer endnote</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="EndnoteText"/></w:pPr>
      <w:r><w:t>And more endnote content</w:t></w:r>
    </w:p>
  </w:endnote>
</w:endnotes>
`;
}

function storyOnlyTrackedChangeDocumentXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:body>
    <w:p>
      <w:r><w:t>Body review anchor</w:t></w:r>
      <w:r><w:t xml:space="preserve"> with footnote</w:t></w:r>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r>
      <w:r><w:t xml:space="preserve"> and endnote</w:t></w:r>
      <w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteReference w:id="1"/></w:r>
      <w:r><w:t>.</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId8"/>
      <w:footerReference w:type="default" r:id="rId10"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
`;
}

function trackedHeaderXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:p>
    <w:pPr><w:pStyle w:val="Header"/></w:pPr>
    <w:r><w:t xml:space="preserve">Header base </w:t></w:r>
    <w:ins w:id="101" w:author="Story Harness" w:date="2026-01-01T00:00:00Z">
      <w:r><w:t>HDR_TC_ALPHA</w:t></w:r>
    </w:ins>
  </w:p>
</w:hdr>
`;
}

function trackedFooterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:p>
    <w:pPr><w:pStyle w:val="Footer"/></w:pPr>
    <w:r><w:t xml:space="preserve">Footer base </w:t></w:r>
    <w:ins w:id="102" w:author="Story Harness" w:date="2026-01-01T00:00:00Z">
      <w:r><w:t>FTR_TC_BRAVO</w:t></w:r>
    </w:ins>
  </w:p>
</w:ftr>
`;
}

function inlinePageFieldFooterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r><w:t xml:space="preserve">Finance QA </w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>
`;
}

function lowercasePageFieldFooterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r><w:t xml:space="preserve">Case footer </w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve">page \\* arabic</w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>
`;
}

function formattedPageFieldFooterXml(): string {
  const pageField = (instruction: string, cachedText: string) => `
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve">${instruction}</w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>${cachedText}</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r><w:t xml:space="preserve">Formats </w:t></w:r>
    ${pageField('PAGE \\* Roman', 'I')}
    <w:r><w:t xml:space="preserve"> </w:t></w:r>
    ${pageField('PAGE \\* ALPHABETIC', 'A')}
    <w:r><w:t xml:space="preserve"> </w:t></w:r>
    ${pageField('PAGE \\* ArabicDash', '- 1 -')}
  </w:p>
</w:ftr>
`;
}

function inlinePageFieldSingleRunFooterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main" xmlns:mv="urn:schemas-microsoft-com:mac:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="${NS_R}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w="${NS_W}" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r><w:t xml:space="preserve">Finance QA </w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/><w:instrText xml:space="preserve">PAGE</w:instrText><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>
`;
}

function rtlPattern1HeaderXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Header"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r>
      <w:rPr><w:rtl/></w:rPr>
      <w:t>כותרת</w:t>
    </w:r>
    <w:r>
      <w:rPr><w:rtl/></w:rPr>
      <w:t xml:space="preserve"> עליונה</w:t>
    </w:r>
  </w:p>
</w:hdr>
`;
}

function rtlPattern1FooterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r>
      <w:rPr><w:rtl/></w:rPr>
      <w:t>שלוםאבג</w:t>
    </w:r>
  </w:p>
</w:ftr>
`;
}

function trackedFootnotesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:footnote w:type="separator" w:id="-1">
    <w:p><w:r><w:separator/></w:r></w:p>
  </w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0">
    <w:p><w:r><w:continuationSeparator/></w:r></w:p>
  </w:footnote>
  <w:footnote w:id="1">
    <w:p>
      <w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>
      <w:r><w:t xml:space="preserve"> Footnote base </w:t></w:r>
      <w:ins w:id="103" w:author="Story Harness" w:date="2026-01-01T00:00:00Z">
        <w:r><w:t>FN_TC_CHARLIE</w:t></w:r>
      </w:ins>
    </w:p>
  </w:footnote>
</w:footnotes>
`;
}

function trackedEndnotesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:endnotes xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:endnote w:type="separator" w:id="-1">
    <w:p><w:r><w:separator/></w:r></w:p>
  </w:endnote>
  <w:endnote w:type="continuationSeparator" w:id="0">
    <w:p><w:r><w:continuationSeparator/></w:r></w:p>
  </w:endnote>
  <w:endnote w:id="1">
    <w:p>
      <w:pPr><w:pStyle w:val="EndnoteText"/></w:pPr>
      <w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteRef/></w:r>
      <w:r><w:t xml:space="preserve"> Endnote base </w:t></w:r>
      <w:ins w:id="104" w:author="Story Harness" w:date="2026-01-01T00:00:00Z">
        <w:r><w:t>EN_TC_DELTA</w:t></w:r>
      </w:ins>
    </w:p>
  </w:endnote>
</w:endnotes>
`;
}

export const H_F_NORMAL_DOC_PATH = path.resolve(editorFixtureRoot, 'h_f-normal.docx');
export const H_F_NORMAL_ODD_EVEN_FIRSTPG_DOC_PATH = path.resolve(editorFixtureRoot, 'h_f-normal-odd-even-firstpg.docx');
export const LONGER_HEADER_SIGN_AREA_DOC_PATH = path.resolve(editorFixtureRoot, 'longer-header-sign-area.docx');
export const BASIC_FOOTNOTES_DOC_PATH = path.resolve(editorFixtureRoot, 'basic-footnotes.docx');
export const COMPLEX_IMPORTED_FOOTNOTES_DOC_PATH = ensureGeneratedFixture(
  'complex-imported-footnotes.docx',
  'h_f-normal.docx',
  {
    'word/document.xml': complexFootnoteMappingDocumentXml(),
    'word/footnotes.xml': complexFootnotesXml(),
  },
);
export const BASIC_ENDNOTES_DOC_PATH = ensureGeneratedFixture('basic-endnotes.docx', 'h_f-normal.docx', {
  'word/document.xml': documentXmlWithEndnotes(),
  'word/endnotes.xml': endnotesXml(),
});
export const MULTI_PAGE_HEADER_FOOTER_DOC_PATH = ensureGeneratedFixture(
  'multi-page-header-footer.docx',
  'h_f-normal.docx',
  {
    'word/document.xml': multiPageHeaderFooterDocumentXml(),
  },
);
export const TWO_SECTION_FOOTER_DOC_PATH = ensureGeneratedFixture('two-section-footer.docx', 'h_f-normal.docx', {
  'word/document.xml': twoSectionFooterDocumentXml(),
  'word/footer1.xml': simpleFooterXml('Appendix footer'),
  'word/footer2.xml': simpleFooterXml('Main footer'),
});
export const FOOTER_FOOTNOTE_TRANSITION_DOC_PATH = ensureGeneratedFixture(
  'footer-footnote-transition.docx',
  'h_f-normal.docx',
  {
    'word/document.xml': footerFootnoteTransitionDocumentXml(),
    'word/footnotes.xml': simpleFootnotesXml(),
    'word/footer2.xml': simpleFooterXml('Transition footer'),
  },
);
export const FOOTER_INLINE_PAGE_FIELD_WITH_FOOTNOTE_DOC_PATH = ensureGeneratedFixture(
  'footer-inline-page-field-with-footnote.docx',
  'h_f-normal.docx',
  {
    'word/document.xml': footerFootnoteTransitionDocumentXml(),
    'word/footnotes.xml': simpleFootnotesXml(),
    'word/footer2.xml': inlinePageFieldFooterXml(),
  },
);
export const FOOTER_INLINE_PAGE_FIELD_DOC_PATH = ensureGeneratedFixture(
  'footer-inline-page-field.docx',
  'h_f-normal.docx',
  {
    'word/footer2.xml': inlinePageFieldFooterXml(),
  },
);
export const FOOTER_LOWERCASE_PAGE_FIELD_DOC_PATH = ensureGeneratedFixture(
  'footer-lowercase-page-field.docx',
  'h_f-normal.docx',
  {
    'word/document.xml': multiPageHeaderFooterDocumentXml(),
    'word/footer2.xml': lowercasePageFieldFooterXml(),
  },
);
export const FOOTER_FORMATTED_PAGE_FIELD_DOC_PATH = ensureGeneratedFixture(
  'footer-formatted-page-field.docx',
  'h_f-normal.docx',
  {
    'word/document.xml': multiPageHeaderFooterDocumentXml(),
    'word/footer2.xml': formattedPageFieldFooterXml(),
  },
);
export const FOOTER_SIMPLE_TEXT_WITH_TABLE_AND_FOOTNOTE_DOC_PATH = ensureGeneratedFixture(
  'footer-simple-text-with-table-and-footnote.docx',
  'h_f-normal.docx',
  {
    'word/document.xml': footerTableAndFootnoteDocumentXml(),
    'word/footnotes.xml': simpleFootnotesXml(),
    'word/footer2.xml': simpleFooterXml('Finance QA'),
  },
);
export const FOOTER_INLINE_PAGE_FIELD_SINGLE_RUN_WITH_TABLE_AND_FOOTNOTE_DOC_PATH = ensureGeneratedFixture(
  'footer-inline-page-field-single-run-with-table-and-footnote.docx',
  'h_f-normal.docx',
  {
    'word/document.xml': footerTableAndFootnoteInlinePageFieldDocumentXml(),
    'word/footnotes.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
  <w:footnote w:id="1">
    <w:p>
      <w:pPr><w:spacing w:after="0"/></w:pPr>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>
      <w:r><w:t xml:space="preserve"> </w:t></w:r>
      <w:r><w:t>Footnote 1: the associated table is decorative test data only.</w:t></w:r>
    </w:p>
  </w:footnote>
</w:footnotes>
`,
    'word/footer2.xml': inlinePageFieldSingleRunFooterXml(),
  },
);
export const STORY_ONLY_TRACKED_CHANGES_DOC_PATH = ensureGeneratedFixture(
  'story-only-tracked-changes.docx',
  'h_f-normal.docx',
  {
    'word/document.xml': storyOnlyTrackedChangeDocumentXml(),
    'word/header2.xml': trackedHeaderXml(),
    'word/footer2.xml': trackedFooterXml(),
    'word/footnotes.xml': trackedFootnotesXml(),
    'word/endnotes.xml': trackedEndnotesXml(),
  },
);
export const RTL_PATTERN1_HEADER_FOOTER_DOC_PATH = ensureGeneratedFixture(
  'rtl-pattern1-header-footer.docx',
  'h_f-normal.docx',
  {
    'word/header2.xml': rtlPattern1HeaderXml(),
    'word/footer2.xml': rtlPattern1FooterXml(),
  },
);

export type StoryTrackedChangeFixtureEntry = {
  surface: 'header' | 'footer' | 'footnote' | 'endnote';
  story: StoryLocator;
  storyKind: 'headerFooter' | 'footnote' | 'endnote';
  storyLabel?: string;
  storyLabelPrefix?: string;
  excerpt: string;
};

export function readStoryOnlyTrackedChangesManifest(): StoryTrackedChangeFixtureEntry[] {
  return [
    {
      surface: 'header',
      story: { kind: 'story', storyType: 'headerFooterPart', refId: 'rId8' },
      storyKind: 'headerFooter',
      storyLabelPrefix: 'Header/Footer',
      excerpt: 'HDR_TC_ALPHA',
    },
    {
      surface: 'footer',
      story: { kind: 'story', storyType: 'headerFooterPart', refId: 'rId10' },
      storyKind: 'headerFooter',
      storyLabelPrefix: 'Header/Footer',
      excerpt: 'FTR_TC_BRAVO',
    },
    {
      surface: 'footnote',
      story: { kind: 'story', storyType: 'footnote', noteId: '1' },
      storyKind: 'footnote',
      storyLabel: 'Footnote 1',
      excerpt: 'FN_TC_CHARLIE',
    },
    {
      surface: 'endnote',
      story: { kind: 'story', storyType: 'endnote', noteId: '1' },
      storyKind: 'endnote',
      storyLabel: 'Endnote 1',
      excerpt: 'EN_TC_DELTA',
    },
  ];
}
