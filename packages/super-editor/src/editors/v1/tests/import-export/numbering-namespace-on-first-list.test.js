import { describe, it, expect } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'fs';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor } from '../helpers/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const findNumberingRoot = (json) => {
  if (!json?.elements?.length) return null;
  if (json.elements[0]?.name === 'w:numbering') return json.elements[0];
  return json.elements.find((el) => el?.name === 'w:numbering') || null;
};

// GH #3773: a docx imported with no `word/numbering.xml` (blank-doc.docx has none —
// see the SD-2911 P2 sanity test) that then gets its first numbered list added via
// `toggleOrderedList` must still export a namespace-complete `<w:numbering>` root.
// The part is created on-the-fly by the parts system (numbering-part-descriptor.ts)
// mid-session, so the legacy `baseNumbering` export-time fallback never runs for it —
// the part descriptor's own namespace map has to be complete on its own.
describe('numbering.xml namespaces when the first list is added to a numbering-less doc (GH #3773)', () => {
  it('emits the full namespace set (including xmlns:w16cid) on the freshly-created numbering part', async () => {
    const docxPath = join(__dirname, '../data', 'blank-doc.docx');
    const docxBuffer = await fs.readFile(docxPath);

    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    editor.commands.insertContent('First item');
    editor.commands.toggleOrderedList();

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    const exportedZipper = new DocxZipper();
    const exportedFiles = await exportedZipper.getDocxData(exportedBuffer, true);
    const exportedNumberingEntry = exportedFiles.find((entry) => entry.name === 'word/numbering.xml');

    expect(exportedNumberingEntry, 'export must contain word/numbering.xml').toBeDefined();

    const exportedRoot = findNumberingRoot(parseXmlToJson(exportedNumberingEntry.content));

    expect(exportedRoot.attributes['xmlns:w16cid']).toBe('http://schemas.microsoft.com/office/word/2016/wordml/cid');
    expect(exportedRoot.attributes['xmlns:w14']).toBe('http://schemas.microsoft.com/office/word/2010/wordml');
    expect(exportedRoot.attributes['xmlns:r']).toBe(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    );
    expect(exportedRoot.attributes['mc:Ignorable']).toContain('w16cid');
  });
});
