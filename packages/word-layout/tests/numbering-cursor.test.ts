import { describe, expect, it } from 'bun:test';

import { createNumberingManager, type NumberingManager, type NumberingCursor } from '../src/numbering-manager.js';

/**
 * Compact (cursor-timeline) mode must be behaviourally identical to the
 * cache-enabled reference the projection resolver uses today
 * (`createFreshNumberingManager` → `enableCache()`), while retaining only
 * last-seen facts instead of the historical per-position maps. These tests pin
 * that equivalence, the same-realm cursor contract, and linear persistent
 * retention across active scopes and transitions.
 */

interface Def {
  numId: number | string;
  abstractId: number | string;
  ilvl: number;
  start?: number;
  restart?: number;
  startOverridden?: boolean;
  ancestorStartSettings?: Array<{ ilvl: number; start: number; restart?: number; startOverridden: boolean }>;
}

/** Mirror `computeWordListMarker`'s exact manager call sequence. */
function project(manager: NumberingManager, def: Def, ordinal: number): { counter: number; path: number[] } {
  if (def.ancestorStartSettings) {
    for (const a of def.ancestorStartSettings) {
      manager.ensureStartSettings(def.numId, a.ilvl, a.start, a.restart, a.startOverridden);
    }
  }
  manager.setStartSettings(def.numId, def.ilvl, def.start ?? 1, def.restart, def.startOverridden ?? false);
  const counter = manager.calculateCounter(def.numId, def.ilvl, ordinal, def.abstractId);
  manager.setCounter(def.numId, def.ilvl, ordinal, counter, def.abstractId);
  const path = manager.calculatePath(def.numId, def.ilvl, ordinal);
  return { counter, path };
}

function cacheManager(): NumberingManager {
  const m = createNumberingManager();
  m.enableCache();
  return m;
}

function compactManager(): NumberingManager {
  const m = createNumberingManager();
  m.enableCompactMode();
  return m;
}

/** A dense, varied scenario: flat continuation, nesting, restart, shared abstract, startOverride. */
const SCENARIO: Array<{ def: Def; ordinal: number }> = [
  // Flat list on abstract A (numId 1).
  { def: { numId: 1, abstractId: 'A', ilvl: 0, start: 1 }, ordinal: 0 },
  { def: { numId: 1, abstractId: 'A', ilvl: 0, start: 1 }, ordinal: 1 },
  // Nested level 1 with ancestor priming; then a level-0 sibling forces a restart of level 1.
  {
    def: {
      numId: 1,
      abstractId: 'A',
      ilvl: 1,
      start: 1,
      ancestorStartSettings: [{ ilvl: 0, start: 1, startOverridden: false }],
    },
    ordinal: 2,
  },
  { def: { numId: 1, abstractId: 'A', ilvl: 1, start: 1 }, ordinal: 3 },
  { def: { numId: 1, abstractId: 'A', ilvl: 0, start: 1 }, ordinal: 4 },
  {
    def: {
      numId: 1,
      abstractId: 'A',
      ilvl: 1,
      start: 1,
      ancestorStartSettings: [{ ilvl: 0, start: 1, startOverridden: false }],
    },
    ordinal: 5,
  },
  // Shared abstract A via a second concrete numId (2) — counters continue across numIds.
  { def: { numId: 2, abstractId: 'A', ilvl: 0, start: 1 }, ordinal: 6 },
  // Independent numId 9 with startOverride scoping counters to the concrete numId.
  { def: { numId: 9, abstractId: 'B', ilvl: 0, start: 5, startOverridden: true }, ordinal: 7 },
  { def: { numId: 9, abstractId: 'B', ilvl: 0, start: 5, startOverridden: true }, ordinal: 8 },
  // restart=0 → simple increment regardless of lower-level usage.
  { def: { numId: 4, abstractId: 'C', ilvl: 0, start: 1, restart: 0 }, ordinal: 9 },
  {
    def: {
      numId: 4,
      abstractId: 'C',
      ilvl: 1,
      start: 1,
      ancestorStartSettings: [{ ilvl: 0, start: 1, restart: 0, startOverridden: false }],
    },
    ordinal: 10,
  },
  { def: { numId: 4, abstractId: 'C', ilvl: 0, start: 1, restart: 0 }, ordinal: 11 },
];

