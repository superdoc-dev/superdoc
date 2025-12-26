import { describe, it, expect } from 'vitest';
import { computeDiff } from './computeDiff';

import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTestDataAsBuffer } from '@tests/export/export-helpers/export-helpers.js';

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
    const getDiff = (action, predicate) => diffs.find((diff) => diff.action === action && predicate(diff));

    const modifiedDiffs = diffs.filter((diff) => diff.action === 'modified');
    const addedDiffs = diffs.filter((diff) => diff.action === 'added');
    const deletedDiffs = diffs.filter((diff) => diff.action === 'deleted');
    const attrOnlyDiffs = modifiedDiffs.filter((diff) => diff.contentDiff.length === 0);

    expect(diffs).toHaveLength(19);
    expect(modifiedDiffs).toHaveLength(9);
    expect(addedDiffs).toHaveLength(5);
    expect(deletedDiffs).toHaveLength(5);
    expect(attrOnlyDiffs).toHaveLength(4);

    // Modified paragraph with multiple text diffs
    let diff = getDiff(
      'modified',
      (diff) => diff.oldText === 'Curabitur facilisis ligula suscipit enim pretium, sed porttitor augue consequat.',
    );
    expect(diff?.newText).toBe(
      'Curabitur facilisis ligula suscipit enim pretium et nunc ligula, porttitor augue consequat maximus.',
    );
    const textPropsChanges = diff?.contentDiff.filter((textDiff) => textDiff.action === 'modified');
    expect(textPropsChanges).toHaveLength(18);
    expect(diff?.contentDiff).toHaveLength(24);

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

    let diff = diffs.find((diff) => diff.action === 'modified' && diff.oldText === 'Here’s some text.');

    expect(diff.newText).toBe('Here’s some NEW text.');
    expect(diff.contentDiff).toHaveLength(3);
    expect(diff.contentDiff[0].newText).toBe(' ');
    expect(diff.contentDiff[1].text).toBe('NEW');
    expect(diff.contentDiff[2].text).toBe(' ');
    expect(diff.attrsDiff?.modified?.textId).toBeDefined();

    diff = diffs.find((diff) => diff.action === 'deleted' && diff.oldText === 'I deleted this sentence.');
    expect(diff).toBeDefined();

    diff = diffs.find((diff) => diff.action === 'added' && diff.text === 'I added this sentence.');
    expect(diff).toBeDefined();

    diff = diffs.find((diff) => diff.action === 'modified' && diff.oldText === 'We are not done yet.');
    expect(diff.newText).toBe('We are done now.');
    expect(diff.contentDiff).toHaveLength(3);
    expect(diff.attrsDiff?.modified?.textId).toBeDefined();
  });

  it('Compare another set of two documents with only formatting changes', async () => {
    const docBefore = await getDocument('diff_before4.docx');
    const docAfter = await getDocument('diff_after4.docx');

    const diffs = computeDiff(docBefore, docAfter);

    expect(diffs).toHaveLength(1);
    const diff = diffs[0];
    expect(diff.action).toBe('modified');
  });

  it('Compare another set of two documents with only formatting changes', async () => {
    const docBefore = await getDocument('diff_before5.docx');
    const docAfter = await getDocument('diff_after5.docx');

    const diffs = computeDiff(docBefore, docAfter);

    expect(diffs).toHaveLength(1);
    const diff = diffs[0];
    expect(diff.action).toBe('modified');
  });

  it('Compare another set of two documents where an image was added', async () => {
    const docBefore = await getDocument('diff_before6.docx');
    const docAfter = await getDocument('diff_after6.docx');

    const diffs = computeDiff(docBefore, docAfter);
    expect(diffs).toHaveLength(1);
    const diff = diffs[0];
    expect(diff.action).toBe('modified');
    expect(diff.contentDiff).toHaveLength(3);
    expect(diff.contentDiff[0].action).toBe('modified');
    expect(diff.contentDiff[0].kind).toBe('text');
    expect(diff.contentDiff[1].action).toBe('added');
    expect(diff.contentDiff[1].kind).toBe('inlineNode');
    expect(diff.contentDiff[2].action).toBe('added');
    expect(diff.contentDiff[2].kind).toBe('text');
  });
});
