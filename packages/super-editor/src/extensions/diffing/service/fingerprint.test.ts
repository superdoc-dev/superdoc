import { describe, expect, it } from 'vitest';

import type { CanonicalDiffableState } from './canonicalize';
import { computeFingerprint } from './fingerprint';

describe('computeFingerprint', () => {
  it('matches the expected SHA-256 for a stable canonical state', () => {
    const state: CanonicalDiffableState = {
      body: { type: 'doc' },
      comments: [],
      styles: null,
      numbering: null,
    };

    expect(computeFingerprint(state)).toBe('66a5174811bcb593a6927a09fa130a40705a453407a6fc7777d9d3bcede7892e');
  });

  it('changes when comment body content changes', () => {
    const baseState: CanonicalDiffableState = {
      body: { type: 'doc' },
      comments: [{ commentId: 'c1', textJson: { type: 'doc', content: [{ type: 'text', text: 'A' }] } }],
      styles: null,
      numbering: null,
    };
    const changedState: CanonicalDiffableState = {
      body: { type: 'doc' },
      comments: [{ commentId: 'c1', textJson: { type: 'doc', content: [{ type: 'text', text: 'B' }] } }],
      styles: null,
      numbering: null,
    };

    expect(computeFingerprint(baseState)).not.toBe(computeFingerprint(changedState));
  });

  it('changes when comment identity changes', () => {
    const baseState: CanonicalDiffableState = {
      body: { type: 'doc' },
      comments: [{ commentId: 'c1', textJson: { type: 'doc', content: [{ type: 'text', text: 'Same' }] } }],
      styles: null,
      numbering: null,
    };
    const changedState: CanonicalDiffableState = {
      body: { type: 'doc' },
      comments: [{ commentId: 'c2', textJson: { type: 'doc', content: [{ type: 'text', text: 'Same' }] } }],
      styles: null,
      numbering: null,
    };

    expect(computeFingerprint(baseState)).not.toBe(computeFingerprint(changedState));
  });
});
