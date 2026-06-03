import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import {
  prepareCommentsForExport,
  prepareCommentsForImport,
  resolveCommentById,
  resolveCommentsInTr,
} from './comments-helpers.js';

vi.mock('./comment-import-helpers.js', () => {
  return {
    resolveCommentMeta: vi.fn().mockReturnValue({
      importedId: 'import-1',
      resolvedCommentId: 'comment-1',
      internal: false,
      matchingImportedComment: { isDone: true },
    }),
    ensureFallbackComment: vi.fn(),
  };
});

describe('prepareCommentsForImport', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'inline*' },
      commentRangeStart: { group: 'inline', inline: true, attrs: { 'w:id': {}, internal: { default: true } } },
      commentRangeEnd: { group: 'inline', inline: true, attrs: { 'w:id': {} } },
      text: { group: 'inline' },
    },
  });

  it('should not add marks if the comment is done', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.commentRangeStart.create({
        'w:id': 'import-1',
        internal: false,
      }),
      schema.nodes.commentRangeEnd.create({
        'w:id': 'import-1',
        internal: false,
      }),
    ]);

    const addMarkFn = vi.fn();
    const deleteFn = vi.fn();
    const setNodeMarkupFn = vi.fn();
    const tr = {
      addMark: addMarkFn,
      delete: deleteFn,
      setNodeMarkup: setNodeMarkupFn,
    };

    prepareCommentsForImport(doc, tr, schema, {});

    expect(addMarkFn).not.toHaveBeenCalled();
  });
});

/**
 * Spec-derived contract for `resolveCommentById`.
 *
 * Per ECMA-376 §17.13.4.3 / §17.13.4.4 / §17.13.4.5, a comment's
 * `w:id` is a "unique identifier for an annotation" and the start /
 * end / reference triplet for a single annotation appears exactly
 * once. Verified against Word output (`/tmp/comment-fixture.docx`):
 * a comment whose anchor crosses a paragraph break still produces one
 * `commentRangeStart` and one `commentRangeEnd` per id.
 *
 * `resolveCommentById` converts a live `commentMark` into anchor
 * atoms before export. The contract this suite pins: ONE
 * `(commentRangeStart, commentRangeEnd)` pair per id, no matter how
 * many disjoint mark segments PM stores along the way.
 */
