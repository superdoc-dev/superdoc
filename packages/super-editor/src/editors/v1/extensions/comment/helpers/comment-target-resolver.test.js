import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import {
  resolveCommentIdentity,
  collectCommentMarkSegments,
  collectCommentAnchorNodes,
  collectCommentRangeAnchors,
} from './comment-target-resolver.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    commentRangeStart: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { 'w:id': { default: '' } },
    },
    commentRangeEnd: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { 'w:id': { default: '' } },
    },
    text: { group: 'inline' },
  },
  marks: {
    commentMark: {
      attrs: {
        commentId: { default: '' },
        importedId: { default: '' },
      },
    },
  },
});

function docWithCommentMark(commentId, importedId, text = 'hello') {
  const mark = schema.marks.commentMark.create({ commentId, importedId });
  const textNode = schema.text(text, [mark]);
  return schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [textNode])]);
}

function docWithAnchors(id) {
  const start = schema.nodes.commentRangeStart.create({ 'w:id': id });
  const end = schema.nodes.commentRangeEnd.create({ 'w:id': id });
  return schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [start, schema.text('body'), end])]);
}

function emptyDoc() {
  return schema.nodes.doc.create(null, [schema.nodes.paragraph.create()]);
}

// --- resolveCommentIdentity ---

describe('resolveCommentIdentity', () => {
  it('returns unresolved with missing-identifiers when both ids are empty', () => {
    const result = resolveCommentIdentity(emptyDoc(), { commentId: '', importedId: '' });
    expect(result).toEqual({ status: 'unresolved', reason: 'missing-identifiers' });
  });

  it('returns unresolved with missing-identifiers when both ids are undefined', () => {
    const result = resolveCommentIdentity(emptyDoc(), {});
    expect(result).toEqual({ status: 'unresolved', reason: 'missing-identifiers' });
  });

  it('resolves via canonical strategy when commentId matches marks', () => {
    const doc = docWithCommentMark('c1', 'i1');
    const result = resolveCommentIdentity(doc, { commentId: 'c1', importedId: 'i1' });
    expect(result).toEqual({
      status: 'resolved',
      strategy: 'canonical',
      matchId: 'c1',
      canonicalId: 'c1',
      fallbackImportedId: 'i1',
    });
  });

  it('resolves via canonical strategy when commentId matches anchors', () => {
    const doc = docWithAnchors('c1');
    const result = resolveCommentIdentity(doc, { commentId: 'c1' });
    expect(result).toEqual({
      status: 'resolved',
      strategy: 'canonical',
      matchId: 'c1',
      canonicalId: 'c1',
      fallbackImportedId: null,
    });
  });

  it('falls back to imported-fallback when canonical has no targets', () => {
    const doc = docWithCommentMark('', 'i1');
    const result = resolveCommentIdentity(doc, { commentId: 'c-missing', importedId: 'i1' });
    expect(result).toEqual({
      status: 'resolved',
      strategy: 'imported-fallback',
      matchId: 'i1',
      canonicalId: 'c-missing',
      fallbackImportedId: 'i1',
    });
  });

  it('returns unresolved no-targets when canonical has no targets and no importedId', () => {
    const doc = emptyDoc();
    const result = resolveCommentIdentity(doc, { commentId: 'c1' });
    expect(result).toEqual({ status: 'unresolved', reason: 'no-targets' });
  });

  it('returns unresolved no-targets when neither canonical nor imported have targets', () => {
    const doc = emptyDoc();
    const result = resolveCommentIdentity(doc, { commentId: 'c1', importedId: 'i1' });
    expect(result).toEqual({ status: 'unresolved', reason: 'no-targets' });
  });

  it('does not use importedId as fallback when it equals commentId', () => {
    const doc = emptyDoc();
    const result = resolveCommentIdentity(doc, { commentId: 'same', importedId: 'same' });
    expect(result).toEqual({ status: 'unresolved', reason: 'no-targets' });
  });

  it('returns ambiguous multiple-comment-ids when fallback marks have different commentIds', () => {
    const mark1 = schema.marks.commentMark.create({ commentId: 'a', importedId: 'shared' });
    const mark2 = schema.marks.commentMark.create({ commentId: 'b', importedId: 'shared' });
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('one', [mark1]), schema.text('two', [mark2])]),
    ]);
    const result = resolveCommentIdentity(doc, { commentId: 'missing', importedId: 'shared' });
    expect(result).toEqual({ status: 'ambiguous', reason: 'multiple-comment-ids', matchId: 'shared' });
  });

  it('returns ambiguous canonical-mismatch when fallback mark has a different canonical id', () => {
    const doc = docWithCommentMark('other-canonical', 'i1');
    const result = resolveCommentIdentity(doc, { commentId: 'c1', importedId: 'i1' });
    expect(result).toEqual({ status: 'ambiguous', reason: 'canonical-mismatch', matchId: 'i1' });
  });
});

