/**
 * Regression test for OPC package metadata synchronization.
 *
 * Covers the case where a source document has no docProps/custom.xml but
 * SuperConverter creates one during export (to store SuperdocVersion and
 * DocumentGuid). Before the fix, [Content_Types].xml would be missing the
 * custom-properties Override and _rels/.rels would be missing the
 * custom-properties Relationship, producing a corrupt package.
 */

import { describe, it, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import { getOverrides, getRelationships } from '@core/opc/test-helpers.js';

const TEST_DOC = 'blank-doc.docx';

const CT_CUSTOM = 'application/vnd.openxmlformats-officedocument.custom-properties+xml';
const REL_CUSTOM = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties';
const WORD_STAT_TEXT = 'Alpha beta gamma';
const PARENT_WORD_STAT_TEXT = 'Alpha beta gamma delta';
const CHILD_ONLY_TEXT = 'Header words only';

function readXmlTagValue(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([^<]*)</${tagName}>`));
  return match?.[1] ?? null;
}

function readAppStatistics(xml) {
  return {
    words: readXmlTagValue(xml, 'Words'),
    characters: readXmlTagValue(xml, 'Characters'),
    charactersWithSpaces: readXmlTagValue(xml, 'CharactersWithSpaces'),
  };
}

async function createHeadlessEditor(testDoc = TEST_DOC) {
  const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(testDoc);
  return initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
}

describe('OPC package metadata: custom-properties registration', () => {
  it('getUpdatedDocs includes correct [Content_Types].xml and _rels/.rels for new custom.xml', async () => {
    const { editor } = await createHeadlessEditor();

    try {
      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });

      // The export should create docProps/custom.xml (SuperdocVersion)
      expect(updatedDocs['docProps/custom.xml']).toBeTruthy();

      // [Content_Types].xml must include the custom-properties Override
      expect(updatedDocs['[Content_Types].xml']).toBeTruthy();
      const overrides = getOverrides(updatedDocs['[Content_Types].xml']);
      const customOverride = overrides.find((o) => o.partName === '/docProps/custom.xml');
      expect(customOverride).toBeTruthy();
      expect(customOverride.contentType).toBe(CT_CUSTOM);

      // _rels/.rels must include the custom-properties Relationship
      expect(updatedDocs['_rels/.rels']).toBeTruthy();
      const rels = getRelationships(updatedDocs['_rels/.rels']);
      const customRel = rels.find((r) => r.type === REL_CUSTOM);
      expect(customRel).toBeTruthy();
      expect(customRel.target).toBe('docProps/custom.xml');
    } finally {
      editor.destroy();
    }
  });

  it('zipped export includes valid package metadata for new custom.xml', async () => {
    const { editor } = await createHeadlessEditor();

    try {
      const exportedBuffer = await editor.exportDocx({ compression: 'STORE' });
      const nodeBuffer =
        exportedBuffer instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(exportedBuffer))
          : Buffer.from(exportedBuffer);

      const zipper = new DocxZipper();
      const entries = await zipper.getDocxData(nodeBuffer, true);

      // docProps/custom.xml should exist
      const customEntry = entries.find((e) => e.name === 'docProps/custom.xml');
      expect(customEntry).toBeTruthy();

      // [Content_Types].xml must include the Override
      const ctEntry = entries.find((e) => e.name === '[Content_Types].xml');
      expect(ctEntry).toBeTruthy();
      const overrides = getOverrides(ctEntry.content);
      const customOverride = overrides.find((o) => o.partName === '/docProps/custom.xml');
      expect(customOverride).toBeTruthy();
      expect(customOverride.contentType).toBe(CT_CUSTOM);

      // _rels/.rels must include the Relationship
      const relsEntry = entries.find((e) => e.name === '_rels/.rels');
      expect(relsEntry).toBeTruthy();
      const rels = getRelationships(relsEntry.content);
      const customRel = rels.find((r) => r.type === REL_CUSTOM);
      expect(customRel).toBeTruthy();
      expect(customRel.target).toBe('docProps/custom.xml');
    } finally {
      editor.destroy();
    }
  });

  it('preserves existing managed registrations without duplication', async () => {
    const { editor } = await createHeadlessEditor();

    try {
      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });

      // The original blank-doc has overrides for word/document.xml, docProps/core.xml, docProps/app.xml.
      // After export, each of those should still appear exactly once.
      const overrides = getOverrides(updatedDocs['[Content_Types].xml']);
      const docOverrides = overrides.filter((o) => o.partName === '/word/document.xml');
      const coreOverrides = overrides.filter((o) => o.partName === '/docProps/core.xml');
      const appOverrides = overrides.filter((o) => o.partName === '/docProps/app.xml');

      expect(docOverrides).toHaveLength(1);
      expect(coreOverrides).toHaveLength(1);
      expect(appOverrides).toHaveLength(1);

      // Same for _rels/.rels relationships
      const rels = getRelationships(updatedDocs['_rels/.rels']);
      const officeDocRels = rels.filter(
        (r) => r.type === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
      );
      const coreRels = rels.filter(
        (r) => r.type === 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
      );
      const appRels = rels.filter(
        (r) => r.type === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
      );

      expect(officeDocRels).toHaveLength(1);
      expect(coreRels).toHaveLength(1);
      expect(appRels).toHaveLength(1);
    } finally {
      editor.destroy();
    }
  });

  it('getUpdatedDocs includes refreshed docProps/app.xml statistics', async () => {
    const { editor } = await createHeadlessEditor();

    try {
      editor.commands.insertContent(WORD_STAT_TEXT);

      const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });
      const appXml = updatedDocs['docProps/app.xml'];

      expect(appXml).toBeTruthy();
      expect(readAppStatistics(appXml)).toEqual({
        words: '3',
        characters: '14',
        charactersWithSpaces: '16',
      });
    } finally {
      editor.destroy();
    }
  });

  it('linked child exports keep docProps/app.xml statistics scoped to the main document', async () => {
    const { editor } = await createHeadlessEditor();
    let childEditor = null;

    try {
      editor.commands.insertContent(PARENT_WORD_STAT_TEXT);

      childEditor = editor.createChildEditor({
        isHeadless: true,
        isHeaderOrFooter: true,
      });
      childEditor.commands.insertContent(CHILD_ONLY_TEXT);

      const updatedDocs = await childEditor.exportDocx({ getUpdatedDocs: true });
      const appXml = updatedDocs['docProps/app.xml'];

      expect(appXml).toBeTruthy();
      expect(readAppStatistics(appXml)).toEqual({
        words: '4',
        characters: '19',
        charactersWithSpaces: '22',
      });
    } finally {
      childEditor?.destroy();
      editor.destroy();
    }
  });
});
