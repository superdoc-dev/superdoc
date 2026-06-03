import { describe, it, expect } from 'vitest';
import { collectTrackedChangeThread } from './collect-tracked-change-thread.js';

// SD-2528 P2 #3 — the TC dialog must not shadow a regular parent thread.
// The importer (`documentCommentsImporter.js`) can produce a comment with
// BOTH a non-TC `parentCommentId` AND a `trackedChangeParentId` set: the
// comment's range lives inside a TC, but its conversation thread parent is
// a separate top-level comment outside the TC. Such a reply belongs in its
// real parent's thread, not duplicated inside the TC dialog.

const tc = { commentId: 'tc-1', trackedChange: true };

describe('collectTrackedChangeThread', () => {
  describe('legacy / existing-fixture behaviour (preserved)', () => {
    it('returns just the TC itself when no comments are anchored', () => {
      const sut = collectTrackedChangeThread(tc, [tc]);
      expect(sut.map((c) => c.commentId)).toEqual(['tc-1']);
    });

    it('includes a TC-anchored root comment (no parentCommentId)', () => {
      const root = { commentId: 'c-root', trackedChangeParentId: 'tc-1' };
      const sut = collectTrackedChangeThread(tc, [tc, root]);
      expect(sut.map((c) => c.commentId).sort()).toEqual(['c-root', 'tc-1']);
    });

    it('includes a direct reply via parentCommentId === trackedChangeId (runtime-created replies)', () => {
      const reply = { commentId: 'c-direct', parentCommentId: 'tc-1' };
      const sut = collectTrackedChangeThread(tc, [tc, reply]);
      expect(sut.map((c) => c.commentId).sort()).toEqual(['c-direct', 'tc-1']);
    });

    it('picks up a bi-parented reply whose parent is itself TC-anchored on the same TC (BFS chain)', () => {
      // Mirrors the test fixture: imported-099ba8eb has both parentCommentId
      // (its conversational parent) and trackedChangeParentId on the same TC.
      const root = { commentId: 'c-root', trackedChangeParentId: 'tc-1' };
      const reply = { commentId: 'c-reply', parentCommentId: 'c-root', trackedChangeParentId: 'tc-1' };
      const sut = collectTrackedChangeThread(tc, [tc, root, reply]);
      expect(sut.map((c) => c.commentId).sort()).toEqual(['c-reply', 'c-root', 'tc-1']);
    });

    it('walks the BFS through a deep chain of TC-anchored replies', () => {
      const r0 = { commentId: 'r0', trackedChangeParentId: 'tc-1' };
      const r1 = { commentId: 'r1', parentCommentId: 'r0', trackedChangeParentId: 'tc-1' };
      const r2 = { commentId: 'r2', parentCommentId: 'r1', trackedChangeParentId: 'tc-1' };
      const sut = collectTrackedChangeThread(tc, [tc, r0, r1, r2]);
      expect(sut.map((c) => c.commentId).sort()).toEqual(['r0', 'r1', 'r2', 'tc-1']);
    });
  });

  describe('SD-2528 P2 #3 — bi-parented reply with non-TC-anchored parent must not be in TC dialog', () => {
    it('excludes a reply whose parentCommentId points to a comment that is NOT TC-anchored on this TC', () => {
      // Real-world shape from documentCommentsImporter.js:199 — `rangeParent`
      // can resolve to a comment whose range lives OUTSIDE the TC. The reply
      // gets `parentCommentId = <non-TC parent>` AND `trackedChangeParentId = <TC>`.
      // It belongs in the non-TC parent's thread, NOT here.
      const realParent = { commentId: 'real-parent' /* not TC-anchored */ };
      const biParented = {
        commentId: 'c-bi-parented',
        parentCommentId: 'real-parent',
        trackedChangeParentId: 'tc-1',
      };
      const sut = collectTrackedChangeThread(tc, [tc, realParent, biParented]);
      expect(sut.map((c) => c.commentId)).not.toContain('c-bi-parented');
    });

    it('still includes a sibling TC-anchored root even when an unrelated bi-parented reply is filtered out', () => {
      const root = { commentId: 'c-root', trackedChangeParentId: 'tc-1' };
      const realParent = { commentId: 'real-parent' };
      const biParented = {
        commentId: 'c-bi-parented',
        parentCommentId: 'real-parent',
        trackedChangeParentId: 'tc-1',
      };
      const sut = collectTrackedChangeThread(tc, [tc, root, realParent, biParented]);
      expect(sut.map((c) => c.commentId).sort()).toEqual(['c-root', 'tc-1']);
    });

    it('excludes a reply whose parentCommentId points to a comment anchored on a DIFFERENT TC', () => {
      const otherTcRoot = { commentId: 'other-root', trackedChangeParentId: 'tc-OTHER' };
      const biParented = {
        commentId: 'c-bi-parented',
        parentCommentId: 'other-root',
        trackedChangeParentId: 'tc-1',
      };
      const sut = collectTrackedChangeThread(tc, [tc, otherTcRoot, biParented]);
      expect(sut.map((c) => c.commentId)).not.toContain('c-bi-parented');
    });
  });
});