// --- collectCommentMarkSegments ---

describe('collectCommentMarkSegments', () => {
  it('returns empty array for non-resolved identity', () => {
    const doc = docWithCommentMark('c1', 'i1');
    expect(collectCommentMarkSegments(doc, null)).toEqual([]);
    expect(collectCommentMarkSegments(doc, { status: 'unresolved', reason: 'no-targets' })).toEqual([]);
  });

  it('collects mark segments for canonical strategy', () => {
    const doc = docWithCommentMark('c1', 'i1');
    const identity = resolveCommentIdentity(doc, { commentId: 'c1', importedId: 'i1' });
    const segments = collectCommentMarkSegments(doc, identity);
    expect(segments.length).toBe(1);
    expect(segments[0].attrs.commentId).toBe('c1');
  });

  it('collects mark segments for imported-fallback strategy', () => {
    const doc = docWithCommentMark('', 'i1');
    const identity = resolveCommentIdentity(doc, { commentId: 'missing', importedId: 'i1' });
    expect(identity.status).toBe('resolved');
    const segments = collectCommentMarkSegments(doc, identity);
    expect(segments.length).toBe(1);
    expect(segments[0].attrs.importedId).toBe('i1');
  });
});

// --- collectCommentAnchorNodes ---

describe('collectCommentAnchorNodes', () => {
  it('returns empty array for non-resolved identity', () => {
    const doc = docWithAnchors('c1');
    expect(collectCommentAnchorNodes(doc, null)).toEqual([]);
  });

  it('collects anchor nodes for a resolved identity', () => {
    const doc = docWithAnchors('c1');
    const identity = resolveCommentIdentity(doc, { commentId: 'c1' });
    const anchors = collectCommentAnchorNodes(doc, identity);
    expect(anchors.length).toBe(2);
    const typeNames = anchors.map((a) => a.typeName).sort();
    expect(typeNames).toEqual(['commentRangeEnd', 'commentRangeStart']);
  });
});

// --- collectCommentRangeAnchors ---

describe('collectCommentRangeAnchors', () => {
  it('returns null for non-resolved identity', () => {
    const doc = docWithAnchors('c1');
    expect(collectCommentRangeAnchors(doc, null)).toBeNull();
  });

  it('returns start and end positions for a resolved identity', () => {
    const doc = docWithAnchors('c1');
    const identity = resolveCommentIdentity(doc, { commentId: 'c1' });
    const range = collectCommentRangeAnchors(doc, identity);
    expect(range).not.toBeNull();
    expect(range.startPos).toBeLessThan(range.endPos);
    expect(range.startAttrs['w:id']).toBe('c1');
  });

  it('returns null when only start anchor exists', () => {
    const start = schema.nodes.commentRangeStart.create({ 'w:id': 'c1' });
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [start])]);
    const identity = {
      status: 'resolved',
      strategy: 'canonical',
      matchId: 'c1',
      canonicalId: 'c1',
      fallbackImportedId: null,
    };
    expect(collectCommentRangeAnchors(doc, identity)).toBeNull();
  });

  it('returns null when only end anchor exists', () => {
    const end = schema.nodes.commentRangeEnd.create({ 'w:id': 'c1' });
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [end])]);
    const identity = {
      status: 'resolved',
      strategy: 'canonical',
      matchId: 'c1',
      canonicalId: 'c1',
      fallbackImportedId: null,
    };
    expect(collectCommentRangeAnchors(doc, identity)).toBeNull();
  });
});
