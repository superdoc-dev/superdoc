import { describe, it, expect, vi } from 'vitest';
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
    state: 'confirmed',
    recheckId: null,
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

    it('returns both confirmed and mapped issues', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ state: 'confirmed' }));
      store.addIssue(makeIssue({ segmentId: 'seg-1', pmFrom: 20, pmTo: 25, state: 'mapped', recheckId: 1 }));

      const display = store.getDisplayIssues([]);
      expect(display).toHaveLength(2);
    });

    it('filters out ignored words using word field (case-insensitive)', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ word: 'Teh' }));
      store.addIssue(makeIssue({ word: 'foo', segmentId: 'seg-1', pmFrom: 20, pmTo: 23 }));

      const display = store.getDisplayIssues(['teh']);
      expect(display).toHaveLength(1);
      expect(display[0].word).toBe('foo');
    });

    it('filters with NFC normalization', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ word: 'caf\u00e9' }));

      const display = store.getDisplayIssues(['cafe\u0301']); // NFD form
      expect(display).toHaveLength(0);
    });

    it('suppressed issues remain in store (re-surface when ignored words shrink)', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ word: 'teh' }));

      expect(store.getDisplayIssues(['teh'])).toHaveLength(0);
      expect(store.getDisplayIssues([])).toHaveLength(1);
    });
  });

  describe('remapIssues', () => {
    it('transforms issue positions through mapping', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ pmFrom: 10, pmTo: 13 }));

      // Mock mapping: shift all positions by +5
      const mapping = {
        mapResult: (pos: number) => ({ pos: pos + 5, deleted: false }),
      };

      store.remapIssues(new Set(['seg-0']), mapping as any, 1);

      const issues = store.getAllIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0].pmFrom).toBe(15);
      expect(issues[0].pmTo).toBe(18);
      expect(issues[0].state).toBe('mapped');
      expect(issues[0].recheckId).toBe(1);
    });

    it('drops issues when pmFrom is deleted', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ pmFrom: 10, pmTo: 13 }));

      const mapping = {
        mapResult: (pos: number, assoc: number) =>
          assoc === -1
            ? { pos: 10, deleted: true } // pmFrom deleted
            : { pos: 13, deleted: false },
      };

      store.remapIssues(new Set(['seg-0']), mapping as any, 1);
      expect(store.isEmpty).toBe(true);
    });

    it('drops issues when pmTo is deleted', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ pmFrom: 10, pmTo: 13 }));

      const mapping = {
        mapResult: (pos: number, assoc: number) =>
          assoc === 1
            ? { pos: 13, deleted: true } // pmTo deleted
            : { pos: 10, deleted: false },
      };

      store.remapIssues(new Set(['seg-0']), mapping as any, 1);
      expect(store.isEmpty).toBe(true);
    });

    it('drops issues when mapped range collapses', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ pmFrom: 10, pmTo: 13 }));

      // Both positions map to the same place
      const mapping = {
        mapResult: () => ({ pos: 10, deleted: false }),
      };

      store.remapIssues(new Set(['seg-0']), mapping as any, 1);
      expect(store.isEmpty).toBe(true);
    });

    it('only affects issues in specified segment IDs', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ segmentId: 'seg-0', pmFrom: 10, pmTo: 13 }));
      store.addIssue(makeIssue({ segmentId: 'seg-1', pmFrom: 20, pmTo: 23 }));

      const mapping = {
        mapResult: (pos: number) => ({ pos: pos + 5, deleted: false }),
      };

      store.remapIssues(new Set(['seg-0']), mapping as any, 1);

      const issues = store.getAllIssues();
      const seg0 = issues.find((i) => i.segmentId === 'seg-0')!;
      const seg1 = issues.find((i) => i.segmentId === 'seg-1')!;

      expect(seg0.pmFrom).toBe(15); // Remapped
      expect(seg0.state).toBe('mapped');
      expect(seg1.pmFrom).toBe(20); // Untouched
      expect(seg1.state).toBe('confirmed');
    });

    it('overwrites recheckId on already-mapped issues', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ state: 'mapped', recheckId: 1 }));

      const mapping = {
        mapResult: (pos: number) => ({ pos: pos + 1, deleted: false }),
      };

      store.remapIssues(new Set(['seg-0']), mapping as any, 2);
      expect(store.getAllIssues()[0].recheckId).toBe(2);
    });
  });

  describe('replaceBatchResults', () => {
    it('replaces mapped issues in covered segments with fresh ones', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ state: 'mapped', recheckId: 1, segmentId: 'seg-0' }));

      const fresh = makeIssue({ pmFrom: 11, pmTo: 14, state: 'confirmed', recheckId: null, segmentId: 'seg-0' });
      store.replaceBatchResults(new Set([1]), new Set(['seg-0']), [fresh]);

      const issues = store.getAllIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0].pmFrom).toBe(11);
      expect(issues[0].state).toBe('confirmed');
    });

    it('does not affect mapped issues in non-covered segments (multi-batch safe)', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ state: 'mapped', recheckId: 1, segmentId: 'seg-0' }));
      store.addIssue(makeIssue({ state: 'mapped', recheckId: 1, segmentId: 'seg-1', pmFrom: 20, pmTo: 23 }));

      // Batch only covers seg-0
      store.replaceBatchResults(new Set([1]), new Set(['seg-0']), []);

      const issues = store.getAllIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0].segmentId).toBe('seg-1'); // Untouched — still mapped
      expect(issues[0].state).toBe('mapped');
    });

    it('does not affect confirmed issues in covered segments', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ state: 'confirmed', recheckId: null, segmentId: 'seg-0' }));
      store.addIssue(makeIssue({ state: 'mapped', recheckId: 1, segmentId: 'seg-0', pmFrom: 20, pmTo: 23 }));

      store.replaceBatchResults(new Set([1]), new Set(['seg-0']), []);

      const issues = store.getAllIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0].state).toBe('confirmed');
    });

    it('does not affect issues with different recheckId', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ state: 'mapped', recheckId: 2, segmentId: 'seg-0' }));

      store.replaceBatchResults(new Set([1]), new Set(['seg-0']), []);

      expect(store.size).toBe(1);
      expect(store.getAllIssues()[0].recheckId).toBe(2);
    });
  });

  describe('removeOrphanedSegments', () => {
    it('removes issues for segment IDs not in current set', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ segmentId: 'seg-0' }));
      store.addIssue(makeIssue({ segmentId: 'seg-100', pmFrom: 20, pmTo: 23 }));

      store.removeOrphanedSegments(new Set(['seg-0']));

      expect(store.size).toBe(1);
      expect(store.getAllIssues()[0].segmentId).toBe('seg-0');
    });

    it('keeps all issues when all segments are current', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ segmentId: 'seg-0' }));
      store.addIssue(makeIssue({ segmentId: 'seg-1', pmFrom: 20, pmTo: 23 }));

      store.removeOrphanedSegments(new Set(['seg-0', 'seg-1']));

      expect(store.size).toBe(2);
    });
  });

  describe('getActiveRecheckIds', () => {
    it('returns empty set when no mapped issues', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ state: 'confirmed', recheckId: null }));
      expect(store.getActiveRecheckIds().size).toBe(0);
    });

    it('returns recheckIds from mapped issues', () => {
      const store = new ProofingStore();
      store.addIssue(makeIssue({ state: 'mapped', recheckId: 3 }));
      store.addIssue(makeIssue({ state: 'mapped', recheckId: 5, segmentId: 'seg-1', pmFrom: 20, pmTo: 23 }));

      const ids = store.getActiveRecheckIds();
      expect(ids).toEqual(new Set([3, 5]));
    });
  });
});
