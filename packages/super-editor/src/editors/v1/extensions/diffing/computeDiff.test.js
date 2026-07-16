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

/**
 * Collects text fragments from inline changes for readable assertions.
 *
 * @param {Array<Record<string, unknown>>} contentDiff Inline diff entries.
 * @returns {{ added: string[]; deleted: string[]; modified: Array<{ oldText: string; newText: string }> }}
 */
const collectInlineTextChanges = (contentDiff) => {
  const added = [];
  const deleted = [];
  const modified = [];

  for (const change of contentDiff ?? []) {
    if (change.kind !== 'text') {
      continue;
    }

    if (change.action === 'added' && typeof change.text === 'string') {
      added.push(change.text);
      continue;
    }

    if (change.action === 'deleted' && typeof change.text === 'string') {
      deleted.push(change.text);
      continue;
    }

    if (change.action === 'modified' && typeof change.oldText === 'string' && typeof change.newText === 'string') {
      modified.push({ oldText: change.oldText, newText: change.newText });
    }
  }

  return { added, deleted, modified };
};

/**
 * Collects plain-text paragraph contents from a ProseMirror document.
 *
 * @param {import('prosemirror-model').Node} doc
 * @returns {string[]}
 */
const collectParagraphTexts = (doc) => {
  const paragraphs = [];

  doc.descendants((node) => {
    if (node.type.name === 'paragraph') {
      paragraphs.push(node.textContent);
      return false;
    }
    return undefined;
  });

  return paragraphs;
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

    // One volatile-only paragraph diff (paraId/rsidR/textId changes) is now
    // correctly filtered out by semantic normalization. See semantic-normalization.ts.
    expect(diffs).toHaveLength(18);
    expect(modifiedDiffs).toHaveLength(8);
    expect(addedDiffs).toHaveLength(5);
    expect(deletedDiffs).toHaveLength(5);
    expect(attrOnlyDiffs).toHaveLength(3);

    // Modified paragraph with multiple text diffs
    let diff = getDiff(
      'modified',
      (diff) => diff.oldText === 'Curabitur facilisis ligula suscipit enim pretium, sed porttitor augue consequat.',
    );
    expect(diff?.newText).toBe(
      'Curabitur facilisis ligula suscipit enim pretium et nunc ligula, porttitor augue consequat maximus.',
    );
    const textPropsChanges = diff?.contentDiff.filter((textDiff) => textDiff.action === 'modified');
    const { added, deleted, modified } = collectInlineTextChanges(diff?.contentDiff);
    expect(textPropsChanges).toHaveLength(1);
    expect(diff?.contentDiff).toHaveLength(4);
    expect(deleted).toEqual(expect.arrayContaining([',']));
    expect(added).toEqual(expect.arrayContaining(['nunc ligula, ', ' maximus']));
    expect(modified).toEqual(expect.arrayContaining([{ oldText: 'sed', newText: 'et' }]));

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
    expect(diff.contentDiff).toHaveLength(1);
    expect(diff.contentDiff[0]).toMatchObject({
      action: 'added',
      kind: 'text',
      text: 'NEW ',
    });

    diff = diffs.find((diff) => diff.action === 'deleted' && diff.oldText === 'I deleted this sentence.');
    expect(diff).toBeDefined();

    diff = diffs.find((diff) => diff.action === 'added' && diff.text === 'I added this sentence.');
    expect(diff).toBeDefined();

    diff = diffs.find((diff) => diff.action === 'modified' && diff.oldText === 'We are not done yet.');
    expect(diff.newText).toBe('We are done now.');
    expect(diff.contentDiff.length).toBeGreaterThan(0);
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
    expect(diff.contentDiff).toHaveLength(2);
    expect(diff.contentDiff[0].action).toBe('added');
    expect(diff.contentDiff[0].kind).toBe('inlineNode');
    expect(diff.contentDiff[1]).toMatchObject({
      action: 'added',
      kind: 'text',
      text: ' ',
    });
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
    const formattingRunAttrsDiff = formattingDiff?.contentDiff?.[0]?.runAttrsDiff;
    expect(formattingRunAttrsDiff).toBeDefined();
    expect(formattingRunAttrsDiff.added).toEqual({
      'runProperties.bold': true,
      'runProperties.boldCs': true,
    });
    expect(formattingRunAttrsDiff.deleted).toEqual({});
    // SD-2517: importer now preserves [] for runs with no inline w:rPr.
    // When user adds bold (diff_after7), hasNewInlineProps triggers mark key addition.
    expect(formattingRunAttrsDiff.modified?.runPropertiesInlineKeys).toEqual({
      from: [],
      to: ['bold', 'boldCs', 'fontFamily', 'fontSize', 'fontSizeCs'],
    });
    expect(formattingRunAttrsDiff.modified?.rsidRPr).toMatchObject({
      from: null,
      to: expect.any(String),
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

  it('keeps SD-2787 replacements at whole-word granularity', async () => {
    const { doc: docBefore, schema } = await getDocument('word/sd_2787_source.docx');
    const { doc: docAfter } = await getDocument('word/sd_2787_target.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const paragraphDiff = docDiffs.find(
      (diff) =>
        diff.action === 'modified' &&
        diff.oldText?.includes('sentence that is a test') &&
        diff.oldText?.includes('friendly neighborhood Github') &&
        diff.newText?.includes('phrase that is an examination') &&
        diff.newText?.includes('friendly barrio Github'),
    );

    expect(paragraphDiff).toBeDefined();

    const { added, deleted, modified } = collectInlineTextChanges(paragraphDiff?.contentDiff);
    const replacedOldTexts = modified.map((change) => change.oldText);
    const replacedNewTexts = modified.map((change) => change.newText);
    const allDeleted = [...deleted, ...replacedOldTexts];
    const allAdded = [...added, ...replacedNewTexts];

    expect(allDeleted).toEqual(expect.arrayContaining(['sentence', 'a test', 'some ', 'neighborhood']));
    expect(allAdded).toEqual(expect.arrayContaining(['phrase', 'an examination', 'barrio']));

    expect(allDeleted).not.toEqual(expect.arrayContaining(['phra', 'xamina', 'a', 'ri']));
    expect(allAdded).not.toEqual(expect.arrayContaining(['ntence', 's', 'neigh', 'o', 'h', 'od']));
    expect(allAdded).not.toEqual(expect.arrayContaining(['some']));
  });

  it('keeps IT-1029 repeated edit insertions as four whole-word additions', async () => {
    const { doc: docBefore, schema } = await getDocument('word/it_1029_source.docx');
    const { doc: docAfter } = await getDocument('word/it_1029_target.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const paragraphDiff = docDiffs.find(
      (diff) =>
        diff.action === 'modified' &&
        diff.oldText?.startsWith('Lorem Ipsum') &&
        diff.newText?.startsWith('Edit Lorem Ipsum') &&
        diff.newText?.includes('dummy edit text') &&
        diff.newText?.includes('typesetting, edit remaining') &&
        diff.newText?.endsWith('Lorem Ipsum. edit'),
    );

    expect(paragraphDiff).toBeDefined();

    const { added } = collectInlineTextChanges(paragraphDiff?.contentDiff);
    const normalizedAdded = added.map((text) => text.trim().toLowerCase());

    expect(added).toHaveLength(4);
    expect(normalizedAdded).toEqual(['edit', 'edit', 'edit', 'edit']);

    expect(added).not.toEqual(expect.arrayContaining(['edi', ' t', 'edit ', ' edit']));
  });

  it('does not delete IT-1029 paragraphs whose text still exists verbatim in the new document', async () => {
    const { doc: docBefore, schema } = await getDocument('word/it_1029_source.docx');
    const { doc: docAfter } = await getDocument('word/it_1029_target.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const newParagraphTexts = new Set(collectParagraphTexts(docAfter));
    const falseDeletions = docDiffs.filter(
      (diff) =>
        diff.action === 'deleted' &&
        typeof diff.oldText === 'string' &&
        diff.oldText.length > 0 &&
        newParagraphTexts.has(diff.oldText),
    );

    expect(falseDeletions).toEqual([]);
  });

  it('keeps LEASE to RENTAL replacement at whole-word granularity', async () => {
    const { doc: docBefore, schema } = await getDocument('word/doc_a.docx');
    const { doc: docAfter } = await getDocument('word/doc_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const paragraphDiff = docDiffs.find(
      (diff) =>
        diff.action === 'modified' &&
        diff.oldText?.startsWith('LEASE AGREEMENT') &&
        diff.newText?.startsWith('RENTAL AGREEMENT'),
    );

    expect(paragraphDiff).toBeDefined();

    const { added, deleted, modified } = collectInlineTextChanges(paragraphDiff?.contentDiff);
    const replacedOldTexts = modified.map((change) => change.oldText);
    const replacedNewTexts = modified.map((change) => change.newText);
    const allDeleted = [...deleted, ...replacedOldTexts];
    const allAdded = [...added, ...replacedNewTexts];

    expect(allDeleted).toEqual(expect.arrayContaining(['LEASE']));
    expect(allAdded).toEqual(expect.arrayContaining(['RENTAL']));

    expect(allDeleted).not.toEqual(expect.arrayContaining(['R', 'NT', 'L']));
    expect(allAdded).not.toEqual(expect.arrayContaining(['L', 'SE']));
  });

  it('keeps electronic/electric and warranties/what replacements at whole-word granularity', async () => {
    const { doc: docBefore, schema } = await getDocument('word/doc_a1.docx');
    const { doc: docAfter } = await getDocument('word/doc_b1.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const electronicRelatedDiffs = docDiffs.filter(
      (diff) => diff.oldText?.toLowerCase().includes('electronic') || diff.newText?.toLowerCase().includes('electric'),
    );
    const warrantiesRelatedDiffs = docDiffs.filter(
      (diff) =>
        diff.oldText?.toLowerCase().includes('warranties') ||
        diff.newText?.toLowerCase().includes('what') ||
        diff.oldText?.toLowerCase().includes('what') ||
        diff.newText?.toLowerCase().includes('warranties'),
    );

    expect(electronicRelatedDiffs.length).toBeGreaterThan(0);
    expect(warrantiesRelatedDiffs.length).toBeGreaterThan(0);

    const electronicChanges = electronicRelatedDiffs.map((diff) => collectInlineTextChanges(diff.contentDiff));
    const electronicDeleted = [
      ...electronicChanges.flatMap((changes) => changes.deleted),
      ...electronicChanges.flatMap((changes) => changes.modified.map((change) => change.oldText)),
    ];
    const electronicAdded = [
      ...electronicChanges.flatMap((changes) => changes.added),
      ...electronicChanges.flatMap((changes) => changes.modified.map((change) => change.newText)),
    ];

    expect(electronicDeleted).toEqual(expect.arrayContaining(['Electronic']));
    expect(electronicAdded).toEqual(expect.arrayContaining(['Electric']));
    expect(electronicDeleted).not.toEqual(expect.arrayContaining(['on']));
    expect(electronicAdded).not.toEqual(expect.arrayContaining(['lectr']));

    const warrantiesChanges = warrantiesRelatedDiffs.map((diff) => collectInlineTextChanges(diff.contentDiff));
    const warrantiesDeleted = [
      ...warrantiesChanges.flatMap((changes) => changes.deleted),
      ...warrantiesChanges.flatMap((changes) => changes.modified.map((change) => change.oldText)),
    ];
    const warrantiesAdded = [
      ...warrantiesChanges.flatMap((changes) => changes.added),
      ...warrantiesChanges.flatMap((changes) => changes.modified.map((change) => change.newText)),
    ];

    expect(warrantiesDeleted).toEqual(expect.arrayContaining(['Warranties']));
    expect(warrantiesAdded).toEqual(expect.arrayContaining(['What']));
    expect(warrantiesDeleted).not.toEqual(expect.arrayContaining(['What', ' test']));
    expect(warrantiesAdded).not.toEqual(expect.arrayContaining(['W', 'arranties']));
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

  it('SD-3339: does not produce false paragraph modifications when only run-level rsid attrs differ (IT-1132 PAGEREF fixture)', async () => {
    // IT-1132: base and edited documents have identical visible content; the only differences
    // are OOXML rsid attrs reassigned by Word on save. These must not produce any diffs.
    const { doc: docBase, schema } = await getDocument('word/it_1132_base.docx');
    const { doc: docEdited } = await getDocument('word/it_1132_edited.docx');

    const { docDiffs } = computeDiff(docBase, docEdited, schema);

    expect(docDiffs).toHaveLength(0);
  });
});

/**
 * Collects all changed text fragments from a single paragraph diff.
 * Merges deleted, added, and modified entries into flat arrays for easy assertions.
 */
function collectAllChanges(paragraphDiff) {
  const { added, deleted, modified } = collectInlineTextChanges(paragraphDiff?.contentDiff);
  return {
    allDeleted: [...deleted, ...modified.map((c) => c.oldText)],
    allAdded: [...added, ...modified.map((c) => c.newText)],
  };
}

describe('computeDiff — word-level granularity fixtures', () => {
  it('lease_basic: LEASE → RENTAL at whole-word granularity', async () => {
    const { doc: docBefore, schema } = await getDocument('word/lease_basic_a.docx');
    const { doc: docAfter } = await getDocument('word/lease_basic_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const paragraphDiff = docDiffs.find((d) => d.action === 'modified');
    expect(paragraphDiff).toBeDefined();

    const { allDeleted, allAdded } = collectAllChanges(paragraphDiff);
    expect(allDeleted).toContain('LEASE');
    expect(allAdded).toContain('RENTAL');
    expect(allDeleted).not.toContain('L');
    expect(allDeleted).not.toContain('S');
    expect(allDeleted).not.toContain('SE');
    expect(allAdded).not.toContain('R');
    expect(allAdded).not.toContain('NT');
    expect(allAdded).not.toContain('AL');
  });

  it('electronic_basic: electronic → electric at whole-word granularity', async () => {
    const { doc: docBefore, schema } = await getDocument('word/electronic_basic_a.docx');
    const { doc: docAfter } = await getDocument('word/electronic_basic_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const paragraphDiff = docDiffs.find((d) => d.action === 'modified');
    expect(paragraphDiff).toBeDefined();

    const { allDeleted, allAdded } = collectAllChanges(paragraphDiff);
    expect(allDeleted).toContain('electronic');
    expect(allAdded).toContain('electric');
    expect(allDeleted).not.toContain('onic');
    expect(allDeleted).not.toContain('on');
    expect(allAdded).not.toContain('lectr');
    expect(allAdded).not.toContain('ic');
  });

  it('warranties_basic: warranties → what at whole-word granularity (target has split runs with rsidR)', async () => {
    const { doc: docBefore, schema } = await getDocument('word/warranties_basic_a.docx');
    const { doc: docAfter } = await getDocument('word/warranties_basic_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const paragraphDiff = docDiffs.find((d) => d.action === 'modified');
    expect(paragraphDiff).toBeDefined();

    // Target has "w" + "hat" in separate runs (rsidR on second run).
    // Volatile rsidR must be ignored so the runs merge into whole-word "what".
    const { allDeleted, allAdded } = collectAllChanges(paragraphDiff);
    expect(allDeleted).toContain('warranties');
    expect(allAdded).toContain('what');
    expect(allDeleted).not.toContain('warrantie');
    expect(allDeleted).not.toContain('arranties');
    expect(allAdded).not.toContain('w');
    expect(allAdded).not.toContain('hat');
  });

  it('lease_split_runs: LEASE → RENTAL with split-run fixture', async () => {
    const { doc: docBefore, schema } = await getDocument('word/lease_split_runs_a.docx');
    const { doc: docAfter } = await getDocument('word/lease_split_runs_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const paragraphDiff = docDiffs.find((d) => d.action === 'modified');
    expect(paragraphDiff).toBeDefined();

    const { allDeleted, allAdded } = collectAllChanges(paragraphDiff);
    expect(allDeleted).toContain('LEASE');
    expect(allAdded).toContain('RENTAL');
    expect(allDeleted).not.toContain('L');
    expect(allDeleted).not.toContain('S');
    expect(allDeleted).not.toContain('SE');
    expect(allAdded).not.toContain('R');
    expect(allAdded).not.toContain('NT');
    expect(allAdded).not.toContain('AL');
  });

  it('electronic_split_runs: electronic → electric with multi-run target (electr + ic)', async () => {
    const { doc: docBefore, schema } = await getDocument('word/electronic_split_runs_a.docx');
    const { doc: docAfter } = await getDocument('word/electronic_split_runs_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const paragraphDiff = docDiffs.find((d) => d.action === 'modified');
    expect(paragraphDiff).toBeDefined();

    // Target has "electr" + "ic" in separate runs (rsidR on second run).
    // Both runs must merge into whole-word "electric" for word-level granularity.
    const { allDeleted, allAdded } = collectAllChanges(paragraphDiff);
    expect(allDeleted).toContain('electronic');
    expect(allAdded).toContain('electric');
    expect(allDeleted).not.toContain('onic');
    expect(allAdded).not.toContain('electr');
    expect(allAdded).not.toContain('ic');
  });

  it('lease_sentence: LEASE → RENTAL within a full sentence (target has 3 runs)', async () => {
    const { doc: docBefore, schema } = await getDocument('word/lease_sentence_a.docx');
    const { doc: docAfter } = await getDocument('word/lease_sentence_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const paragraphDiff = docDiffs.find(
      (d) => d.action === 'modified' && d.oldText?.includes('LEASE') && d.newText?.includes('RENTAL'),
    );
    expect(paragraphDiff).toBeDefined();

    const { allDeleted, allAdded } = collectAllChanges(paragraphDiff);
    expect(allDeleted).toContain('LEASE');
    expect(allAdded).toContain('RENTAL');
    expect(allDeleted).not.toContain('L');
    expect(allDeleted).not.toContain('S');
    expect(allAdded).not.toContain('R');
    expect(allAdded).not.toContain('NT');
  });

  it('lease_prefix: LEASE → LEASING (word expansion, target has split runs)', async () => {
    const { doc: docBefore, schema } = await getDocument('word/lease_prefix_a.docx');
    const { doc: docAfter } = await getDocument('word/lease_prefix_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const paragraphDiff = docDiffs.find((d) => d.action === 'modified');
    expect(paragraphDiff).toBeDefined();

    const { allDeleted, allAdded } = collectAllChanges(paragraphDiff);
    // "LEAS" + "ING" runs in target must merge into whole-word "LEASING".
    // The result must be a whole-word replacement or modification, not a partial insertion of "ING".
    expect(allAdded).toContain('LEASING');
    expect(allAdded).not.toContain('LEAS');
    expect(allAdded).not.toContain('ING');
    expect(allAdded).not.toContain('I');
  });

  it('warranties_prefix: warranties → warranty (word truncation, target has split runs)', async () => {
    const { doc: docBefore, schema } = await getDocument('word/warranties_prefix_a.docx');
    const { doc: docAfter } = await getDocument('word/warranties_prefix_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);
    const paragraphDiff = docDiffs.find((d) => d.action === 'modified');
    expect(paragraphDiff).toBeDefined();

    // "warra" + "nty" runs in target must merge into whole-word "warranty".
    // Without word-level: char-level Myers produces "ies" deleted + "y" added.
    const { allDeleted, allAdded } = collectAllChanges(paragraphDiff);
    expect(allDeleted).toContain('warranties');
    expect(allAdded).toContain('warranty');
    expect(allDeleted).not.toContain('ies');
    expect(allAdded).not.toContain('warra');
    expect(allAdded).not.toContain('nty');
    expect(allAdded).not.toContain('y');
  });

  it('lorem_ipsum_a1/b1: multi-paragraph document with LEASE→RENTAL, Electronic→Electric, Warranties→What at word granularity', async () => {
    const { doc: docBefore, schema } = await getDocument('word/lorem_ipsum_a1.docx');
    const { doc: docAfter } = await getDocument('word/lorem_ipsum_b1.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);

    // Five paragraphs change: LEASE→RENTAL, Electronic→Electric, Warranties→What,
    // word appended ("Edited"), words deleted ("popularised" + "Lorem Ipsum").
    expect(docDiffs).toHaveLength(5);
    expect(docDiffs.every((d) => d.action === 'modified')).toBe(true);

    // --- LEASE → RENTAL ---
    const leaseDiff = docDiffs.find((d) => d.oldText?.startsWith('LEASE'));
    expect(leaseDiff).toBeDefined();
    const { allDeleted: leaseDeleted, allAdded: leaseAdded } = collectAllChanges(leaseDiff);
    expect(leaseDeleted).toContain('LEASE');
    expect(leaseAdded).toContain('RENTAL');
    expect(leaseDeleted).not.toContain('L');
    expect(leaseDeleted).not.toContain('SE');
    expect(leaseAdded).not.toContain('R');
    expect(leaseAdded).not.toContain('NT');

    // --- Electronic → Electric ---
    const electronicDiff = docDiffs.find((d) => d.oldText?.includes('Electronic'));
    expect(electronicDiff).toBeDefined();
    const { allDeleted: elDeleted, allAdded: elAdded } = collectAllChanges(electronicDiff);
    expect(elDeleted).toContain('Electronic');
    expect(elAdded).toContain('Electric');
    expect(elDeleted).not.toContain('on');
    expect(elAdded).not.toContain('lectr');

    // --- Warranties → What ---
    const warrantiesDiff = docDiffs.find((d) => d.oldText?.includes('Warranties'));
    expect(warrantiesDiff).toBeDefined();
    const { allDeleted: wDeleted, allAdded: wAdded } = collectAllChanges(warrantiesDiff);
    expect(wDeleted).toContain('Warranties');
    expect(wAdded).toContain('What');
    expect(wDeleted).not.toContain('arranties');
    expect(wAdded).not.toContain('W');
  });

  it('doc_a2/doc_b2: complex real-world paragraph produces a single modified diff without char-level fragments', async () => {
    const { doc: docBefore, schema } = await getDocument('word/doc_a2.docx');
    const { doc: docAfter } = await getDocument('word/doc_b2.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);

    // The two documents each contain one paragraph — expect exactly one modified diff,
    // not a deleted+added pair (which would mean the similarity threshold was not met).
    expect(docDiffs).toHaveLength(1);
    const paragraphDiff = docDiffs[0];
    expect(paragraphDiff.action).toBe('modified');
    expect(paragraphDiff.oldText).toContain('If Vendor were to recognize');
    expect(paragraphDiff.newText).toContain('Vendor recognizes that applying');

    const { allDeleted, allAdded } = collectAllChanges(paragraphDiff);

    // The algorithm may group changes into spans of varying size (e.g. "were to recognize" →
    // "recognizes" instead of individual words). What matters is: no char-level fragments from
    // word replacement zones appear in the output.
    const combinedDeleted = allDeleted.join(' ');
    const combinedAdded = allAdded.join(' ');

    // Key old content must be covered somewhere in the deleted/modified set.
    expect(combinedDeleted).toMatch(/were|recognize/);
    expect(combinedDeleted).toMatch(/subject|applying/);
    expect(combinedDeleted).toMatch(/administrative|operations/);
    expect(combinedDeleted).toMatch(/burden|obligation/);

    // Key new content must be covered somewhere in the added/modified set.
    expect(combinedAdded).toMatch(/recognizes|recognize/);
    expect(combinedAdded).toMatch(/applying|subject/);
    expect(combinedAdded).toMatch(/operations|administrative/);
    expect(combinedAdded).toMatch(/obligation|burden/);

    // Negative: no char fragments that would indicate word-level re-tokenization failed.
    expect(allAdded).not.toContain('gnizes');
    expect(allAdded).not.toContain('ecognizes');
    expect(allAdded).not.toContain('pplying');
    expect(allAdded).not.toContain('perations');
    expect(allAdded).not.toContain('bligation');
  });
});

describe('computeDiff — structuredContent (SDT) diffing', () => {
  it('sdt: produces no text-kind inline diffs at positions inside SDT nodes (no double-tokenization)', async () => {
    const { doc: docBefore, schema } = await getDocument('word/sdt_a.docx');
    const { doc: docAfter } = await getDocument('word/sdt_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);

    // Collect SDT position ranges from the base document so we can check
    // whether any text-kind diff lands inside one.
    const sdtRanges = [];
    docBefore.descendants((node, pos) => {
      if (node.type.name === 'structuredContent') {
        sdtRanges.push({ from: pos, to: pos + node.nodeSize });
      }
    });

    const insideSDT = (pos) => sdtRanges.some((r) => pos > r.from && pos < r.to);

    const textDiffsInsideSDT = docDiffs
      .filter((d) => d.action === 'modified' && d.contentDiff)
      .flatMap((d) => d.contentDiff)
      .filter((d) => d.kind === 'text' && insideSDT(d.startPos));

    // Before the fix, tokenizeInlineContent emitted both an inlineNode token for the SDT
    // and text tokens for its descendants — two conflicting diff paths for the same region.
    // This produced text-kind diffs whose startPos falls inside the SDT boundary.
    expect(textDiffsInsideSDT).toHaveLength(0);
  });

  it('sdt: changed inline SDT produces exactly one inlineNode diff with no overlapping text diffs at the same position', async () => {
    const { doc: docBefore, schema } = await getDocument('word/sdt_a.docx');
    const { doc: docAfter } = await getDocument('word/sdt_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);

    const allInlineDiffs = docDiffs
      .filter((d) => d.action === 'modified' && d.contentDiff)
      .flatMap((d) => d.contentDiff);

    const sdtInlineDiffs = allInlineDiffs.filter((d) => d.kind === 'inlineNode' && d.nodeType === 'structuredContent');

    // "my field 2" SDT: content changed from "fawehifew fwe" to "fawehifew few edit".
    // Must produce exactly one inlineNode diff representing the whole SDT replacement.
    expect(sdtInlineDiffs).toHaveLength(1);
    expect(sdtInlineDiffs[0].action).toMatch(/added|deleted|modified/);

    // Double-tokenization would produce both an inlineNode diff and a text diff at the
    // same startPos. Confirm there is no text diff overlapping the SDT diff position.
    const sdtPositions = new Set(sdtInlineDiffs.map((d) => d.startPos));
    const overlappingTextDiffs = allInlineDiffs.filter((d) => d.kind === 'text' && sdtPositions.has(d.startPos));
    expect(overlappingTextDiffs).toHaveLength(0);
  });

  it('sdt: SDT text content appears in oldText/newText paragraph summaries', async () => {
    const { doc: docBefore, schema } = await getDocument('word/sdt_a.docx');
    const { doc: docAfter } = await getDocument('word/sdt_b.docx');

    const { docDiffs } = computeDiff(docBefore, docAfter, schema);

    // The paragraph "Linked Master [my field 2 SDT]":
    //   A: fullText = "Linked Master fawehifew fwe"
    //   B: fullText = "Linked Master fawehifew few edit"
    // Without fullText recovery for SDTs, the SDT text would be missing and the
    // paragraph would appear as "Linked Master " with empty SDT contribution.
    const sdtParagraphDiff = docDiffs.find((d) => d.action === 'modified' && d.oldText?.includes('fawehifew'));
    expect(sdtParagraphDiff).toBeDefined();
    expect(sdtParagraphDiff.oldText).toContain('fawehifew fwe');
    expect(sdtParagraphDiff.newText).toContain('fawehifew few edit');
  });

  it('sdt: SDT with same visible content but regenerated id/sdtPr attrs produces no diff', async () => {
    // Word regenerates `w:id` (and the raw `sdtPr` snapshot that also contains it)
    // on every save. Two copies of the same document that differ only in these
    // volatile attrs must not produce a diff for the unchanged SDT.
    const { doc: docBefore, schema } = await getDocument('word/sdt_a.docx');

    // Find an SDT node and build a clone with a different `id` and stripped `sdtPr`.
    let sdtNode = null;
    docBefore.descendants((node) => {
      if (node.type.name === 'structuredContent' && !sdtNode) {
        sdtNode = node;
      }
    });
    expect(sdtNode).not.toBeNull();

    const { semanticInlineNodeKey } = await import('./algorithm/semantic-normalization.ts');

    const originalKey = semanticInlineNodeKey(sdtNode);

    // Simulate what Word does: regenerate id and sdtPr on save.
    const mutatedJSON = {
      ...sdtNode.toJSON(),
      attrs: {
        ...sdtNode.attrs,
        id: 'regenerated-id-99999',
        sdtPr: { elements: [{ name: 'w:id', attributes: { 'w:val': '99999' } }] },
      },
    };
    const mutatedNode = { toJSON: () => mutatedJSON, type: sdtNode.type };
    const mutatedKey = semanticInlineNodeKey(mutatedNode);

    // After normalization both must produce the same key.
    expect(mutatedKey).toBe(originalKey);
  });
});