describe('resolveCommentById — anchor atom emission', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      commentRangeStart: { group: 'inline', inline: true, attrs: { 'w:id': {}, internal: { default: false } } },
      commentRangeEnd: { group: 'inline', inline: true, attrs: { 'w:id': {}, internal: { default: false } } },
      text: { group: 'inline' },
    },
    marks: {
      commentMark: {
        attrs: { commentId: {}, importedId: { default: null }, internal: { default: false } },
      },
    },
  });

  /** Count atoms by type name. */
  const countAtoms = (doc, typeName) => {
    let n = 0;
    doc.descendants((node) => {
      if (node.type.name === typeName) n += 1;
    });
    return n;
  };

  /** Count atoms by type name AND `w:id` attribute. */
  const countByIdAndType = (doc, typeName, wid) => {
    let n = 0;
    doc.descendants((node) => {
      if (node.type.name === typeName && node.attrs?.['w:id'] === wid) n += 1;
    });
    return n;
  };

  const runResolve = (doc, commentId) => {
    const state = EditorState.create({ doc, schema });
    const tr = state.tr;
    let dispatched = false;
    const ok = resolveCommentById({
      commentId,
      state,
      tr,
      dispatch: () => {
        dispatched = true;
      },
    });
    return { ok, dispatched, doc: tr.doc };
  };

  it('single-paragraph comment: emits one commentRangeStart/End pair', () => {
    const mark = schema.marks.commentMark.create({ commentId: 'c1', internal: false });
    const para = schema.nodes.paragraph.create(null, schema.text('Hello world', [mark]));
    const doc = schema.nodes.doc.create(null, [para]);

    const result = runResolve(doc, 'c1');

    expect(result.ok).toBe(true);
    expect(countByIdAndType(result.doc, 'commentRangeStart', 'c1')).toBe(1);
    expect(countByIdAndType(result.doc, 'commentRangeEnd', 'c1')).toBe(1);
  });

  it('multi-paragraph comment (the SuperDoc(8) regression): one pair, not two', () => {
    // The exact shape Word produces for a comment that spans two
    // paragraphs: one `commentRangeStart` at the first commented
    // position and one `commentRangeEnd` after the last commented
    // position, with the paragraph break sitting inside the range.
    const mark = schema.marks.commentMark.create({ commentId: 'c-multi', internal: false });
    const para1 = schema.nodes.paragraph.create(null, schema.text('First half', [mark]));
    const para2 = schema.nodes.paragraph.create(null, schema.text('Second half', [mark]));
    const doc = schema.nodes.doc.create(null, [para1, para2]);

    const result = runResolve(doc, 'c-multi');

    expect(result.ok).toBe(true);
    expect(countByIdAndType(result.doc, 'commentRangeStart', 'c-multi')).toBe(1);
    expect(countByIdAndType(result.doc, 'commentRangeEnd', 'c-multi')).toBe(1);
  });

  it('three-paragraph comment: still one pair', () => {
    const mark = schema.marks.commentMark.create({ commentId: 'c3p', internal: false });
    const p1 = schema.nodes.paragraph.create(null, schema.text('Para one', [mark]));
    const p2 = schema.nodes.paragraph.create(null, schema.text('Para two', [mark]));
    const p3 = schema.nodes.paragraph.create(null, schema.text('Para three', [mark]));
    const doc = schema.nodes.doc.create(null, [p1, p2, p3]);

    const result = runResolve(doc, 'c3p');

    expect(result.ok).toBe(true);
    expect(countByIdAndType(result.doc, 'commentRangeStart', 'c3p')).toBe(1);
    expect(countByIdAndType(result.doc, 'commentRangeEnd', 'c3p')).toBe(1);
  });

  it('disjoint same-id (paste-preserved): two ranges, scope of each is preserved', () => {
    // The user copy-pastes a commented region; PM preserves the
    // commentMark attrs (no clipboard hook on the mark), so the
    // same commentId now sits on two non-adjacent regions with
    // uncommented content between them. They are logically TWO
    // annotations sharing an id — collapsing them into a single
    // envelope range would expand the comment to cover the
    // unrelated middle content.
    //
    // The OOXML output is still imperfect (two range pairs sharing
    // an id is non-conformant per spec; ids should be unique). A
    // follow-up should remap to fresh ids on resolve. Keeping the
    // ranges separate is strictly better than collapsing them: the
    // anchored extent of each region is preserved, matching the
    // pre-fix behavior for this case while still fixing the
    // paragraph-crossing case.
    const mark = schema.marks.commentMark.create({ commentId: 'c-paste', internal: false });
    const p1 = schema.nodes.paragraph.create(null, schema.text('First', [mark]));
    const p2 = schema.nodes.paragraph.create(null, schema.text('Uncommented middle paragraph'));
    const p3 = schema.nodes.paragraph.create(null, schema.text('Third', [mark]));
    const doc = schema.nodes.doc.create(null, [p1, p2, p3]);

    const result = runResolve(doc, 'c-paste');

    expect(result.ok).toBe(true);
    // Two pairs, one per anchored region. Scope of each is the
    // originally-marked text — uncommented middle is NOT inside
    // either range.
    expect(countByIdAndType(result.doc, 'commentRangeStart', 'c-paste')).toBe(2);
    expect(countByIdAndType(result.doc, 'commentRangeEnd', 'c-paste')).toBe(2);

    // Confirm the scope: walk the doc and verify the uncommented
    // middle paragraph is NOT between any START and END of c-paste.
    const events = [];
    result.doc.descendants((node, pos) => {
      if (node.type.name === 'commentRangeStart' && node.attrs['w:id'] === 'c-paste') {
        events.push({ kind: 'start', pos });
      } else if (node.type.name === 'commentRangeEnd' && node.attrs['w:id'] === 'c-paste') {
        events.push({ kind: 'end', pos });
      } else if (node.isText) {
        events.push({ kind: 'text', pos, text: node.text });
      }
    });
    // Expect ordering: start, "First", end, "Uncommented...", start, "Third", end
    const seq = events.map((e) => (e.kind === 'text' ? `T(${e.text})` : e.kind.toUpperCase()));
    expect(seq).toEqual(['START', 'T(First)', 'END', 'T(Uncommented middle paragraph)', 'START', 'T(Third)', 'END']);
  });

  it('two distinct comments side-by-side: two independent pairs, ids unique per annotation', () => {
    const a = schema.marks.commentMark.create({ commentId: 'cA', internal: false });
    const b = schema.marks.commentMark.create({ commentId: 'cB', internal: false });
    const para = schema.nodes.paragraph.create(null, [
      schema.text('Left', [a]),
      schema.text(' '),
      schema.text('Right', [b]),
    ]);
    const doc = schema.nodes.doc.create(null, [para]);

    const r1 = runResolve(doc, 'cA');
    const r2 = runResolve(r1.doc, 'cB');

    expect(countByIdAndType(r2.doc, 'commentRangeStart', 'cA')).toBe(1);
    expect(countByIdAndType(r2.doc, 'commentRangeEnd', 'cA')).toBe(1);
    expect(countByIdAndType(r2.doc, 'commentRangeStart', 'cB')).toBe(1);
    expect(countByIdAndType(r2.doc, 'commentRangeEnd', 'cB')).toBe(1);
    expect(countAtoms(r2.doc, 'commentRangeStart')).toBe(2);
    expect(countAtoms(r2.doc, 'commentRangeEnd')).toBe(2);
  });

  it('overlapping comments (one nested inside another, across paragraphs): one pair per id', () => {
    // PM allows multiple comment marks on the same node. Resolving
    // each one independently must still produce one pair per id.
    const outer = schema.marks.commentMark.create({ commentId: 'outer', internal: false });
    const inner = schema.marks.commentMark.create({ commentId: 'inner', internal: false });
    const p1 = schema.nodes.paragraph.create(null, [
      schema.text('Outside ', [outer]),
      schema.text('inside both', [outer, inner]),
    ]);
    const p2 = schema.nodes.paragraph.create(null, [
      schema.text('still both', [outer, inner]),
      schema.text(' just outer', [outer]),
    ]);
    const doc = schema.nodes.doc.create(null, [p1, p2]);

    const r1 = runResolve(doc, 'outer');
    const r2 = runResolve(r1.doc, 'inner');

    expect(countByIdAndType(r2.doc, 'commentRangeStart', 'outer')).toBe(1);
    expect(countByIdAndType(r2.doc, 'commentRangeEnd', 'outer')).toBe(1);
    expect(countByIdAndType(r2.doc, 'commentRangeStart', 'inner')).toBe(1);
    expect(countByIdAndType(r2.doc, 'commentRangeEnd', 'inner')).toBe(1);
  });

  it('resolves a thread in one transaction without giving replies story anchors', () => {
    const root = schema.marks.commentMark.create({ commentId: 'root', internal: false });
    const reply = schema.marks.commentMark.create({ commentId: 'reply', internal: false });
    const para = schema.nodes.paragraph.create(null, schema.text('Shared anchor', [root, reply]));
    const doc = schema.nodes.doc.create(null, [para]);
    const state = EditorState.create({ doc, schema });
    const tr = state.tr;

    const ok = resolveCommentsInTr({
      items: [{ commentId: 'root' }, { commentId: 'reply', preserveAnchor: false }],
      state,
      tr,
    });

    expect(ok).toBe(true);
    expect(countByIdAndType(tr.doc, 'commentRangeStart', 'root')).toBe(1);
    expect(countByIdAndType(tr.doc, 'commentRangeEnd', 'root')).toBe(1);
    expect(countByIdAndType(tr.doc, 'commentRangeStart', 'reply')).toBe(0);
    expect(countByIdAndType(tr.doc, 'commentRangeEnd', 'reply')).toBe(0);

    let remainingCommentMarks = 0;
    tr.doc.descendants((node) => {
      remainingCommentMarks += node.marks?.filter((mark) => mark.type.name === 'commentMark').length || 0;
    });
    expect(remainingCommentMarks).toBe(0);
  });

  it('returns false (no-op) when the commentId has no mark in the doc', () => {
    const para = schema.nodes.paragraph.create(null, schema.text('uncommented'));
    const doc = schema.nodes.doc.create(null, [para]);

    const result = runResolve(doc, 'nonexistent');

    expect(result.ok).toBe(false);
    expect(countAtoms(result.doc, 'commentRangeStart')).toBe(0);
    expect(countAtoms(result.doc, 'commentRangeEnd')).toBe(0);
  });
});

