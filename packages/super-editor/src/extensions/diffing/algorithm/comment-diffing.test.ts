import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import {
  buildAddedCommentDiff,
  buildCommentTokens,
  buildDeletedCommentDiff,
  buildModifiedCommentDiff,
  canTreatAsModification,
  commentComparator,
  diffComments,
  shouldProcessEqualAsModification,
} from './comment-diffing.ts';

/**
 * Builds a minimal schema suitable for comment text tokenization.
 *
 * @returns {Schema}
 */
const createSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { content: 'inline*', group: 'block' },
      text: { group: 'inline' },
    },
    marks: {},
  });

/**
 * Builds a basic comment body JSON payload.
 *
 * @param {string} text Comment text content.
 * @returns {Record<string, unknown>}
 */
const buildCommentTextJson = (text) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

/**
 * Returns the first token for convenience in tests.
 *
 * @param {Array<import('./comment-diffing.ts').CommentToken>} tokens
 * @returns {import('./comment-diffing.ts').CommentToken}
 */
const getFirstToken = (tokens) => tokens[0];

describe('buildCommentTokens', () => {
  it('builds tokens and text for comments with commentId', () => {
    const schema = createSchema();
    const comment = {
      commentId: 'c-1',
      textJson: buildCommentTextJson('Hello'),
      isInternal: true,
    };

    const tokens = buildCommentTokens([comment], schema);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.commentId).toBe('c-1');
    expect(tokens[0]?.content?.fullText).toBe('Hello');
    expect(tokens[0]?.content?.text).toHaveLength(5);
    expect(tokens[0]?.commentJSON).toBe(comment);
  });

  it('falls back to importedId when commentId is missing', () => {
    const schema = createSchema();
    const comment = {
      importedId: 'import-1',
      textJson: buildCommentTextJson('Import'),
    };

    const tokens = buildCommentTokens([comment], schema);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.commentId).toBe('import-1');
  });

  it('returns empty text when textJson is missing', () => {
    const schema = createSchema();
    const comment = {
      commentId: 'c-2',
      textJson: null,
    };

    const tokens = buildCommentTokens([comment], schema);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.content).toBeNull();
  });

  it('returns a base node info when the root node is not a paragraph', () => {
    const schema = createSchema();
    const comment = {
      commentId: 'c-3',
      textJson: { type: 'text', text: 'Inline' },
    };

    const tokens = buildCommentTokens([comment], schema);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.content).toMatchObject({
      pos: 0,
      depth: 0,
    });
    expect(tokens[0]?.content?.node?.type?.name).toBe('text');
  });

  it('skips comments without a resolvable id', () => {
    const schema = createSchema();
    const comment = {
      textJson: buildCommentTextJson('No id'),
    };

    const tokens = buildCommentTokens([comment], schema);
    expect(tokens).toEqual([]);
  });
});

describe('comment diff helpers', () => {
  it('matches comments by id', () => {
    const schema = createSchema();
    const oldToken = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('A') }], schema),
    );
    const newToken = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('B') }], schema),
    );

    expect(commentComparator(oldToken, newToken)).toBe(true);
  });

  it('treats metadata changes as modifications', () => {
    const schema = createSchema();
    const oldToken = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('Text'), isDone: false }], schema),
    );
    const newToken = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('Text'), isDone: true }], schema),
    );

    expect(shouldProcessEqualAsModification(oldToken, newToken)).toBe(true);
  });

  it('treats content changes as modifications', () => {
    const schema = createSchema();
    const oldToken = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('Old') }], schema),
    );
    const newToken = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('New') }], schema),
    );

    expect(shouldProcessEqualAsModification(oldToken, newToken)).toBe(true);
  });

  it('returns false for identical comments', () => {
    const schema = createSchema();
    const oldToken = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('Same') }], schema),
    );
    const newToken = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('Same') }], schema),
    );

    expect(shouldProcessEqualAsModification(oldToken, newToken)).toBe(false);
  });

  it('does not treat insert/delete pairs as modifications', () => {
    expect(canTreatAsModification()).toBe(false);
  });

  it('builds added comment diffs with text', () => {
    const schema = createSchema();
    const token = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('Added') }], schema),
    );

    expect(buildAddedCommentDiff(token)).toEqual({
      action: 'added',
      nodeType: 'comment',
      commentId: 'c-1',
      commentJSON: token.commentJSON,
      text: 'Added',
    });
  });

  it('builds deleted comment diffs with old text', () => {
    const schema = createSchema();
    const token = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('Deleted') }], schema),
    );

    expect(buildDeletedCommentDiff(token)).toEqual({
      action: 'deleted',
      nodeType: 'comment',
      commentId: 'c-1',
      commentJSON: token.commentJSON,
      oldText: 'Deleted',
    });
  });

  it('builds modified comment diffs when content changes', () => {
    const schema = createSchema();
    const oldToken = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('Old') }], schema),
    );
    const newToken = getFirstToken(
      buildCommentTokens([{ commentId: 'c-1', textJson: buildCommentTextJson('New') }], schema),
    );

    const diff = buildModifiedCommentDiff(oldToken, newToken);
    expect(diff).toMatchObject({
      action: 'modified',
      nodeType: 'comment',
      commentId: 'c-1',
      oldText: 'Old',
      newText: 'New',
    });
    expect(diff?.contentDiff).not.toEqual([]);
    expect(diff?.attrsDiff).toBeNull();
  });
});

describe('diffComments', () => {
  it('returns added comment diffs for new comments', () => {
    const schema = createSchema();
    const diffs = diffComments([], [{ commentId: 'c-1', textJson: buildCommentTextJson('Added') }], schema);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      action: 'added',
      nodeType: 'comment',
      commentId: 'c-1',
    });
  });

  it('returns deleted comment diffs for removed comments', () => {
    const schema = createSchema();
    const diffs = diffComments([{ commentId: 'c-1', textJson: buildCommentTextJson('Removed') }], [], schema);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      action: 'deleted',
      nodeType: 'comment',
      commentId: 'c-1',
    });
  });

  it('returns modified comment diffs for content changes', () => {
    const schema = createSchema();
    const diffs = diffComments(
      [{ commentId: 'c-1', textJson: buildCommentTextJson('Old') }],
      [{ commentId: 'c-1', textJson: buildCommentTextJson('New') }],
      schema,
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      action: 'modified',
      nodeType: 'comment',
      commentId: 'c-1',
    });
    expect(diffs[0].contentDiff).not.toEqual([]);
  });

  it('returns empty diffs for identical comments', () => {
    const schema = createSchema();
    const diffs = diffComments(
      [{ commentId: 'c-1', textJson: buildCommentTextJson('Same') }],
      [{ commentId: 'c-1', textJson: buildCommentTextJson('Same') }],
      schema,
    );

    expect(diffs).toEqual([]);
  });
});
