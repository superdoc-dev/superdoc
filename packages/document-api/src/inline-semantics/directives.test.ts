import { describe, it, expect } from 'bun:test';
import {
  applyDirectiveTransition,
  wouldDirectiveChange,
  derivePropertyStateFromDirect,
  derivePropertyStateWithCascade,
} from './directives.js';
import type { DirectState } from './directives.js';

// ---------------------------------------------------------------------------
// Transition matrix — exhaustive (3 current × 3 directive = 9 combinations)
// ---------------------------------------------------------------------------

describe('applyDirectiveTransition', () => {
  const cases: Array<[DirectState, DirectState, DirectState]> = [
    ['on', 'on', 'on'],
    ['on', 'off', 'off'],
    ['on', 'clear', 'clear'],
    ['off', 'on', 'on'],
    ['off', 'off', 'off'],
    ['off', 'clear', 'clear'],
    ['clear', 'on', 'on'],
    ['clear', 'off', 'off'],
    ['clear', 'clear', 'clear'],
  ];

  it.each(cases)('(%s, %s) → %s', (current, directive, expected) => {
    expect(applyDirectiveTransition(current, directive)).toBe(expected);
  });
});

describe('wouldDirectiveChange', () => {
  it('returns false for no-ops', () => {
    expect(wouldDirectiveChange('on', 'on')).toBe(false);
    expect(wouldDirectiveChange('off', 'off')).toBe(false);
    expect(wouldDirectiveChange('clear', 'clear')).toBe(false);
  });

  it('returns true for actual changes', () => {
    expect(wouldDirectiveChange('on', 'off')).toBe(true);
    expect(wouldDirectiveChange('on', 'clear')).toBe(true);
    expect(wouldDirectiveChange('off', 'on')).toBe(true);
    expect(wouldDirectiveChange('off', 'clear')).toBe(true);
    expect(wouldDirectiveChange('clear', 'on')).toBe(true);
    expect(wouldDirectiveChange('clear', 'off')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Direct-to-effective derivation (headless/conservative fallback)
// ---------------------------------------------------------------------------

describe('derivePropertyStateFromDirect', () => {
  it('on → effective: true, provenance: direct-on', () => {
    const state = derivePropertyStateFromDirect('on');
    expect(state).toEqual({ direct: 'on', effective: true, provenance: 'direct-on' });
  });

  it('off → effective: false, provenance: direct-off', () => {
    const state = derivePropertyStateFromDirect('off');
    expect(state).toEqual({ direct: 'off', effective: false, provenance: 'direct-off' });
  });

  it('clear → effective: false, provenance: unresolved', () => {
    const state = derivePropertyStateFromDirect('clear');
    expect(state).toEqual({ direct: 'clear', effective: false, provenance: 'unresolved' });
  });
});

// ---------------------------------------------------------------------------
// Cascade-resolved effective derivation
// ---------------------------------------------------------------------------

describe('derivePropertyStateWithCascade', () => {
  it('on with cascade false → still effective: true (direct wins)', () => {
    const state = derivePropertyStateWithCascade('on', false);
    expect(state).toEqual({ direct: 'on', effective: true, provenance: 'direct-on' });
  });

  it('off with cascade true → still effective: false (direct wins)', () => {
    const state = derivePropertyStateWithCascade('off', true);
    expect(state).toEqual({ direct: 'off', effective: false, provenance: 'direct-off' });
  });

  it('clear with cascade true → effective: true, provenance: style-cascade', () => {
    const state = derivePropertyStateWithCascade('clear', true);
    expect(state).toEqual({ direct: 'clear', effective: true, provenance: 'style-cascade' });
  });

  it('clear with cascade false → effective: false, provenance: style-cascade', () => {
    const state = derivePropertyStateWithCascade('clear', false);
    expect(state).toEqual({ direct: 'clear', effective: false, provenance: 'style-cascade' });
  });
});
