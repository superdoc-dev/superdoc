import { describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  getCurrentUserIdentity,
  getChangeAuthorIdentity,
  classifyOwnership,
  isSameUserHighConfidence,
  matchesSameUserRefinement,
  shouldCollapseNoEmailInsertion,
} from './identity.js';

describe('review-model/identity', () => {
  describe('normalizeEmail', () => {
    it('lowercases and trims a string email', () => {
      expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
    });
    it('returns "" for non-string values', () => {
      expect(normalizeEmail(undefined)).toBe('');
      expect(normalizeEmail(null)).toBe('');
      expect(normalizeEmail(42)).toBe('');
      expect(normalizeEmail({ email: 'x' })).toBe('');
    });
    it('returns "" for whitespace-only strings', () => {
      expect(normalizeEmail('   ')).toBe('');
    });
  });

  describe('getCurrentUserIdentity', () => {
    it('extracts identity from a configured editor', () => {
      const editor = { options: { user: { id: 'alice-id', name: 'Alice', email: 'Alice@example.com' } } };
      expect(getCurrentUserIdentity(editor)).toEqual({
        id: 'alice-id',
        email: 'alice@example.com',
        name: 'Alice',
        hasId: true,
        hasEmail: true,
      });
    });
    it('returns empty identity for missing editor/user', () => {
      expect(getCurrentUserIdentity(undefined)).toEqual({ id: '', email: '', name: '', hasId: false, hasEmail: false });
      expect(getCurrentUserIdentity({ options: {} })).toEqual({
        id: '',
        email: '',
        name: '',
        hasId: false,
        hasEmail: false,
      });
    });
  });

  describe('getChangeAuthorIdentity', () => {
    it('reads from a raw mark', () => {
      const mark = { attrs: { author: 'Bob', authorId: 'bob-id', authorEmail: 'BOB@example.com' } };
      expect(getChangeAuthorIdentity(mark)).toEqual({
        id: 'bob-id',
        email: 'bob@example.com',
        name: 'Bob',
        hasId: true,
        hasEmail: true,
      });
    });
    it('reads from flat attrs', () => {
      expect(
        getChangeAuthorIdentity({ author: 'Carol', authorId: 'carol-id', authorEmail: 'carol@example.com' }),
      ).toEqual({
        id: 'carol-id',
        email: 'carol@example.com',
        name: 'Carol',
        hasId: true,
        hasEmail: true,
      });
    });
    it('returns empty for null', () => {
      expect(getChangeAuthorIdentity(null)).toEqual({ id: '', email: '', name: '', hasId: false, hasEmail: false });
    });
  });

  describe('classifyOwnership', () => {
    const alice = { id: 'alice-id', email: 'alice@example.com', name: 'Alice', hasId: true, hasEmail: true };
    const bob = { id: 'bob-id', email: 'bob@example.com', name: 'Bob', hasId: true, hasEmail: true };

    it('prefers actor ids over matching emails', () => {
      expect(
        classifyOwnership({
          currentUser: alice,
          change: { ...bob, email: alice.email },
        }),
      ).toBe('different-user');
    });
    it('treats matching actor ids as same-user even when emails differ', () => {
      expect(
        classifyOwnership({
          currentUser: alice,
          change: { ...alice, email: 'alias@example.com' },
        }),
      ).toBe('same-user');
    });
    it('returns same-user for matching emails', () => {
      expect(
        classifyOwnership({
          currentUser: { id: '', email: alice.email, name: 'Alice', hasId: false, hasEmail: true },
          change: { id: '', email: alice.email, name: 'Alice', hasId: false, hasEmail: true },
        }),
      ).toBe('same-user');
    });
    it('returns different-user for distinct emails', () => {
      expect(
        classifyOwnership({
          currentUser: { id: '', email: alice.email, name: 'Alice', hasId: false, hasEmail: true },
          change: { id: '', email: bob.email, name: 'Bob', hasId: false, hasEmail: true },
        }),
      ).toBe('different-user');
    });
    it('returns unknown-current-user when current email is missing', () => {
      expect(
        classifyOwnership({
          currentUser: { id: '', email: '', name: '', hasId: false, hasEmail: false },
          change: { id: '', email: bob.email, name: 'Bob', hasId: false, hasEmail: true },
        }),
      ).toBe('unknown-current-user');
    });
    it('returns unknown-change-author when change email is missing', () => {
      expect(
        classifyOwnership({
          currentUser: { id: '', email: alice.email, name: 'Alice', hasId: false, hasEmail: true },
          change: { id: '', email: '', name: 'B', hasId: false, hasEmail: false },
        }),
      ).toBe('unknown-change-author');
    });
    it('display-name-only never matches', () => {
      expect(
        classifyOwnership({
          currentUser: { id: '', email: '', name: 'Alice', hasId: false, hasEmail: false },
          change: { id: '', email: '', name: 'Alice', hasId: false, hasEmail: false },
        }),
      ).toBe('unknown-current-user');
    });
    it('returns conflicting when importedAuthor disagrees with name', () => {
      expect(
        classifyOwnership({
          currentUser: alice,
          change: { ...alice, name: 'Imported Alice', importedAuthor: 'Mallory' },
        }),
      ).toBe('conflicting');
    });
    it('isSameUserHighConfidence only on same-user', () => {
      expect(isSameUserHighConfidence('same-user')).toBe(true);
      expect(isSameUserHighConfidence('different-user')).toBe(false);
      expect(isSameUserHighConfidence('unknown-current-user')).toBe(false);
      expect(isSameUserHighConfidence('unknown-change-author')).toBe(false);
      expect(isSameUserHighConfidence('conflicting')).toBe(false);
    });
    it('allows legacy anonymous refinement only when names match or are absent', () => {
      expect(
        matchesSameUserRefinement({
          currentUser: { id: '', email: '', name: 'Alice', hasId: false, hasEmail: false },
          change: { id: '', email: '', name: 'Alice', hasId: false, hasEmail: false },
        }),
      ).toBe(true);
      expect(
        matchesSameUserRefinement({
          currentUser: { id: '', email: '', name: 'Alice', hasId: false, hasEmail: false },
          change: {
            id: '',
            email: '',
            name: '',
            hasId: false,
            hasEmail: false,
            importedAuthor: 'Mallory (imported)',
          },
        }),
      ).toBe(false);
    });

    it('only collapses no-email insertions through imported provenance', () => {
      expect(
        shouldCollapseNoEmailInsertion({
          currentUser: { name: '', email: '' },
          insertionAttrs: { author: '', authorEmail: '', sourceId: '1' },
        }),
      ).toBe(true);

      expect(
        shouldCollapseNoEmailInsertion({
          currentUser: { name: '', email: '' },
          insertionAttrs: { author: '', authorEmail: '', sourceId: '' },
        }),
      ).toBe(false);
    });
  });
});
