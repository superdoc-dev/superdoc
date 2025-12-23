import { describe, it, expect } from 'vitest';
import { computeDiff } from './computeDiff';

import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTestDataAsBuffer } from '@tests/export/export-helpers/export-helpers.js';

import { ChangeSet } from 'prosemirror-changeset';
import { Transform } from 'prosemirror-transform';

const getDocument = async (name) => {
  const buffer = await getTestDataAsBuffer(name);
  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

  const editor = new Editor({
    isHeadless: true,
    extensions: getStarterExtensions(),
    documentId: 'test-doc',
    content: docx,
    mode: 'docx',
    media,
    mediaFiles,
    fonts,
    annotations: true,
  });

  return editor.state.doc;
};

describe('Diff', () => {
  it('Compares two documents and identifies added, deleted, and modified paragraphs', async () => {
    const docBefore = await getDocument('diff_before.docx');
    const docAfter = await getDocument('diff_after.docx');

    const diffs = computeDiff(docBefore, docAfter);
    const getDiff = (type, predicate) => diffs.find((diff) => diff.type === type && predicate(diff));

    const modifiedDiffs = diffs.filter((diff) => diff.type === 'modified');
    const addedDiffs = diffs.filter((diff) => diff.type === 'added');
    const deletedDiffs = diffs.filter((diff) => diff.type === 'deleted');
    const attrOnlyDiffs = modifiedDiffs.filter((diff) => diff.textDiffs.length === 0);

    expect(diffs).toHaveLength(19);
    expect(modifiedDiffs).toHaveLength(9);
    expect(addedDiffs).toHaveLength(5);
    expect(deletedDiffs).toHaveLength(5);
    expect(attrOnlyDiffs).toHaveLength(4);
    attrOnlyDiffs.forEach((diff) => {
      expect(diff.attrsDiff).not.toBeNull();
    });

    // Modified paragraph with multiple text diffs
    let diff = getDiff(
      'modified',
      (diff) => diff.oldText === 'Curabitur facilisis ligula suscipit enim pretium, sed porttitor augue consequat.',
    );
    expect(diff?.newText).toBe(
      'Curabitur facilisis ligula suscipit enim pretium et nunc ligula, porttitor augue consequat maximus.',
    );
    expect(diff?.textDiffs).toHaveLength(6);

    // Deleted paragraph
    diff = getDiff(
      'deleted',
      (diff) => diff.oldText === 'Vestibulum gravida eros sed nulla malesuada, vel eleifend sapien bibendum.',
    );
    expect(diff).toBeDefined();

    // Added paragraph
    diff = getDiff(
      'added',
      (diff) =>
        diff.text === 'Lorem tempor velit eget lorem posuere, id luctus dolor ultricies, to track supplier risks.',
    );
    expect(diff).toBeDefined();

    // Another modified paragraph
    diff = getDiff(
      'modified',
      (diff) => diff.oldText === 'Quisque posuere risus a ligula cursus vulputate et vitae ipsum.',
    );
    expect(diff?.newText).toBe(
      'Quisque dapibus risus convallis ligula cursus vulputate, ornare dictum ipsum et vehicula nisl.',
    );

    // Simple modified paragraph
    diff = getDiff('modified', (diff) => diff.oldText === 'OK' && diff.newText === 'No');
    expect(diff).toBeDefined();

    // Added, trimmed, merged, removed, and moved paragraphs
    diff = getDiff('added', (diff) => diff.text === 'Sed et nibh in nulla blandit maximus et dapibus.');
    expect(diff).toBeDefined();

    const trimmedParagraph = getDiff(
      'modified',
      (diff) =>
        diff.oldText ===
          'Sed et nibh in nulla blandit maximus et dapibus. Etiam egestas diam luctus sit amet gravida purus.' &&
        diff.newText === 'Etiam egestas diam luctus sit amet gravida purus.',
    );
    expect(trimmedParagraph).toBeDefined();

    const mergedParagraph = getDiff(
      'added',
      (diff) =>
        diff.text ===
        'Praesent dapibus lacus vitae tellus laoreet, eget facilisis mi facilisis, donec mollis lacus sed nisl posuere, nec feugiat massa fringilla.',
    );
    expect(mergedParagraph).toBeDefined();

    const removedParagraph = getDiff(
      'modified',
      (diff) =>
        diff.oldText === 'Praesent dapibus lacus vitae tellus laoreet, eget facilisis mi facilisis.' &&
        diff.newText === '',
    );
    expect(removedParagraph).toBeDefined();

    const movedParagraph = getDiff(
      'added',
      (diff) => diff.text === 'Aenean hendrerit elit vitae sem fermentum, vel sagittis erat gravida.',
    );
    expect(movedParagraph).toBeDefined();

    // Attribute-only paragraph change
    const namParagraph = attrOnlyDiffs.find(
      (diff) => diff.oldText === 'Nam ultricies velit vitae purus eleifend pellentesque.',
    );
    expect(namParagraph?.attrsDiff?.modified).toBeDefined();
  });

  it('Compare two documents with simple changes', async () => {
    const docBefore = await getDocument('diff_before2.docx');
    const docAfter = await getDocument('diff_after2.docx');

    const diffs = computeDiff(docBefore, docAfter);
    expect(diffs).toHaveLength(4);

    let diff = diffs.find((diff) => diff.type === 'modified' && diff.oldText === 'Here’s some text.');

    expect(diff.newText).toBe('Here’s some NEW text.');
    expect(diff.textDiffs).toHaveLength(1);
    expect(diff.textDiffs[0].text).toBe('NEW ');
    expect(diff.attrsDiff?.modified?.textId).toBeDefined();

    diff = diffs.find((diff) => diff.type === 'deleted' && diff.oldText === 'I deleted this sentence.');
    expect(diff).toBeDefined();

    diff = diffs.find((diff) => diff.type === 'added' && diff.text === 'I added this sentence.');
    expect(diff).toBeDefined();

    diff = diffs.find((diff) => diff.type === 'modified' && diff.oldText === 'We are not done yet.');
    expect(diff.newText).toBe('We are done now.');
    expect(diff.textDiffs).toHaveLength(3);
    expect(diff.attrsDiff?.modified?.textId).toBeDefined();
  });

  // it.only('Test prosemirror-changeset', async () => {
  //   const docA = await getDocument('diff_before.docx');
  //   const docB = await getDocument('diff_after.docx');
  //
  //   // Produce StepMaps that turn A into B
  //   const tr = new Transform(docA)
  //   tr.replaceWith(0, docA.content.size, docB.content)
  //
  //   // Diff them: metadata tags each span with the author
  //   const encoder = {
  //     encodeCharacter: (char, marks) => (JSON.stringify({type: "char", char, marks})),
  //     encodeNodeStart: node => (JSON.stringify({type: "open", name: node.type.name, attrs: node.attrs})),
  //     encodeNodeEnd: node => (JSON.stringify({type: "close", name: node.type.name})),
  //     compareTokens: (a, b) => JSON.stringify(a) === JSON.stringify(b)
  //   }
  //   const originalChangeSet = ChangeSet
  //     .create(docA, (a, b) => a === b ? a : null, encoder);
  //
  //   debugger;
  //   const changeSet = originalChangeSet
  //     .addSteps(docB, tr.mapping.maps)
  //
  //   // Inspect the replacements
  //   for (const change of changeSet.changes) {
  //     console.log(JSON.stringify(change, null, 2));
  //   }
  // });
});
