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

describe('buildCanonicalDiffableState fingerprint stability', () => {
  // SD-3279: two SuperDoc editor instances loaded from the same DOCX assign
  // different session-local sdBlockId UUIDs. Including those in the body
  // fingerprint makes diff.apply across instances throw PRECONDITION_FAILED.
  // The fingerprint must be stable against sdBlockId / sdBlockRev divergence.
  it('produces the same fingerprint for body trees that differ only in identity attrs (sdBlockId / sdBlockRev)', async () => {
    const { buildCanonicalDiffableState } = await import('./canonicalize');
    const { Schema } = await import('prosemirror-model');

    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          group: 'block',
          content: 'text*',
          attrs: { sdBlockId: { default: null }, sdBlockRev: { default: null }, align: { default: 'left' } },
        },
        text: { group: 'inline' },
      },
    });

    const makeDoc = (uuid: string, rev: number) =>
      schema.nodes.doc.create(null, [
        schema.nodes.paragraph.create({ sdBlockId: uuid, sdBlockRev: rev, align: 'left' }, schema.text('Hello')),
      ]);

    const stateA = buildCanonicalDiffableState(makeDoc('uuid-A', 1), [], null, null, null, null);
    const stateB = buildCanonicalDiffableState(makeDoc('uuid-B', 99), [], null, null, null, null);

    expect(computeFingerprint(stateA)).toBe(computeFingerprint(stateB));
  });

  // SD-3279 backward compatibility: the new and legacy normalizers must
  // produce different fingerprints for a doc with sdBlockId on the body.
  // The validation fallback relies on this to detect "this snapshot was
  // captured under the old algorithm" — if the two were identical, the
  // fallback path would be dead code.
  it('legacy normalizer produces a different fingerprint than the current normalizer when sdBlockId is present', async () => {
    const { buildCanonicalDiffableState, buildLegacyCanonicalDiffableState } = await import('./canonicalize');
    const { Schema } = await import('prosemirror-model');

    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          group: 'block',
          content: 'text*',
          attrs: { sdBlockId: { default: null }, align: { default: 'left' } },
        },
        text: { group: 'inline' },
      },
    });

    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create({ sdBlockId: 'session-uuid', align: 'left' }, schema.text('Hello')),
    ]);

    const current = computeFingerprint(buildCanonicalDiffableState(doc, [], null, null, null, null));
    const legacy = computeFingerprint(buildLegacyCanonicalDiffableState(doc, [], null, null, null, null));

    expect(current).not.toBe(legacy);
  });
});
