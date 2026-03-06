import { describe, it, expect } from 'vitest';
import { computeDiff } from './computeDiff';

import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTestDataAsBuffer } from '@tests/export/export-helpers/export-helpers.js';

/**
 * Loads a DOCX fixture and returns the ProseMirror document and schema.
 *
 * @param {string} name DOCX fixture filename.
 * @returns {Promise<{ doc: import('prosemirror-model').Node; schema: import('prosemirror-model').Schema; comments: Array<Record<string, unknown>> }>}
 */
const getDocument = async (name) => {
  const buffer = await getTestDataAsBuffer(`diffing/${name}`);
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

  return { doc: editor.state.doc, schema: editor.schema, comments: editor.converter.comments };
};

/**
 * Flattens a ProseMirror JSON node to its text content.
 *
 * @param {import('prosemirror-model').Node | import('prosemirror-model').Node['toJSON'] | null | undefined} nodeJSON
 * @returns {string}
 */
const getNodeTextContent = (nodeJSON) => {
  if (!nodeJSON) {
    return '';
  }
  if (typeof nodeJSON.text === 'string') {
    return nodeJSON.text;
  }
  if (Array.isArray(nodeJSON.content)) {
    return nodeJSON.content.map((child) => getNodeTextContent(child)).join('');
  }
  return '';
};

