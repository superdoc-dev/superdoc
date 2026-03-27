import { describe, expect, it } from 'vitest';

import type { CanonicalDiffableState } from './canonicalize';
import { computeFingerprint } from './fingerprint';

const STABLE_CANONICAL_STATE_HASH = '6fe514692e04f502d7a18b8bb9f2b23a15943d44abe8b270640cb0efb2254cb0';

describe('computeFingerprint', () => {
  it('matches the expected SHA-256 for a stable canonical state', () => {
    const state: CanonicalDiffableState = {
      body: { type: 'doc' },
      comments: [],
      styles: null,
      numbering: null,
      headerFooters: null,
      partsState: null,
    };

    expect(computeFingerprint(state)).toBe(STABLE_CANONICAL_STATE_HASH);
  });

  it('changes when comment body content changes', () => {
    const baseState: CanonicalDiffableState = {
      body: { type: 'doc' },
      comments: [{ commentId: 'c1', textJson: { type: 'doc', content: [{ type: 'text', text: 'A' }] } }],
      styles: null,
      numbering: null,
      headerFooters: null,
      partsState: null,
    };
    const changedState: CanonicalDiffableState = {
      body: { type: 'doc' },
      comments: [{ commentId: 'c1', textJson: { type: 'doc', content: [{ type: 'text', text: 'B' }] } }],
      styles: null,
      numbering: null,
      headerFooters: null,
      partsState: null,
    };

    expect(computeFingerprint(baseState)).not.toBe(computeFingerprint(changedState));
  });

  it('changes when comment identity changes', () => {
    const baseState: CanonicalDiffableState = {
      body: { type: 'doc' },
      comments: [{ commentId: 'c1', textJson: { type: 'doc', content: [{ type: 'text', text: 'Same' }] } }],
      styles: null,
      numbering: null,
      headerFooters: null,
      partsState: null,
    };
    const changedState: CanonicalDiffableState = {
      body: { type: 'doc' },
      comments: [{ commentId: 'c2', textJson: { type: 'doc', content: [{ type: 'text', text: 'Same' }] } }],
      styles: null,
      numbering: null,
      headerFooters: null,
      partsState: null,
    };

    expect(computeFingerprint(baseState)).not.toBe(computeFingerprint(changedState));
  });
});
