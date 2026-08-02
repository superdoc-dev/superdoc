// Full importer-pipeline regression test for the "V1 w:ins loses tracking when
// a run begins with w:noBreakHyphen" bug. Goes through the real Editor import
// path (Editor.loadXmlData + new Editor(...)), not just a direct translator
// call, using a docx copied from plans/repro_tracked_insert_nbh.docx (that
// path is gitignored, so a tracked copy lives under tests/data/behavior-fixtures/).
import { describe, it, expect, afterEach } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

const findParagraphNode = (docJson, needle) =>
  (docJson.content || []).find((node) => node.type === 'paragraph' && JSON.stringify(node).includes(needle));

const flattenInlineContent = (paragraphNode) =>
  (paragraphNode.content || []).flatMap((runNode) => runNode.content || []);

const hasTrackInsertMark = (node) => (node.marks || []).some((mark) => mark.type === 'trackInsert');

describe('w:ins importer-pipeline integration: run beginning with w:noBreakHyphen', () => {
  let editor;

  afterEach(() => {
    if (editor) {
      editor.destroy();
      editor = null;
    }
  });

  it('imports the noBreakHyphen atom and the text following it as one tracked insertion (paragraph 16)', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(
      'behavior-fixtures/tracked-insert-nobreakhyphen.docx',
    );
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    const docJson = editor.getJSON();
    const paragraph16 = findParagraphNode(docJson, 'Notwithstanding any other provision');
    expect(paragraph16).toBeTruthy();

    const inlineNodes = flattenInlineContent(paragraph16);
    const noBreakHyphenNodes = inlineNodes.filter((node) => node.type === 'noBreakHyphen');
    expect(noBreakHyphenNodes.length).toBeGreaterThan(0);

    // Every noBreakHyphen atom in this tracked paragraph must carry trackInsert.
    noBreakHyphenNodes.forEach((node) => {
      expect(hasTrackInsertMark(node)).toBe(true);
    });

    // And so must every text node in the paragraph, including the text that
    // follows a noBreakHyphen atom within the same run.
    const textNodes = inlineNodes.filter((node) => node.type === 'text');
    expect(textNodes.length).toBeGreaterThan(0);
    textNodes.forEach((node) => {
      expect(hasTrackInsertMark(node)).toBe(true);
    });
  });

  it('does not regress the control paragraph using plain hyphen-minus characters (paragraph 16B)', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(
      'behavior-fixtures/tracked-insert-nobreakhyphen.docx',
    );
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    const docJson = editor.getJSON();
    const paragraph16B = findParagraphNode(docJson, 'control paragraph');
    expect(paragraph16B).toBeTruthy();

    const textNodes = flattenInlineContent(paragraph16B).filter((node) => node.type === 'text');
    expect(textNodes.length).toBeGreaterThan(0);
    textNodes.forEach((node) => {
      expect(hasTrackInsertMark(node)).toBe(true);
    });
  });
});
