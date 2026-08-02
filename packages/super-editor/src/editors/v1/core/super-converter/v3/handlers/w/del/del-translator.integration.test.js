// Full importer-pipeline regression test mirroring ins-translator.integration.test.js
// for the w:del side of the same bug class (trackDelete only applied to
// content[0] when it was text). The fixture is derived from
// tests/data/behavior-fixtures/tracked-insert-nobreakhyphen.docx by converting
// its two noBreakHyphen-leading tracked-insert runs (paragraph 16, w:id 2/3)
// into tracked-delete runs (<w:del>/<w:delText> per OOXML CT_RunTrackChange) —
// the original repro docx contains no w:del content of its own.
import { describe, it, expect, afterEach } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

const findParagraphNode = (docJson, needle) =>
  (docJson.content || []).find((node) => node.type === 'paragraph' && JSON.stringify(node).includes(needle));

const flattenInlineContent = (paragraphNode) =>
  (paragraphNode.content || []).flatMap((runNode) => runNode.content || []);

const hasTrackDeleteMark = (node) => (node.marks || []).some((mark) => mark.type === 'trackDelete');

describe('w:del importer-pipeline integration: run beginning with w:noBreakHyphen', () => {
  let editor;

  afterEach(() => {
    if (editor) {
      editor.destroy();
      editor = null;
    }
  });

  it('imports the noBreakHyphen atom and the text following it as one tracked deletion (paragraph 16)', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(
      'behavior-fixtures/tracked-delete-nobreakhyphen.docx',
    );
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    const docJson = editor.getJSON();
    const paragraph16 = findParagraphNode(docJson, 'Notwithstanding any other provision');
    expect(paragraph16).toBeTruthy();

    const inlineNodes = flattenInlineContent(paragraph16);
    // Only w:id 2/3 were converted to <w:del> in this fixture (see the header
    // comment); w:id 1 stays a plain tracked insertion, so scope assertions to
    // the two converted runs' known text rather than every node in the paragraph.
    const deletedTextNodes = inlineNodes.filter(
      (node) => node.type === 'text' && (node.text.includes('tangible form') || node.text.includes('unaided memories')),
    );
    expect(deletedTextNodes.length).toBe(2);

    const noBreakHyphenNodes = inlineNodes.filter((node) => node.type === 'noBreakHyphen');
    expect(noBreakHyphenNodes.length).toBe(2);

    [...noBreakHyphenNodes, ...deletedTextNodes].forEach((node) => {
      expect(hasTrackDeleteMark(node)).toBe(true);
    });
  });
});
