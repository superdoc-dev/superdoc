import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { buildCommentTokens } from './comment-diffing.ts';

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
