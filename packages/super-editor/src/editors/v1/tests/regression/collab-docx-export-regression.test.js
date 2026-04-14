/**
 * Regression tests for collab-style DOCX export fixes:
 * - customXml/* parts must appear in getUpdatedDocs when present in convertedXml
 * - word/settings.xml: attachedTemplate must be stripped if word/_rels/settings.xml.rels is absent,
 *   and rels must be written when present
 * - word/endnotes.xml (and rels) must be included when the document has endnotes
 */

import { describe, it, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { getOverrides } from '@core/opc/test-helpers.js';
import DocxZipper from '@core/DocxZipper.js';

const MULTI_SECTION = 'multi_section_doc.docx';
const BLANK_DOC = 'blank-doc.docx';
const BASIC_FOOTNOTES = 'basic-footnotes.docx';

const SETTINGS_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdAttachment" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="file:///fake.dotx" TargetMode="External"/>
</Relationships>`;

async function headlessEditorFrom(docName) {
  const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(docName);
  const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
  return editor;
}

describe('collab DOCX export: customXml parts (getUpdatedDocs)', () => {
  it('includes customXml item, itemProps, and item rels from convertedXml', async () => {
    const editor = await headlessEditorFrom(MULTI_SECTION);

    try {
      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });

      expect(updatedDocs['customXml/item1.xml']).toBeTruthy();
      expect(String(updatedDocs['customXml/item1.xml'])).toContain('SelectedStyle="/APA.XSL"');

      expect(updatedDocs['customXml/itemProps1.xml']).toBeTruthy();
      expect(String(updatedDocs['customXml/itemProps1.xml'])).toMatch(/itemProps|DataStoreItem/i);

      expect(updatedDocs['customXml/_rels/item1.xml.rels']).toBeTruthy();
      expect(String(updatedDocs['customXml/_rels/item1.xml.rels'])).toContain('Relationship');
    } finally {
      editor.destroy();
    }
  });
});

describe('collab DOCX export: settings.xml + settings.xml.rels', () => {
  it('strips w:attachedTemplate when settings rels are missing (no dangling r:id)', async () => {
    const editor = await headlessEditorFrom(BLANK_DOC);

    try {
      const settingsPart = editor.converter.convertedXml['word/settings.xml'];
      const settingsRoot = settingsPart?.elements?.[0];
      expect(settingsRoot?.name).toBe('w:settings');

      if (!Array.isArray(settingsRoot.elements)) settingsRoot.elements = [];
      settingsRoot.elements.push({
        type: 'element',
        name: 'w:attachedTemplate',
        attributes: { 'r:id': 'rIdAttachment' },
        elements: [],
      });

      delete editor.converter.convertedXml['word/_rels/settings.xml.rels'];

      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });
      const settingsXml = String(updatedDocs['word/settings.xml'] ?? '');

      expect(settingsXml).not.toMatch(/<w:attachedTemplate\b/i);
      expect(updatedDocs['word/_rels/settings.xml.rels']).toBeUndefined();
    } finally {
      editor.destroy();
    }
  });

  it('writes word/_rels/settings.xml.rels when present alongside attachedTemplate', async () => {
    const editor = await headlessEditorFrom(BLANK_DOC);

    try {
      const settingsPart = editor.converter.convertedXml['word/settings.xml'];
      const settingsRoot = settingsPart.elements[0];
      if (!Array.isArray(settingsRoot.elements)) settingsRoot.elements = [];
      settingsRoot.elements.push({
        type: 'element',
        name: 'w:attachedTemplate',
        attributes: { 'r:id': 'rIdAttachment' },
        elements: [],
      });

      editor.converter.convertedXml['word/_rels/settings.xml.rels'] = parseXmlToJson(SETTINGS_RELS_XML);

      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });

      expect(String(updatedDocs['word/settings.xml'])).toMatch(/<w:attachedTemplate\b/i);
      expect(updatedDocs['word/_rels/settings.xml.rels']).toBeTruthy();
      expect(String(updatedDocs['word/_rels/settings.xml.rels'])).toContain('rIdAttachment');
      expect(String(updatedDocs['word/_rels/settings.xml.rels'])).toContain('attachedTemplate');
    } finally {
      editor.destroy();
    }
  });
});

describe('collab DOCX export: endnotes parts', () => {
  it('includes word/endnotes.xml in getUpdatedDocs for documents that have endnotes', async () => {
    const editor = await headlessEditorFrom(BASIC_FOOTNOTES);

    try {
      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });

      expect(updatedDocs['word/endnotes.xml']).toBeTruthy();
      expect(String(updatedDocs['word/endnotes.xml'])).toMatch(/<w:endnotes\b/);

      if (updatedDocs['word/_rels/endnotes.xml.rels']) {
        expect(String(updatedDocs['word/_rels/endnotes.xml.rels'])).toContain('Relationships');
      }

      const overrides = getOverrides(String(updatedDocs['[Content_Types].xml'] ?? ''));
      const endOverride = overrides.find((o) => o.partName === '/word/endnotes.xml');
      expect(endOverride).toBeTruthy();
      expect(endOverride.contentType).toContain('endnotes');
    } finally {
      editor.destroy();
    }
  });
});

describe('DocxZipper updateContentTypes: endnotes Override (joiner packages)', () => {
  it('adds endnotes content-type Override when word/endnotes.xml is exported but base [Content_Types] omits it', async () => {
    const zipper = new DocxZipper();
    const minimalCt = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const updatedContentTypes = await zipper.updateContentTypes(
      { files: { '[Content_Types].xml': minimalCt } },
      {},
      true,
      {
        'word/endnotes.xml':
          '<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:endnotes>',
      },
      {},
    );

    expect(updatedContentTypes).toContain('PartName="/word/endnotes.xml"');
    expect(updatedContentTypes).toContain('wordprocessingml.endnotes+xml');
    const endnotesOverrides = updatedContentTypes.match(/PartName="\/word\/endnotes\.xml"/g);
    expect(endnotesOverrides).toHaveLength(1);
  });
});