describe('NumberingManager compact mode parity', () => {
  it('produces identical counters and paths to the cache-enabled reference', () => {
    const ref = cacheManager();
    const compact = compactManager();
    for (const step of SCENARIO) {
      const a = project(ref, step.def, step.ordinal);
      const b = project(compact, step.def, step.ordinal);
      expect(b.counter).toBe(a.counter);
      expect(b.path).toEqual(a.path);
    }
  });

  it('matches the reference across a long single-level run', () => {
    const ref = cacheManager();
    const compact = compactManager();
    for (let ordinal = 0; ordinal < 500; ordinal++) {
      const def: Def = { numId: 1, abstractId: 'A', ilvl: 0, start: 1 };
      expect(project(compact, def, ordinal).counter).toBe(project(ref, def, ordinal).counter);
    }
  });

  it('matches the reference across broad shared IDs, nesting, overrides, and restarts', () => {
    const ref = cacheManager();
    const compact = compactManager();
    for (let ordinal = 0; ordinal < 2_000; ordinal += 1) {
      const numId = ((ordinal * 17) % 200) + 1;
      const ilvl = ordinal % 3;
      const def: Def = {
        numId,
        abstractId: `A${numId % 37}`,
        ilvl,
        start: numId % 13 === 0 ? 3 : 1,
        restart: ilvl === 0 || numId % 7 !== 0 ? undefined : 0,
        startOverridden: numId % 11 === 0,
        ancestorStartSettings: Array.from({ length: ilvl }, (_, ancestorLevel) => ({
          ilvl: ancestorLevel,
          start: 1,
          startOverridden: numId % 11 === 0,
        })),
      };
      expect(project(compact, def, ordinal)).toEqual(project(ref, def, ordinal));
    }
  });

  it('retains a linear persistent transition history, not cloned prefixes', () => {
    const short = compactManager();
    const shortCursors: NumberingCursor[] = [];
    for (let o = 0; o < 50; o++) {
      project(short, { numId: o + 1, abstractId: `A${o + 1}`, ilvl: 0 }, o);
      shortCursors.push(short.captureCursor());
    }
    const long = compactManager();
    const longCursors: NumberingCursor[] = [];
    for (let o = 0; o < 100; o++) {
      project(long, { numId: o + 1, abstractId: `A${o + 1}`, ilvl: 0 }, o);
      longCursors.push(long.captureCursor());
    }

    // Cursors hold one immutable state pointer. The final state's allocation
    // count covers every structurally-shared trie node reachable through the
    // retained cursor history, so doubling both paragraphs and active scopes
    // must remain linear rather than the ~4x prefix-clone curve.
    const allocatedNodes = (cursor: NumberingCursor): number =>
      (cursor as unknown as { state: { allocatedNodes: number } }).state.allocatedNodes;
    const shortNodes = allocatedNodes(shortCursors[shortCursors.length - 1]!);
    const longNodes = allocatedNodes(longCursors[longCursors.length - 1]!);
    expect(longNodes / shortNodes).toBeLessThanOrEqual(2.1);

    const first = long.captureCursor() as unknown as { state: unknown };
    const second = long.captureCursor() as unknown as { state: unknown };
    expect(second.state).toBe(first.state);
  });
});