describe('Diff', () => {
  it('Compares two documents and identifies added, deleted, and modified paragraphs', async () => {
    const { doc: docBefore, schema } = await getDocument('diff_before.docx');
    const { doc: docAfter } = await getDocument('diff_after.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const diffs = docDiffs;
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
    const { doc: docBefore, schema } = await getDocument('diff_before2.docx');
    const { doc: docAfter } = await getDocument('diff_after2.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const diffs = docDiffs;
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
    const { doc: docBefore, schema } = await getDocument('diff_before4.docx');
    const { doc: docAfter } = await getDocument('diff_after4.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const diffs = docDiffs;

    expect(diffs).toHaveLength(1);
    const diff = diffs[0];
    expect(diff.action).toBe('modified');
  });

  it('Compare another set of two documents with only formatting changes', async () => {
    const { doc: docBefore, schema } = await getDocument('diff_before5.docx');
    const { doc: docAfter } = await getDocument('diff_after5.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const diffs = docDiffs;

    expect(diffs).toHaveLength(1);
    const diff = diffs[0];
    expect(diff.action).toBe('modified');
  });

  it('Compare another set of two documents where an image was added', async () => {
    const { doc: docBefore, schema } = await getDocument('diff_before6.docx');
    const { doc: docAfter } = await getDocument('diff_after6.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const diffs = docDiffs;
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

  it('Compare a complex document with table edits and tracked formatting', async () => {
    const { doc: docBefore, schema } = await getDocument('diff_before7.docx');
    const { doc: docAfter } = await getDocument('diff_after7.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const diffs = docDiffs;
    expect(diffs).toHaveLength(9);
    expect(diffs.filter((diff) => diff.action === 'modified')).toHaveLength(6);
    expect(diffs.filter((diff) => diff.action === 'added')).toHaveLength(2);
    expect(diffs.filter((diff) => diff.action === 'deleted')).toHaveLength(1);

    const formattingDiff = diffs.find(
      (diff) => diff.action === 'modified' && diff.oldText === 'This paragraph formatting will change.',
    );
    expect(formattingDiff?.contentDiff?.[0]?.runAttrsDiff?.modified).toHaveProperty('runProperties', {
      from: null,
      to: {
        bold: true,
        boldCs: true,
      },
    });

    const upgradedParagraph = diffs.find(
      (diff) => diff.action === 'modified' && diff.oldText === 'This paragraph will have words.',
    );
    expect(upgradedParagraph?.newText).toBe('This paragraph will have NEW words.');
    expect(
      upgradedParagraph?.contentDiff?.some(
        (change) => change.action === 'added' && typeof change.text === 'string' && change.text.includes('NEW'),
      ),
    ).toBe(true);

    const deletion = diffs.find(
      (diff) => diff.action === 'deleted' && diff.oldText === 'This paragraph will be deleted.',
    );
    expect(deletion).toBeDefined();

    const wordRemoval = diffs.find(
      (diff) => diff.action === 'modified' && diff.oldText === 'This word will be deleted.',
    );
    expect(wordRemoval?.newText).toBe('This will be deleted.');
    expect(wordRemoval?.contentDiff).toHaveLength(1);
    expect(wordRemoval?.contentDiff?.[0].action).toBe('deleted');

    const tableModification = diffs.find(
      (diff) => diff.action === 'modified' && diff.nodeType === 'table' && diff.oldNodeJSON,
    );
    expect(tableModification).toBeUndefined();

    const tableAddition = diffs.find((diff) => diff.action === 'added' && diff.nodeType === 'table');
    expect(getNodeTextContent(tableAddition?.nodeJSON)?.trim()).toBe('New table');

    const trailingParagraph = diffs.find(
      (diff) => diff.action === 'added' && diff.nodeType === 'paragraph' && diff.text === '',
    );
    expect(trailingParagraph).toBeDefined();

    const thirdHeaderDiff = diffs.find(
      (diff) =>
        diff.action === 'modified' && diff.oldText === 'Third header' && diff.newText === 'Third header modified',
    );
    expect(
      thirdHeaderDiff?.contentDiff?.some((change) => change.action === 'added' && change.text === ' modified'),
    ).toBe(true);

    const firstCellDiff = diffs.find(
      (diff) => diff.action === 'modified' && diff.oldText === 'First cell' && diff.newText === 'cell',
    );
    expect(firstCellDiff?.contentDiff?.[0]?.text).toBe('First ');
  });

  it('Compare documents with comments and tracked changes', async () => {
    const { doc: docBefore, schema, comments: commentsBefore } = await getDocument('diff_before8.docx');
    const { doc: docAfter, comments: commentsAfter } = await getDocument('diff_after8.docx');

    const { docDiffs, commentDiffs } = computeDiff(docBefore, docAfter, schema, commentsBefore, commentsAfter);

    expect(docDiffs.length).toBeGreaterThan(0);
    expect(docDiffs.filter((diff) => diff.action === 'modified')).toHaveLength(2);
    expect(commentDiffs).toHaveLength(2);

    const commentAnchorDiff = docDiffs.find(
      (diff) => diff.action === 'modified' && diff.oldText === 'Here’s some text. It has a comment.',
    );
    expect(commentAnchorDiff).toBeDefined();
    expect(commentAnchorDiff?.contentDiff?.some((change) => change.kind === 'inlineNode')).toBe(true);
    expect(
      commentAnchorDiff?.contentDiff?.some(
        (change) => change.kind === 'inlineNode' && change.nodeType === 'commentRangeStart',
      ),
    ).toBe(true);
    expect(
      commentAnchorDiff?.contentDiff?.some(
        (change) => change.kind === 'text' && change.marksDiff?.deleted?.some((mark) => mark.name === 'commentMark'),
      ),
    ).toBe(true);

    const trackedChangeDiff = docDiffs.find(
      (diff) => diff.action === 'modified' && diff.oldText === 'I will add a comment to this one too.',
    );
    expect(trackedChangeDiff).toBeDefined();
    expect(
      trackedChangeDiff?.contentDiff?.some(
        (change) => change.kind === 'text' && change.marksDiff?.added?.some((mark) => mark.name === 'commentMark'),
      ),
    ).toBe(true);
    expect(
      trackedChangeDiff?.contentDiff?.some(
        (change) => change.kind === 'text' && change.marksDiff?.added?.some((mark) => mark.name === 'trackDelete'),
      ),
    ).toBe(true);
    const addedTrackDelete = trackedChangeDiff?.contentDiff
      ?.filter((change) => change.kind === 'text')
      ?.flatMap((change) => change.marksDiff?.added ?? [])
      ?.find((mark) => mark.name === 'trackDelete');
    expect(addedTrackDelete?.attrs?.id).toBeTruthy();

    const modifiedComment = commentDiffs.find(
      (diff) => diff.action === 'modified' && diff.nodeType === 'comment' && diff.commentId === '0',
    );
    expect(modifiedComment).toBeDefined();
    expect(modifiedComment?.oldText).toBe('Old comment.');
    expect(modifiedComment?.newText).toBe('Old comment.');
    expect(modifiedComment?.attrsDiff?.modified?.isDone).toEqual({ from: false, to: true });

    const addedComment = commentDiffs.find(
      (diff) => diff.action === 'added' && diff.nodeType === 'comment' && diff.commentId === '1',
    );
    expect(addedComment).toBeDefined();
    expect(addedComment?.text).toBe('New comment');
  });

  it('does not emit tracked-change mark diffs when ids only differ across imports', async () => {
    const beforeA = await getDocument('diff_before11.docx');
    const beforeB = await getDocument('diff_before11.docx');
    const after = await getDocument('diff_after11.docx');

    const sameDiff = computeDiff(beforeA.doc, beforeB.doc, beforeA.schema, beforeA.comments, beforeB.comments);
    expect(sameDiff.docDiffs).toHaveLength(0);
    expect(sameDiff.commentDiffs).toHaveLength(0);

    const changedDiff = computeDiff(beforeA.doc, after.doc, beforeA.schema, beforeA.comments, after.comments);
    expect(changedDiff.docDiffs.length).toBeGreaterThan(0);
    expect(changedDiff.commentDiffs.length).toBeGreaterThan(0);

    const trackedChangeMarkNames = new Set(['trackInsert', 'trackDelete', 'trackFormat']);
    const trackedMarkDiffs = changedDiff.docDiffs
      .flatMap((diff) => diff.contentDiff ?? [])
      .filter((change) => change.kind === 'text' && change.marksDiff?.modified?.length)
      .flatMap((change) => change.marksDiff.modified)
      .filter((mark) => trackedChangeMarkNames.has(mark.name));

    expect(trackedMarkDiffs).toHaveLength(0);
  });

  it('returns null style diffs when style snapshots are omitted', async () => {
    const { doc, schema } = await getDocument('diff_before8.docx');
    const diff = computeDiff(doc, doc, schema);

    expect(diff.docDiffs).toHaveLength(0);
    expect(diff.commentDiffs).toHaveLength(0);
    expect(diff.stylesDiff).toBeNull();
    expect(diff.numberingDiff).toBeNull();
  });

  it('includes style diffs when old/new style snapshots differ', async () => {
    const { doc, schema } = await getDocument('diff_before8.docx');
    const oldStyles = {
      docDefaults: {},
      latentStyles: {},
      styles: {
        Normal: { styleId: 'Normal', type: 'paragraph', name: 'Normal' },
      },
    };
    const newStyles = {
      docDefaults: {},
      latentStyles: {},
      styles: {
        Normal: { styleId: 'Normal', type: 'paragraph', name: 'Normal Updated' },
        Heading1: { styleId: 'Heading1', type: 'paragraph', name: 'Heading 1' },
      },
    };

    const diff = computeDiff(doc, doc, schema, [], [], oldStyles, newStyles);

    expect(diff.docDiffs).toHaveLength(0);
    expect(diff.commentDiffs).toHaveLength(0);
    expect(diff.stylesDiff).not.toBeNull();
    expect(diff.numberingDiff).toBeNull();
    expect(diff.stylesDiff?.addedStyles).toHaveProperty('Heading1');
    expect(diff.stylesDiff?.removedStyles).toEqual({});
    expect(diff.stylesDiff?.modifiedStyles.Normal.modified.name).toEqual({
      from: 'Normal',
      to: 'Normal Updated',
    });
  });

  it('includes numbering diffs when old/new numbering snapshots differ', async () => {
    const { doc, schema } = await getDocument('diff_before8.docx');
    const oldNumbering = {
      abstracts: {
        1: {
          abstractNumId: 1,
          levels: {
            0: {
              ilvl: 0,
              lvlText: '%1.',
            },
          },
        },
      },
      definitions: {
        10: {
          numId: 10,
          abstractNumId: 1,
        },
      },
    };
    const newNumbering = {
      abstracts: {
        1: {
          abstractNumId: 1,
          levels: {
            0: {
              ilvl: 0,
              lvlText: '%1)',
            },
          },
        },
      },
      definitions: {
        11: {
          numId: 11,
          abstractNumId: 1,
        },
      },
    };

    const diff = computeDiff(doc, doc, schema, [], [], null, null, oldNumbering, newNumbering);

    expect(diff.docDiffs).toHaveLength(0);
    expect(diff.commentDiffs).toHaveLength(0);
    expect(diff.stylesDiff).toBeNull();
    expect(diff.numberingDiff).not.toBeNull();
    expect(diff.numberingDiff?.added).toHaveProperty('definitions.11.numId', 11);
    expect(diff.numberingDiff?.deleted).toHaveProperty('definitions.10.numId', 10);
    expect(diff.numberingDiff?.modified['abstracts.1.levels.0.lvlText']).toEqual({
      from: '%1.',
      to: '%1)',
    });
  });
});
