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

  it('exports every original per-run w:id individually, even though they now share one internal id', async () => {
    // trackedChangeIdMapper.js's same-type chaining (added to fix "7 bubbles
    // instead of 1" — see tracked-change-resolver.repro-nobreakhyphen.integration.test.ts)
    // merges the *internal* mark id shared across all runs in the chain, but
    // must not affect the *exported* w:id — each run keeps writing back its
    // own original Word id via `sourceId`, independently of that merge.
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(
      'behavior-fixtures/tracked-insert-nobreakhyphen.docx',
    );
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    const xml = await editor.exportDocx({ exportXmlOnly: true, isFinalDoc: false });
    const ids = [...xml.matchAll(/<w:ins w:id="(\d+)"/g)].map((match) => match[1]);

    // Every exported id is distinct — no accidental collapse onto a shared id.
    expect(new Set(ids).size).toBe(ids.length);
    // The runs that were split by w:noBreakHyphen/paragraph marks in the
    // fixture (paragraphs 16, 16A, 16B) all still round-trip individually.
    expect(ids).toEqual(expect.arrayContaining(['1', '2', '3', '5', '6', '7', '9']));
  });
});
