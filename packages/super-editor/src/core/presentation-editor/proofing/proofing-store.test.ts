import { describe, it, expect } from 'vitest';
import { ProofingStore } from './proofing-store.js';
import type { StoredIssue } from './types.js';

function makeIssue(overrides: Partial<StoredIssue> = {}): StoredIssue {
  return {
    segmentId: 'seg-0',
    start: 0,
    end: 5,
    kind: 'spelling',
    message: 'teh',
    replacements: ['the'],
    pmFrom: 10,
    pmTo: 13,
    ...overrides,
  };
}

describe('ProofingStore', () => {
  it('starts empty', () => {
    const store = new ProofingStore();
    expect(store.isEmpty).toBe(true);
    expect(store.size).toBe(0);
    expect(store.getAllIssues()).toEqual([]);
  });

  it('stores and retrieves issues', () => {
    const store = new ProofingStore();
    const issue = makeIssue();
    store.addIssue(issue);
    expect(store.size).toBe(1);
    expect(store.getAllIssues()).toEqual([issue]);
  });

  it('stores multiple issues per segment', () => {
    const store = new ProofingStore();
    store.addIssue(makeIssue({ start: 0, end: 3, pmFrom: 10, pmTo: 13 }));
    store.addIssue(makeIssue({ start: 5, end: 8, pmFrom: 15, pmTo: 18 }));
    expect(store.size).toBe(2);
  });

  it('removes issues by segment IDs', () => {
    const store = new ProofingStore();
    store.addIssue(makeIssue({ segmentId: 'seg-0' }));
    store.addIssue(makeIssue({ segmentId: 'seg-1' }));
    store.removeBySegmentIds(new Set(['seg-0']));
    expect(store.size).toBe(1);
    expect(store.getAllIssues()[0].segmentId).toBe('seg-1');
  });

  it('clears all issues', () => {
    const store = new ProofingStore();
    store.addIssue(makeIssue());
    store.clear();
    expect(store.isEmpty).toBe(true);
  });

  describe('getDisplayIssues', () => {
    it('returns only spelling issues', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ kind: 'spelling' }));
      store.addIssue(makeIssue({ kind: 'grammar', segmentId: 'seg-1', pmFrom: 20, pmTo: 25 }));

      const display = store.getDisplayIssues([]);
      expect(display).toHaveLength(1);
      expect(display[0].kind).toBe('spelling');
    });

    it('filters out ignored words (case-insensitive)', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ message: 'Teh' }));
      store.addIssue(makeIssue({ message: 'foo', segmentId: 'seg-1', pmFrom: 20, pmTo: 23 }));

      const display = store.getDisplayIssues(['teh']);
      expect(display).toHaveLength(1);
      expect(display[0].message).toBe('foo');
    });

    it('filters with NFC normalization', () => {
      const store = new ProofingStore();
      // 'café' in NFC vs NFD
      store.addIssue(makeIssue({ message: 'caf\u00e9' }));

      const display = store.getDisplayIssues(['cafe\u0301']); // NFD form
      // After NFC normalization, both should match
      expect(display).toHaveLength(0);
    });

    it('suppressed issues remain in store (re-surface when ignored words shrink)', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ message: 'teh' }));

      // Suppressed
      expect(store.getDisplayIssues(['teh'])).toHaveLength(0);

      // Re-surfaced
      expect(store.getDisplayIssues([])).toHaveLength(1);
    });
  });
});
