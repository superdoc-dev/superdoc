import { describe, it, expect } from 'vitest';
import { encodeV4Ref, decodeRef, isV4Ref, type StoryRefV4, type StoryRefV3 } from './story-ref-codec.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const v4Payload: StoryRefV4 = {
  v: 4,
  rev: '7',
  storyKey: 'fn:12',
  scope: 'match',
  matchId: 'm1',
  segments: [{ blockId: 'p1', start: 0, end: 5 }],
};

const v3Payload: StoryRefV3 = {
  v: 3,
  rev: '3',
  matchId: 'm2',
  scope: 'block',
  segments: [{ blockId: 'p2', start: 10, end: 20 }],
};

/** Manually construct a V3 ref in wire format. */
function makeV3Ref(payload: StoryRefV3): string {
  return `text:${btoa(JSON.stringify(payload))}`;
}

// ---------------------------------------------------------------------------
// encodeV4Ref
// ---------------------------------------------------------------------------

describe('encodeV4Ref', () => {
  it('produces a string starting with "text:v4:"', () => {
    const ref = encodeV4Ref(v4Payload);
    expect(ref.startsWith('text:v4:')).toBe(true);
  });

  it('produces a decodable base64 payload after the prefix', () => {
    const ref = encodeV4Ref(v4Payload);
    const base64Part = ref.slice('text:v4:'.length);
    const decoded = JSON.parse(atob(base64Part));
    expect(decoded).toEqual(v4Payload);
  });
});

// ---------------------------------------------------------------------------
// decodeRef — V4
// ---------------------------------------------------------------------------

describe('decodeRef (V4)', () => {
  it('decodes a V4 ref and returns the full payload', () => {
    const ref = encodeV4Ref(v4Payload);
    const decoded = decodeRef(ref);
    expect(decoded).toEqual(v4Payload);
  });

  it('returns the correct version field', () => {
    const ref = encodeV4Ref(v4Payload);
    const decoded = decodeRef(ref);
    expect(decoded?.v).toBe(4);
  });

  it('returns null for a V4 ref with invalid base64', () => {
    expect(decodeRef('text:v4:!!!not-base64!!!')).toBeNull();
  });

  it('returns null for a V4 ref whose payload has wrong version', () => {
    const bad = `text:v4:${btoa(JSON.stringify({ v: 99 }))}`;
    expect(decodeRef(bad)).toBeNull();
  });

  it('returns null for a V4 ref whose payload is an array', () => {
    const bad = `text:v4:${btoa(JSON.stringify([1, 2, 3]))}`;
    expect(decodeRef(bad)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeRef — V3 (backward compatibility)
// ---------------------------------------------------------------------------

describe('decodeRef (V3)', () => {
  it('decodes a V3 ref with v: 3', () => {
    const ref = makeV3Ref(v3Payload);
    const decoded = decodeRef(ref);
    expect(decoded).toEqual(v3Payload);
  });

  it('decodes a V3 ref without a version field (legacy)', () => {
    const legacyPayload = {
      rev: '1',
      matchId: 'legacy',
      scope: 'match',
      segments: [{ blockId: 'p0', start: 0, end: 1 }],
    };
    const ref = `text:${btoa(JSON.stringify(legacyPayload))}`;
    const decoded = decodeRef(ref);
    expect(decoded).toBeTruthy();
    expect(decoded!.rev).toBe('1');
  });

  it('returns null for a V3 ref whose version is not 3', () => {
    const bad = `text:${btoa(JSON.stringify({ v: 5, rev: '1', matchId: 'x', scope: 'match', segments: [] }))}`;
    expect(decodeRef(bad)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeRef — invalid inputs
// ---------------------------------------------------------------------------

describe('decodeRef (invalid)', () => {
  it('returns null for empty string', () => {
    expect(decodeRef('')).toBeNull();
  });

  it('returns null for a non-text ref', () => {
    expect(decodeRef('image:abc123')).toBeNull();
  });

  it('returns null for random string', () => {
    expect(decodeRef('hello world')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isV4Ref
// ---------------------------------------------------------------------------

describe('isV4Ref', () => {
  it('returns true for a V4 ref', () => {
    const ref = encodeV4Ref(v4Payload);
    expect(isV4Ref(ref)).toBe(true);
  });

  it('returns false for a V3 ref', () => {
    const ref = makeV3Ref(v3Payload);
    expect(isV4Ref(ref)).toBe(false);
  });

  it('returns false for arbitrary strings', () => {
    expect(isV4Ref('')).toBe(false);
    expect(isV4Ref('text:')).toBe(false);
    expect(isV4Ref('image:v4:abc')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('round-trip: encode → decode', () => {
  it('produces the original V4 payload', () => {
    const encoded = encodeV4Ref(v4Payload);
    const decoded = decodeRef(encoded);
    expect(decoded).toEqual(v4Payload);
  });

  it('works with a node-scoped V4 payload', () => {
    const payload: StoryRefV4 = {
      v: 4,
      rev: '10',
      storyKey: 'body',
      scope: 'node',
      node: { kind: 'block', nodeType: 'paragraph', nodeId: 'p5' },
    };
    const encoded = encodeV4Ref(payload);
    const decoded = decodeRef(encoded);
    expect(decoded).toEqual(payload);
  });

  it('works with minimal V4 payload', () => {
    const payload: StoryRefV4 = {
      v: 4,
      rev: '1',
      storyKey: 'en:99',
      scope: 'run',
    };
    const encoded = encodeV4Ref(payload);
    const decoded = decodeRef(encoded);
    expect(decoded).toEqual(payload);
  });
});
