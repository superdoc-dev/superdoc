/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import type { Editor } from '../../core/Editor.js';
import type { TemplatesApplyReceipt } from '@superdoc/document-api';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

/**
 * Build a minimal, self-contained source-template DOCX as a base64 string.
 *
 * `compression` defaults to STORE (uncompressed); pass `'DEFLATE'` to exercise
 * the real compressed-package path that motivated the async OPC reader (the old
 * synchronous reader depended on `node:zlib` to inflate these — SD-3247).
 */
async function buildSourceTemplateBase64(
  parts: Record<string, string>,
  compression: 'STORE' | 'DEFLATE' = 'STORE',
): Promise<string> {
  const zip = new JSZip();
  // A valid OPC package must contain [Content_Types].xml.
  const overrides = Object.keys(parts)
    .filter((p) => p.endsWith('.xml'))
    .map((p) => `<Override PartName="/${p}" ContentType="application/xml"/>`)
    .join('');
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CT_NS}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`,
  );
  for (const [path, content] of Object.entries(parts)) {
    zip.file(path, content);
  }
  const u8 = await zip.generateAsync({
    type: 'uint8array',
    compression,
    compressionOptions: compression === 'DEFLATE' ? { level: 6 } : undefined,
  });
  // Encode bytes to base64 (jsdom env has btoa).
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="TemplateOnly"><w:name w:val="Template Only"/></w:style></w:styles>`;
const STYLES_WITH_NAMESPACE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w16cid"><w:style w:type="paragraph" w:styleId="TemplateNamespaced" w16cid:val="123"><w:name w:val="Template Namespaced"/></w:style></w:styles>`;
const THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="SENTINEL_THEME"><a:themeElements/></a:theme>`;
const FONT_TABLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="SentinelFont"/></w:fonts>`;
const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="567"/><w:rsids><w:rsidRoot w:val="BB777777"/></w:rsids><w:attachedTemplate w:val="Word Normal"/></w:settings>`;
const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14 w15 w16cid"><w:abstractNum w:abstractNumId="7" w15:restartNumberingAfterBreak="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:rPr><w14:shadow w14:val="1"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="11" w16cid:durableId="123456789"><w:abstractNumId w:val="7"/></w:num></w:numbering>`;
const CUSTOM_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><root sentinel="CUSTOM_XML_SENTINEL"/>`;
const PAGE_ONE_SECTION_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:sectPr><w:headerReference w:type="first" r:id="rId10"/><w:headerReference w:type="default" r:id="rId11"/><w:footerReference w:type="default" r:id="rId12"/><w:type w:val="continuous"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:cols w:space="720"/><w:titlePg/></w:sectPr></w:pPr><w:r><w:t>Section 1</w:t></w:r></w:p><w:p><w:r><w:t>Section 2</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="rId13"/><w:footerReference w:type="default" r:id="rId14"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:cols w:space="720"/></w:sectPr></w:body></w:document>`;
const PAGE_ONE_SECTION_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header10.xml"/><Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header11.xml"/><Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer12.xml"/><Relationship Id="rId13" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header13.xml"/><Relationship Id="rId14" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer14.xml"/></Relationships>`;
const FIRST_PAGE_HEADER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>FIRST_PAGE_HEADER_SENTINEL</w:t></w:r></w:p></w:hdr>`;
const FIRST_SECTION_DEFAULT_HEADER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>FIRST_SECTION_DEFAULT_HEADER_SENTINEL</w:t></w:r></w:p></w:hdr>`;
const FINAL_SECTION_HEADER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>FINAL_SECTION_HEADER_SENTINEL</w:t></w:r></w:p></w:hdr>`;
const SECTION_FOOTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>SECTION_FOOTER_SENTINEL</w:t></w:r></w:p></w:ftr>`;
async function exportDocxFiles(editor: Editor): Promise<Record<string, string>> {
  const zipper = new DocxZipper();
  const buffer = await editor.exportDocx();
  const files = await zipper.getDocxData(buffer, true);
  const byName: Record<string, string> = {};
  for (const f of files) byName[f.name] = f.content;
  return byName;
}

