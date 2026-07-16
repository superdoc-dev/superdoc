import { describe, expect, it, vi } from 'vitest';
import { Doc as YDoc } from 'yjs';
import { Awareness } from 'y-protocols/awareness.js';
import JSZip from 'jszip';

import { Editor } from '@core/Editor.js';
import { seedEditorStateToYDoc } from '@extensions/collaboration/seed-editor-to-ydoc.js';
import { getTestDataAsFileBuffer, initTestEditor } from '@tests/helpers/helpers.js';

const FIELD_INSTRUCTION = ' MERGEFIELD CustomerName \\* MERGEFORMAT ';
const FIELD_RESULT = 'Acme Corp';

const createProviderStub = (ydoc) => ({
  synced: true,
  isSynced: true,
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
  awareness: new Awareness(ydoc),
});

const readDocxPart = async (buffer, path) => {
  const zip = await JSZip.loadAsync(buffer);
  return zip.files[path]?.async('string');
};

const buildOneMergeFieldDocx = async () => {
  const baseBuffer = await getTestDataAsFileBuffer('blank-doc.docx');
  const zip = await JSZip.loadAsync(baseBuffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');

  if (!documentXml) {
    throw new Error('blank-doc.docx is missing word/document.xml');
  }

  const fieldParagraph =
    '<w:p w14:paraId="33630001" w14:textId="77777777">' +
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    `<w:r><w:instrText xml:space="preserve">${FIELD_INSTRUCTION}</w:instrText></w:r>` +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    `<w:r><w:t>${FIELD_RESULT}</w:t></w:r>` +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
    '</w:p>';

  const patchedDocumentXml = documentXml.replace(
    /<w:body>[\s\S]*?(<w:sectPr[\s\S]*?<\/w:sectPr>)<\/w:body>/,
    `<w:body>${fieldParagraph}$1</w:body>`,
  );

  if (patchedDocumentXml === documentXml) {
    throw new Error('Could not inject MERGEFIELD paragraph into blank-doc.docx');
  }

  zip.file('word/document.xml', patchedDocumentXml);
  return zip.generateAsync({ type: 'nodebuffer' });
};

const countFieldChars = (documentXml, type) => {
  const matches = documentXml.match(new RegExp(`w:fldCharType="${type}"`, 'g'));
  return matches?.length ?? 0;
};

const expectValidMergeFieldEnvelope = (documentXml) => {
  expect(documentXml).toContain('w:instrText');
  expect(documentXml).toContain('MERGEFIELD CustomerName');
  expect(countFieldChars(documentXml, 'begin')).toBe(1);
  expect(countFieldChars(documentXml, 'separate')).toBe(1);
  expect(countFieldChars(documentXml, 'end')).toBe(1);
  expect(documentXml).toMatch(
    /w:fldCharType="begin"[\s\S]*<w:instrText[^>]*>[\s\S]*MERGEFIELD CustomerName[\s\S]*<\/w:instrText>[\s\S]*w:fldCharType="separate"[\s\S]*w:fldCharType="end"/,
  );
};

const insertTextBeforeField = (editor) => {
  editor.dispatch(editor.state.tr.insertText('Edited: ', 1));
  expect(editor.state.doc.textContent).toContain('Edited: ');
};

describe('collaboration MERGEFIELD DOCX export', () => {
  it('preserves a passthrough MERGEFIELD instruction after Yjs seed and join', async () => {
    const source = await buildOneMergeFieldDocx();
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(source, true);
    const ydoc = new YDoc();
    const provider = createProviderStub(ydoc);

    const { editor: seedEditor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    seedEditorStateToYDoc(seedEditor, ydoc);

    const { editor: joiningEditor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      ydoc,
      collaborationProvider: provider,
      fragment: ydoc.getXmlFragment('supereditor'),
      isHeadless: true,
      isNewFile: false,
    });

    try {
      insertTextBeforeField(joiningEditor);

      const exported = await joiningEditor.exportDocx({ isFinalDoc: true });
      const documentXml = await readDocxPart(exported, 'word/document.xml');

      expect(documentXml).toBeTruthy();
      expect(documentXml).toContain('Edited: ');
      expectValidMergeFieldEnvelope(documentXml);
    } finally {
      seedEditor.destroy();
      joiningEditor.options.ydoc = null;
      joiningEditor.options.collaborationProvider = null;
      joiningEditor.destroy();
      ydoc.destroy();
    }
  });
});
