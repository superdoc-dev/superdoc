/*
 * Regenerate the SDT classification fixtures for the nested content-control
 * classifier (PR #3616). Exercised by tests/editor/sdt-nested-classification.test.js.
 * Provenance and per-fixture conformance are documented in sdt-fixtures.README.md.
 *
 * Each fixture derives from a Word-authored base in this folder (blank-doc.docx /
 * anchor_images.docx) and replaces only word/document.xml with a hand-authored body
 * that encodes a precise SDT shape; every other package part is inherited from the
 * base, so the package stays valid. After writing, each built file is re-read and its
 * intended shape is asserted.
 *
 * Portable: all paths resolve from this file's location. No external state.
 *   node packages/super-editor/src/editors/v1/tests/data/sdt-fixtures.generate.cjs
 *   SDT_FIXTURE_OUT=/tmp/sdt-verify node .../sdt-fixtures.generate.cjs   # dry run
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const DATA = __dirname;
const OUT = process.env.SDT_FIXTURE_OUT || __dirname;
const STAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'sdt-fixture-'));
fs.mkdirSync(path.join(STAGE, 'word'), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// Exact <w:document> opening tag (full namespaces) copied verbatim from blank-doc.docx.
const HEADER =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:cx1="http://schemas.microsoft.com/office/drawing/2015/9/8/chartex" xmlns:cx2="http://schemas.microsoft.com/office/drawing/2015/10/21/chartex" xmlns:cx3="http://schemas.microsoft.com/office/drawing/2016/5/9/chartex" xmlns:cx4="http://schemas.microsoft.com/office/drawing/2016/5/10/chartex" xmlns:cx5="http://schemas.microsoft.com/office/drawing/2016/5/11/chartex" xmlns:cx6="http://schemas.microsoft.com/office/drawing/2016/5/12/chartex" xmlns:cx7="http://schemas.microsoft.com/office/drawing/2016/5/13/chartex" xmlns:cx8="http://schemas.microsoft.com/office/drawing/2016/5/14/chartex" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:aink="http://schemas.microsoft.com/office/drawing/2016/ink" xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:oel="http://schemas.microsoft.com/office/2019/extlst" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex" xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml" xmlns:w16du="http://schemas.microsoft.com/office/word/2023/wordml/word16du" xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash" xmlns:w16sdtfl="http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock" xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 w16se w16cid w16 w16cex w16sdtdh w16sdtfl w16du wp14">';

const SECTPR =
  '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>';

// Clean inline drawing referencing anchor_images.docx's small image1.png (rId4).
const INLINE_DRAWING =
  '<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="137160" cy="137160"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Picture 0" descr="dot_green.png"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="dot_green.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="137160" cy="137160"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';

const fixtures = [
  {
    name: 'sdt-nested-block.docx',
    base: 'blank-doc.docx',
    // Conformant: outer block w:sdt whose sdtContent's only direct child is a nested
    // block w:sdt (no direct w:p). The inner SDT wraps a paragraph.
    body:
      '<w:sdt><w:sdtPr><w:alias w:val="OuterBlock"/><w:tag w:val="outer-block"/><w:id w:val="111111111"/></w:sdtPr><w:sdtContent>' +
      '<w:sdt><w:sdtPr><w:alias w:val="InnerBlock"/><w:tag w:val="inner-block"/><w:id w:val="222222222"/></w:sdtPr><w:sdtContent>' +
      '<w:p><w:r><w:t>Nested block content</w:t></w:r></w:p>' +
      '</w:sdtContent></w:sdt>' +
      '</w:sdtContent></w:sdt>',
    mustContain: ['OuterBlock', 'InnerBlock', 'Nested block content', '<w:sdtContent><w:sdt>'],
  },
  {
    name: 'sdt-nested-inline.docx',
    base: 'blank-doc.docx',
    // Conformant: inline w:sdt (with a nested inline w:sdt) inside a paragraph, between
    // two text runs. Proves the path/context gate keeps valid inline SDTs inline.
    body:
      '<w:p>' +
      '<w:r><w:t xml:space="preserve">Before </w:t></w:r>' +
      '<w:sdt><w:sdtPr><w:alias w:val="OuterInline"/><w:tag w:val="outer-inline"/><w:id w:val="333333333"/></w:sdtPr><w:sdtContent>' +
      '<w:r><w:t xml:space="preserve">outer </w:t></w:r>' +
      '<w:sdt><w:sdtPr><w:alias w:val="InnerInline"/><w:tag w:val="inner-inline"/><w:id w:val="444444444"/></w:sdtPr><w:sdtContent>' +
      '<w:r><w:t>inner</w:t></w:r>' +
      '</w:sdtContent></w:sdt>' +
      '</w:sdtContent></w:sdt>' +
      '<w:r><w:t xml:space="preserve"> after</w:t></w:r>' +
      '</w:p>',
    mustContain: ['OuterInline', 'InnerInline', 'Before ', 'inner', ' after', '<w:p><w:r>'],
  },
  {
    name: 'sdt-mixed-block.docx',
    base: 'blank-doc.docx',
    // DEFENSIVE / MALFORMED: a block w:sdt whose sdtContent mixes a bare inline w:sdt,
    // a w:p, and a w:tbl. The bare inline w:sdt is non-conformant in block content
    // (EG_ContentBlockContent excludes bare w:r). Drives wrapInlineRunsAsParagraphs.
    body:
      '<w:sdt><w:sdtPr><w:alias w:val="MixedBlock"/><w:tag w:val="mixed-block"/><w:id w:val="555555555"/></w:sdtPr><w:sdtContent>' +
      '<w:sdt><w:sdtPr><w:alias w:val="InlineInMixed"/><w:tag w:val="inline-in-mixed"/><w:id w:val="666666666"/></w:sdtPr><w:sdtContent>' +
      '<w:r><w:t>inline sdt</w:t></w:r>' +
      '</w:sdtContent></w:sdt>' +
      '<w:p><w:r><w:t>A paragraph</w:t></w:r></w:p>' +
      '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="4680"/></w:tblGrid>' +
      '<w:tr><w:tc><w:tcPr><w:tcW w:w="4680" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '</w:sdtContent></w:sdt>',
    mustContain: ['MixedBlock', 'InlineInMixed', 'inline sdt', 'A paragraph', '<w:tbl>', 'Cell'],
  },
  {
    name: 'sdt-inline-picture.docx',
    base: 'anchor_images.docx',
    // Conformant (ECMA-376 17.5.2.24): inline picture content control. <w:picture/>
    // marker; content is a run with an inline drawing referencing the base image (rId4).
    body:
      '<w:p><w:sdt><w:sdtPr><w:alias w:val="PictureControl"/><w:tag w:val="picture-control"/><w:id w:val="777777777"/><w:picture/></w:sdtPr><w:sdtContent>' +
      INLINE_DRAWING +
      '</w:sdtContent></w:sdt></w:p>',
    mustContain: ['PictureControl', '<w:picture/>', 'r:embed="rId4"', '<w:drawing>'],
  },
];

let allPass = true;
for (const f of fixtures) {
  const documentXml = HEADER + '<w:body>' + f.body + SECTPR + '</w:body></w:document>';
  fs.writeFileSync(path.join(STAGE, 'word', 'document.xml'), documentXml);

  const outPath = path.join(OUT, f.name);
  fs.copyFileSync(path.join(DATA, f.base), outPath);
  // Replace only word/document.xml; every other part comes from the Word-authored base.
  execSync(`zip -X -q "${outPath}" word/document.xml`, { cwd: STAGE });

  const rebuilt = execSync(`unzip -p "${outPath}" word/document.xml`, { encoding: 'utf8' });
  const missing = f.mustContain.filter((s) => !rebuilt.includes(s));
  const ok = missing.length === 0;
  allPass = allPass && ok;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${f.name}  (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB, base ${f.base})`);
  if (!ok) console.log(`      missing shape markers: ${JSON.stringify(missing)}`);
}

fs.rmSync(STAGE, { recursive: true, force: true });
console.log(allPass ? `\nAll fixtures generated + shape-verified -> ${OUT}` : '\nSHAPE VERIFICATION FAILED.');
process.exit(allPass ? 0 : 1);