/**
 * SD-3355 — resolved-thread replies must stay bound in the export.
 *
 * Resolving a thread converts the root's mark into commentRangeStart/End
 * NODES and removes reply marks entirely (a reply carries no anchor of its
 * own). Word only keeps a comment whose id is referenced from a story via
 * `w:commentReference` (synthesized from the reply's commentRangeEnd at
 * serialization), so `prepareCommentsForExport` must re-anchor every such
 * reply inside its node-anchored ancestor's preserved range.
 */
describe('prepareCommentsForExport — resolved-thread replies re-anchored (SD-3355)', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      commentRangeStart: { group: 'inline', inline: true, attrs: { 'w:id': {}, internal: { default: false } } },
      commentRangeEnd: { group: 'inline', inline: true, attrs: { 'w:id': {}, internal: { default: false } } },
      text: { group: 'inline' },
    },
    marks: {
      commentMark: {
        attrs: { commentId: {}, importedId: { default: null }, internal: { default: false } },
      },
    },
  });

  const countByIdAndType = (doc, typeName, wid) => {
    let n = 0;
    doc.descendants((node) => {
      if (node.type.name === typeName && node.attrs?.['w:id'] === wid) n += 1;
    });
    return n;
  };

  /** Build a doc shaped like a resolved thread: root has anchor NODES, replies have nothing. */
  const buildResolvedThreadDoc = () => {
    const para = schema.nodes.paragraph.create(null, [
      schema.text('before '),
      schema.nodes.commentRangeStart.create({ 'w:id': 'root-1' }),
      schema.text('anchored text'),
      schema.nodes.commentRangeEnd.create({ 'w:id': 'root-1' }),
      schema.text(' after'),
    ]);
    return schema.nodes.doc.create(null, [para]);
  };

  const runPrepare = (doc, comments) => {
    const state = EditorState.create({ doc, schema });
    const tr = state.tr;
    prepareCommentsForExport(doc, tr, schema, comments);
    return tr.doc;
  };

  it('re-anchors a markless reply inside the resolved root anchor nodes', () => {
    const doc = buildResolvedThreadDoc();
    const comments = [
      { commentId: 'root-1', resolvedTime: 1000, createdTime: 1 },
      { commentId: 'reply-1', parentCommentId: 'root-1', createdTime: 2 },
    ];

    const out = runPrepare(doc, comments);

    expect(countByIdAndType(out, 'commentRangeStart', 'reply-1')).toBe(1);
    expect(countByIdAndType(out, 'commentRangeEnd', 'reply-1')).toBe(1);

    // Nesting: Parent Start, Child Start … Parent End, Child End.
    const order = [];
    out.descendants((node) => {
      if (node.type.name === 'commentRangeStart' || node.type.name === 'commentRangeEnd') {
        order.push(`${node.type.name}:${node.attrs['w:id']}`);
      }
    });
    expect(order).toEqual([
      'commentRangeStart:root-1',
      'commentRangeStart:reply-1',
      'commentRangeEnd:root-1',
      'commentRangeEnd:reply-1',
    ]);
  });

  it('walks reply-of-reply chains up to the node-anchored root', () => {
    const doc = buildResolvedThreadDoc();
    const comments = [
      { commentId: 'root-1', resolvedTime: 1000, createdTime: 1 },
      { commentId: 'reply-1', parentCommentId: 'root-1', createdTime: 2 },
      { commentId: 'reply-2', parentCommentId: 'reply-1', createdTime: 3 },
    ];

    const out = runPrepare(doc, comments);

    expect(countByIdAndType(out, 'commentRangeStart', 'reply-1')).toBe(1);
    expect(countByIdAndType(out, 'commentRangeEnd', 'reply-1')).toBe(1);
    expect(countByIdAndType(out, 'commentRangeStart', 'reply-2')).toBe(1);
    expect(countByIdAndType(out, 'commentRangeEnd', 'reply-2')).toBe(1);
  });

  it('leaves replies untouched when they still carry their own mark', () => {
    const replyMark = schema.marks.commentMark.create({ commentId: 'reply-1', internal: false });
    const para = schema.nodes.paragraph.create(null, [
      schema.nodes.commentRangeStart.create({ 'w:id': 'root-1' }),
      schema.text('anchored', [replyMark]),
      schema.nodes.commentRangeEnd.create({ 'w:id': 'root-1' }),
    ]);
    const doc = schema.nodes.doc.create(null, [para]);
    const comments = [
      { commentId: 'root-1', resolvedTime: 1000, createdTime: 1 },
      { commentId: 'reply-1', parentCommentId: 'root-1', createdTime: 2 },
    ];

    const out = runPrepare(doc, comments);

    // The mark pass owns the reply; exactly one pair, not two.
    expect(countByIdAndType(out, 'commentRangeStart', 'reply-1')).toBe(1);
    expect(countByIdAndType(out, 'commentRangeEnd', 'reply-1')).toBe(1);
  });

  it('skips orphans whose thread has no node anchor left', () => {
    const para = schema.nodes.paragraph.create(null, [schema.text('no anchors here')]);
    const doc = schema.nodes.doc.create(null, [para]);
    const comments = [
      { commentId: 'root-1', resolvedTime: 1000, createdTime: 1 },
      { commentId: 'reply-1', parentCommentId: 'root-1', createdTime: 2 },
    ];

    const out = runPrepare(doc, comments);

    expect(countByIdAndType(out, 'commentRangeStart', 'reply-1')).toBe(0);
    expect(countByIdAndType(out, 'commentRangeEnd', 'reply-1')).toBe(0);
  });
});
