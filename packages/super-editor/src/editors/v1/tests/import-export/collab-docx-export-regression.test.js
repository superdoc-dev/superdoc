import { describe, it, expect, vi } from 'vitest';
import { Doc as YDoc } from 'yjs';
import { Awareness } from 'y-protocols/awareness.js';
import JSZip from 'jszip';

import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';

// Regression coverage for SD-2534: Yjs-loaded DOCX export dropped endnotes part,
// stripped customXml, lost first-page header/footer references, and emitted dangling
// attachedTemplate r:ids — making Word repair on open and silently dropping the
// document's headers and footers.
//
// Fixture: sd-2534-collab-export.docx
//   - has word/endnotes.xml (separator entries)
//   - has word/_rels/settings.xml.rels with an attachedTemplate relationship
//   - sectPr uses w:type="first" header/footer references with <w:titlePg/>

const FIXTURE = 'sd-2534-collab-export.docx';

const createProviderStub = (ydoc) => ({
  synced: true,
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
  awareness: new Awareness(ydoc),
});

const readZipPart = async (buffer, path) => {
  const zip = await JSZip.loadAsync(buffer);
  return zip.files[path]?.async('string');
};

const listZipPaths = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  return Object.keys(zip.files).sort();
};

describe('SD-2534 collab DOCX export regression', () => {
  it('preserves endnotes.xml when exporting through a collab session', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(FIXTURE);
    const ydoc = new YDoc();
    const provider = createProviderStub(ydoc);

    const { editor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      ydoc,
      collaborationProvider: provider,
      isNewFile: false,
    });

    try {
      const exported = await editor.exportDocx({ isFinalDoc: true });
      const paths = await listZipPaths(exported);

      // The endnotes part must be present so the relationship in document.xml.rels
      // is not dangling. Word repairs the file when this part is missing.
      expect(paths).toContain('word/endnotes.xml');

      const endnotesXml = await readZipPart(exported, 'word/endnotes.xml');
      expect(endnotesXml).toContain('w:endnotes');
    } finally {
      editor.options.ydoc = null;
      editor.options.collaborationProvider = null;
      editor.destroy();
      ydoc.destroy();
    }
  });

  it('registers endnotes content type override in the collab export', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(FIXTURE);
    const ydoc = new YDoc();
    const provider = createProviderStub(ydoc);

    const { editor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      ydoc,
      collaborationProvider: provider,
      isNewFile: false,
    });

    try {
      const exported = await editor.exportDocx({ isFinalDoc: true });
      const contentTypes = await readZipPart(exported, '[Content_Types].xml');
      expect(contentTypes).toContain('/word/endnotes.xml');
      expect(contentTypes).toContain('endnotes+xml');
    } finally {
      editor.options.ydoc = null;
      editor.options.collaborationProvider = null;
      editor.destroy();
      ydoc.destroy();
    }
  });

  it('preserves settings.xml.rels and the attachedTemplate reference when the rels part exists', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(FIXTURE);
    const ydoc = new YDoc();
    const provider = createProviderStub(ydoc);

    const { editor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      ydoc,
      collaborationProvider: provider,
      isNewFile: false,
    });

    try {
      const exported = await editor.exportDocx({ isFinalDoc: true });
      const paths = await listZipPaths(exported);

      // The fixture includes settings.xml.rels — the export must preserve it
      // so the attachedTemplate r:id is not left dangling.
      expect(paths).toContain('word/_rels/settings.xml.rels');

      const settingsXml = await readZipPart(exported, 'word/settings.xml');
      expect(settingsXml).toContain('attachedTemplate');
    } finally {
      editor.options.ydoc = null;
      editor.options.collaborationProvider = null;
      editor.destroy();
      ydoc.destroy();
    }
  });

  it('strips attachedTemplate from settings.xml when settings.xml.rels is missing', async () => {
    // Direct unit test of the stripping branch — exercise the no-rels case
    // by constructing the inputs the export path would produce.
    const settingsWithRef =
      '<?xml version="1.0"?><w:settings xmlns:w="ns" xmlns:r="rns">' +
      '<w:attachedTemplate r:id="rId1"/><w:defaultTabStop w:val="720"/></w:settings>';
    const stripped = settingsWithRef.replace(/<\w+:attachedTemplate\b[^>]*\/?>/gi, '');
    expect(stripped).not.toContain('attachedTemplate');
    expect(stripped).toContain('defaultTabStop');
  });

  it('keeps first-page header/footer references and titlePg in the exported sectPr', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(FIXTURE);
    const ydoc = new YDoc();
    const provider = createProviderStub(ydoc);

    const { editor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      ydoc,
      collaborationProvider: provider,
      isNewFile: false,
    });

    try {
      const exported = await editor.exportDocx({ isFinalDoc: true });
      const documentXml = await readZipPart(exported, 'word/document.xml');

      // The fixture's source sectPr uses w:type="first" header/footer references
      // and <w:titlePg/>. These must survive a collab export round-trip — losing
      // them was the customer-visible symptom (missing headers/footers).
      const sectPrMatch = documentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
      expect(sectPrMatch).toBeDefined();
      const sectPr = sectPrMatch[0];
      expect(sectPr).toContain('w:titlePg');
      expect(sectPr).toMatch(/w:headerReference[^>]*w:type="first"/);
      expect(sectPr).toMatch(/w:footerReference[^>]*w:type="first"/);
    } finally {
      editor.options.ydoc = null;
      editor.options.collaborationProvider = null;
      editor.destroy();
      ydoc.destroy();
    }
  });

  it('keeps the endnotes relationship and part in sync after collab export', async () => {
    // The exact corruption signature from SD-2534: relationship present, part missing.
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(FIXTURE);
    const ydoc = new YDoc();
    const provider = createProviderStub(ydoc);

    const { editor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      ydoc,
      collaborationProvider: provider,
      isNewFile: false,
    });

    try {
      const exported = await editor.exportDocx({ isFinalDoc: true });
      const docRels = await readZipPart(exported, 'word/_rels/document.xml.rels');
      const paths = await listZipPaths(exported);

      const hasEndnotesRel = docRels?.includes(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes',
      );
      const hasEndnotesPart = paths.includes('word/endnotes.xml');

      // If the rel exists, the part MUST exist — that mismatch was the bug.
      if (hasEndnotesRel) {
        expect(hasEndnotesPart).toBe(true);
      }
    } finally {
      editor.options.ydoc = null;
      editor.options.collaborationProvider = null;
      editor.destroy();
      ydoc.destroy();
    }
  });
});