describe('NumberingManager cursor capture/restore', () => {
  it('resumes projection identically after capture + restore into a fresh manager', () => {
    // Uninterrupted reference.
    const uninterrupted = compactManager();
    const expected: number[] = [];
    for (let o = 0; o < 20; o++) {
      expected.push(project(uninterrupted, { numId: 1, abstractId: 'A', ilvl: 0 }, o).counter);
    }

    // Project a prefix, capture, restore into a fresh compact manager, continue.
    const first = compactManager();
    const got: number[] = [];
    for (let o = 0; o < 10; o++) got.push(project(first, { numId: 1, abstractId: 'A', ilvl: 0 }, o).counter);
    const cursor = first.captureCursor();

    const resumed = compactManager();
    resumed.restoreCursor(cursor);
    for (let o = 10; o < 20; o++) got.push(project(resumed, { numId: 1, abstractId: 'A', ilvl: 0 }, o).counter);

    expect(got).toEqual(expected);
  });

  it('restores independent cursors in forward, reverse, and interleaved order', () => {
    const base = compactManager();
    for (let o = 0; o < 5; o++) project(base, { numId: 1, abstractId: 'A', ilvl: 0 }, o);
    const cursorAt5 = base.captureCursor();
    for (let o = 5; o < 8; o++) project(base, { numId: 1, abstractId: 'A', ilvl: 0 }, o);
    const cursorAt8 = base.captureCursor();

    // Restore the later cursor first, then the earlier one — each continues correctly.
    const later = compactManager();
    later.restoreCursor(cursorAt8);
    expect(project(later, { numId: 1, abstractId: 'A', ilvl: 0 }, 8).counter).toBe(9);

    const earlier = compactManager();
    earlier.restoreCursor(cursorAt5);
    expect(project(earlier, { numId: 1, abstractId: 'A', ilvl: 0 }, 5).counter).toBe(6);
  });

  it('resets to empty state on restoreCursor(null)', () => {
    const m = compactManager();
    for (let o = 0; o < 5; o++) project(m, { numId: 1, abstractId: 'A', ilvl: 0 }, o);
    m.restoreCursor(null);
    expect(project(m, { numId: 1, abstractId: 'A', ilvl: 0 }, 0).counter).toBe(1);
  });

  it('rejects a foreign / serialized cursor (structuredClone strips the brand)', () => {
    const m = compactManager();
    project(m, { numId: 1, abstractId: 'A', ilvl: 0 }, 0);
    const cursor = m.captureCursor();
    expect(JSON.stringify(cursor)).toBe('{}');
    // A cursor that crossed a worker/page boundary loses its Symbol brand.
    const serialized = structuredClone(cursor) as NumberingCursor;
    expect(() => compactManager().restoreCursor(serialized)).toThrow(/foreign or serialized/i);
    // A plain object masquerading as a cursor is also rejected.
    expect(() => compactManager().restoreCursor({} as unknown as NumberingCursor)).toThrow();
  });

  it('rejects capture and restore outside compact mode', () => {
    const compact = compactManager();
    project(compact, { numId: 1, abstractId: 'A', ilvl: 0 }, 0);
    const cursor = compact.captureCursor();

    expect(() => createNumberingManager().captureCursor()).toThrow(/compact mode is required/i);
    expect(() => createNumberingManager().restoreCursor(cursor)).toThrow(/compact mode is required/i);
  });

  it('keeps live and shared-abstract counters continuous across a restore', () => {
    // numId 1 and numId 2 share abstract A; the cursor must carry the shared
    // abstract counter so a numId-2 paragraph continues numId-1's sequence.
    const m = compactManager();
    expect(project(m, { numId: 1, abstractId: 'A', ilvl: 0 }, 0).counter).toBe(1);
    expect(project(m, { numId: 1, abstractId: 'A', ilvl: 0 }, 1).counter).toBe(2);
    const cursor = m.captureCursor();

    const resumed = compactManager();
    resumed.restoreCursor(cursor);
    expect(project(resumed, { numId: 2, abstractId: 'A', ilvl: 0 }, 2).counter).toBe(3);
  });
});