describe('templates.apply adapter integration', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('blank-doc.docx');
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  function newEditor(): Editor {
    const result = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    });
    return result.editor as Editor;
  }

  it('routes direct call and invoke() identically', async () => {
    const data = await buildSourceTemplateBase64({ 'word/styles.xml': STYLES_XML });

    editor = newEditor();
    const direct = (await editor.doc.templates.apply({ source: { kind: 'base64', data } })) as TemplatesApplyReceipt;
    editor.destroy();

    editor = newEditor();
    const viaInvoke = (await editor.doc.invoke({
      operationId: 'templates.apply',
      input: { source: { kind: 'base64', data } },
    })) as TemplatesApplyReceipt;

    expect(direct.success).toBe(true);
    expect(viaInvoke.success).toBe(true);
    if (!direct.success || !viaInvoke.success) return;
    // Same plan: detected scopes, applied scopes, source fingerprint.
    expect(viaInvoke.source.fingerprint).toBe(direct.source.fingerprint);
    expect(viaInvoke.detectedScopes).toEqual(direct.detectedScopes);
    expect(viaInvoke.appliedScopes).toEqual(direct.appliedScopes);
  });

  it('dryRun returns a truthful plan but does not mutate convertedXml', async () => {
    const data = await buildSourceTemplateBase64({
      'word/styles.xml': STYLES_XML,
      'word/theme/theme1.xml': THEME_XML,
    });
    editor = newEditor();
    const cvt = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter;
    const beforeStyles = JSON.stringify(cvt.convertedXml['word/styles.xml']);
    const beforeTheme = cvt.convertedXml['word/theme/theme1.xml'];

    const receipt = (await editor.doc.templates.apply({
      source: { kind: 'base64', data },
      bodyPolicy: 'preserve',
    }, { dryRun: true })) as TemplatesApplyReceipt;

    expect(receipt.success).toBe(true);
    if (!receipt.success) return;
    expect(receipt.dryRun).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.detectedScopes.map((s) => s.scope).sort()).toEqual(['styles', 'theme']);

    // No mutation occurred.
    expect(JSON.stringify(cvt.convertedXml['word/styles.xml'])).toBe(beforeStyles);
    expect(cvt.convertedXml['word/theme/theme1.xml']).toBe(beforeTheme);
  });

  it('returns INVALID_PACKAGE for non-docx bytes and does not mutate', async () => {
    editor = newEditor();
    const cvt = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter;
    const before = JSON.stringify(cvt.convertedXml['word/styles.xml']);

    // "not a zip" base64
    const garbage = btoa('this is definitely not a zip file at all');
    const receipt = (await editor.doc.templates.apply({
      source: { kind: 'base64', data: garbage },
    })) as TemplatesApplyReceipt;

    expect(receipt.success).toBe(false);
    if (receipt.success) return;
    expect(receipt.failure.code).toBe('INVALID_PACKAGE');
    expect(JSON.stringify(cvt.convertedXml['word/styles.xml'])).toBe(before);
  });

  it('persists theme/fontTable through export, preserves body, and ignores customXml', async () => {
    const data = await buildSourceTemplateBase64({
      'word/styles.xml': STYLES_XML,
      'word/theme/theme1.xml': THEME_XML,
      'word/fontTable.xml': FONT_TABLE_XML,
      'customXml/item1.xml': CUSTOM_XML,
    });

    editor = newEditor();
    const cvt = (editor as unknown as { converter: { convertedXml: Record<string, unknown>; schemaToXml: (d: unknown) => string } }).converter;
    const bodyBeforeXml = cvt.schemaToXml((cvt.convertedXml['word/document.xml'] as { elements: unknown[] }).elements[0]);

    const receipt = (await editor.doc.templates.apply({ source: { kind: 'base64', data } })) as TemplatesApplyReceipt;
    expect(receipt.success).toBe(true);
    if (!receipt.success) return;
    expect(receipt.changed).toBe(true);
    const appliedParts = receipt.appliedScopes.map((s) => s.part);
    expect(appliedParts).toContain('word/theme/theme1.xml');
    expect(appliedParts).toContain('word/fontTable.xml');
    expect(appliedParts).not.toContain('customXml/item1.xml');
    expect(receipt.unsupportedItems).toContainEqual({
      part: 'customXml/item1.xml',
      category: 'customXml',
      reason: 'out of initial apply scope',
    });

    // Body preserved in-memory immediately after apply.
    const bodyAfterXml = cvt.schemaToXml((cvt.convertedXml['word/document.xml'] as { elements: unknown[] }).elements[0]);
    expect(bodyAfterXml).toBe(bodyBeforeXml);

    // Export and re-unzip the real output.
    const out = await exportDocxFiles(editor);

    expect(out['word/theme/theme1.xml']).toContain('SENTINEL_THEME');
    expect(out['word/fontTable.xml']).toContain('SentinelFont');
    expect(out['customXml/item1.xml']).toBeUndefined();

    // Body content (word/document.xml) survived save unchanged in substance:
    // the document still exists and was not replaced by the template body.
    expect(out['word/document.xml']).toBeTruthy();
    expect(out['word/document.xml']).not.toContain('SENTINEL_THEME');
  });

  it('reconciles settings from an empty target settings baseline instead of transplanting source identity metadata', async () => {
    const data = await buildSourceTemplateBase64({
      'word/settings.xml': SETTINGS_XML,
    });

    editor = newEditor();
    const cvt = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter;
    delete cvt.convertedXml['word/settings.xml'];

    const receipt = (await editor.doc.templates.apply({ source: { kind: 'base64', data } })) as TemplatesApplyReceipt;
    expect(receipt.success).toBe(true);
    if (!receipt.success) return;

    const out = await exportDocxFiles(editor);
    expect(out['word/settings.xml']).toContain('w:defaultTabStop w:val="567"');
    expect(out['word/settings.xml']).not.toContain('BB777777');
    expect(out['word/settings.xml']).not.toContain('attachedTemplate');
  });

  it('preserves source styles root namespace declarations required by imported style definitions', async () => {
    const data = await buildSourceTemplateBase64({
      'word/styles.xml': STYLES_WITH_NAMESPACE_XML,
    });

    editor = newEditor();
    const receipt = (await editor.doc.templates.apply({ source: { kind: 'base64', data } })) as TemplatesApplyReceipt;
    expect(receipt.success).toBe(true);
    if (!receipt.success) return;

    const out = await exportDocxFiles(editor);
    const stylesXml = out['word/styles.xml'];
    expect(stylesXml).toContain('xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"');
    expect(stylesXml).toContain('xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"');
    expect(stylesXml).toMatch(/mc:Ignorable="[^"]*\bw16cid\b/);
    expect(stylesXml).toContain('w16cid:val="123"');
  });

  it('preserves source numbering root namespace declarations required by imported numbering definitions', async () => {
    const data = await buildSourceTemplateBase64({
      'word/numbering.xml': NUMBERING_XML,
    });

    editor = newEditor();
    const receipt = (await editor.doc.templates.apply({ source: { kind: 'base64', data } })) as TemplatesApplyReceipt;
    expect(receipt.success).toBe(true);
    if (!receipt.success) return;

    const out = await exportDocxFiles(editor);
    const numberingXml = out['word/numbering.xml'];
    expect(numberingXml).toContain('xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"');
    expect(numberingXml).toContain('xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"');
    expect(numberingXml).toContain('xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"');
    expect(numberingXml).toContain('xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"');
    expect(numberingXml).toContain('mc:Ignorable="w15 w14 w16cid"');
    expect(numberingXml).toContain('w15:restartNumberingAfterBreak="0"');
    expect(numberingXml).toContain('w16cid:durableId="123456789"');
  });

  it('adopts the source section defaults that govern page 1 rather than the final body sectPr', async () => {
    const data = await buildSourceTemplateBase64({
      'word/document.xml': PAGE_ONE_SECTION_DOCUMENT_XML,
      'word/_rels/document.xml.rels': PAGE_ONE_SECTION_RELS_XML,
      'word/header10.xml': FIRST_PAGE_HEADER_XML,
      'word/header11.xml': FIRST_SECTION_DEFAULT_HEADER_XML,
      'word/header13.xml': FINAL_SECTION_HEADER_XML,
      'word/footer12.xml': SECTION_FOOTER_XML,
      'word/footer14.xml': SECTION_FOOTER_XML,
    });

    editor = newEditor();
    const receipt = (await editor.doc.templates.apply({ source: { kind: 'base64', data } })) as TemplatesApplyReceipt;
    expect(receipt.success).toBe(true);
    if (!receipt.success) return;

    const out = await exportDocxFiles(editor);
    const documentXml = out['word/document.xml'];
    expect(documentXml).toContain('<w:titlePg');
    expect(documentXml).toContain('w:headerReference w:type="first"');
    expect(documentXml).toContain('w:type w:val="continuous"');
    expect(
      Object.entries(out).some(
        ([name, content]) => /^word\/header\d+\.xml$/.test(name) && content.includes('FIRST_PAGE_HEADER_SENTINEL'),
      ),
    ).toBe(true);
  });

  it('reports settings as NO_CHANGE when the source settings already match the current document', async () => {
    editor = newEditor();
    const cvt = (editor as unknown as { converter: { documentModified: boolean } }).converter;
    const current = await exportDocxFiles(editor);
    const data = await buildSourceTemplateBase64({
      'word/settings.xml': current['word/settings.xml'],
    });

    const receipt = (await editor.doc.templates.apply({ source: { kind: 'base64', data } })) as TemplatesApplyReceipt;
    expect(receipt.success).toBe(true);
    if (!receipt.success) return;

    expect(receipt.changed).toBe(false);
    expect(receipt.appliedScopes.map((scope) => scope.scope)).not.toContain('settings');
    expect(receipt.changedParts.some((part) => part.scope === 'settings')).toBe(false);
    expect(receipt.skippedScopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'settings',
          part: 'word/settings.xml',
          reason: 'NO_CHANGE',
        }),
      ]),
    );
    expect(cvt.documentModified).toBe(false);
  });

  it('does not report sectionDefaults as applied when the section mutation fails', async () => {
    const data = await buildSourceTemplateBase64({
      'word/document.xml': PAGE_ONE_SECTION_DOCUMENT_XML,
    });

    editor = newEditor();
    editor.dispatch = (() => {
      throw new Error('dispatch failed');
    }) as Editor['dispatch'];

    const receipt = (await editor.doc.templates.apply({ source: { kind: 'base64', data } })) as TemplatesApplyReceipt;
    expect(receipt.success).toBe(true);
    if (!receipt.success) return;

    expect(receipt.changed).toBe(false);
    expect(receipt.appliedScopes.map((scope) => scope.scope)).not.toContain('sectionDefaults');
    expect(receipt.changedParts.some((part) => part.scope === 'sectionDefaults')).toBe(false);
    expect(receipt.skippedScopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'sectionDefaults',
          part: 'word/document.xml',
          reason: 'NO_CHANGE',
        }),
      ]),
    );
    expect(receipt.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SECTION_DEFAULTS_FAILED',
        }),
      ]),
    );
  });

  it('applies a DEFLATE-compressed source package without a node:zlib dependency', async () => {
    // Real DOCX packages are commonly DEFLATE-compressed. The async OPC reader
    // inflates them via JSZip (pako) in every runtime — the failure mode the
    // old synchronous reader had (it required node:zlib.inflateRawSync).
    const data = await buildSourceTemplateBase64(
      {
        'word/styles.xml': STYLES_XML,
        'word/theme/theme1.xml': THEME_XML,
        'word/fontTable.xml': FONT_TABLE_XML,
      },
      'DEFLATE',
    );

    editor = newEditor();
    const receipt = (await editor.doc.templates.apply({ source: { kind: 'base64', data } })) as TemplatesApplyReceipt;
    expect(receipt.success).toBe(true);
    if (!receipt.success) return;
    expect(receipt.changed).toBe(true);

    const appliedParts = receipt.appliedScopes.map((s) => s.part);
    expect(appliedParts).toContain('word/styles.xml');
    expect(appliedParts).toContain('word/theme/theme1.xml');
    expect(appliedParts).toContain('word/fontTable.xml');

    // The DEFLATE-compressed content really inflated and persisted through export.
    const out = await exportDocxFiles(editor);
    expect(out['word/theme/theme1.xml']).toContain('SENTINEL_THEME');
    expect(out['word/fontTable.xml']).toContain('SentinelFont');
  });
});
