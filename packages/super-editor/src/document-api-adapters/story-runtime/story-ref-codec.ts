/**
 * V4 ref codec — encodes and decodes versioned text refs.
 *
 * Text refs are opaque handles that identify a resolved position or range
 * within a specific story. They embed the story key, revision, scope, and
 * segment data needed for mutation targeting.
 *
 * ## Wire formats
 *
 * | Version | Prefix           | Payload shape       |
 * |---------|------------------|---------------------|
 * | V3      | `text:`          | `{ v: 3, ... }`     |
 * | V4      | `text:v4:`       | `{ v: 4, ... }`     |
 *
 * The `text:v4:` prefix allows V4 refs to be distinguished from V3 refs
 * without parsing the JSON payload, enabling fast version checks.
 *
 * ## Backward compatibility
 *
 * V3 refs are decoded with an implicit `storyKey: 'body'` since V3 did
 * not support multi-story addressing — all V3 refs are body-scoped.
 */

// ---------------------------------------------------------------------------
// Ref prefixes
// ---------------------------------------------------------------------------

const V3_PREFIX = 'text:';
const V4_PREFIX = 'text:v4:';

// ---------------------------------------------------------------------------
// V3 payload type (for decode compatibility)
// ---------------------------------------------------------------------------

/** V3 ref payload — body-scoped, no story key. */
export interface StoryRefV3 {
  v: 3;
  rev: string;
  matchId: string;
  scope: 'match' | 'block' | 'run';
  segments: Array<{ blockId: string; start: number; end: number }>;
  blockIndex?: number;
  runIndex?: number;
}

// ---------------------------------------------------------------------------
// V4 payload type
// ---------------------------------------------------------------------------

/** Node descriptor embedded in a V4 ref for node-scoped targeting. */
export interface StoryRefV4Node {
  kind: 'block' | 'inline';
  nodeType: string;
  nodeId?: string;
}

/** V4 ref payload — story-aware, supports all story types. */
export interface StoryRefV4 {
  v: 4;
  rev: string;
  storyKey: string;
  scope: 'match' | 'block' | 'run' | 'node';
  matchId?: string;
  segments?: Array<{ blockId: string; start: number; end: number }>;
  node?: StoryRefV4Node;
  blockIndex?: number;
  runIndex?: number;
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Encodes a V4 ref payload into its wire format.
 *
 * The output is a string with the `text:v4:` prefix followed by a
 * base64-encoded JSON payload.
 *
 * @param payload - The V4 ref data to encode.
 * @returns The encoded ref string.
 *
 * @example
 * ```ts
 * const ref = encodeV4Ref({
 *   v: 4,
 *   rev: '7',
 *   storyKey: 'fn:12',
 *   scope: 'match',
 *   segments: [{ blockId: 'p1', start: 0, end: 5 }],
 * });
 * // => 'text:v4:eyJ2Ijo0LCJyZXYiOi...'
 * ```
 */
export function encodeV4Ref(payload: StoryRefV4): string {
  return `${V4_PREFIX}${btoa(JSON.stringify(payload))}`;
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/**
 * Decodes a text ref string into its typed payload.
 *
 * Supports both V3 and V4 formats:
 * - V4 refs (`text:v4:...`) are decoded directly.
 * - V3 refs (`text:...`) are decoded with `storyKey: 'body'` implied.
 *
 * Returns `null` for malformed refs, non-text refs, or unknown versions.
 *
 * @param ref - The encoded ref string.
 * @returns The decoded payload, or `null` if the ref is invalid.
 *
 * @example
 * ```ts
 * const v4 = decodeRef('text:v4:eyJ2Ijo0Li4ufQ==');
 * // => { v: 4, storyKey: 'fn:12', ... }
 *
 * const v3 = decodeRef('text:eyJ2IjozLi4ufQ==');
 * // => { v: 3, matchId: '...', ... }
 * ```
 */
export function decodeRef(ref: string): StoryRefV3 | StoryRefV4 | null {
  // V4 refs have the longer prefix — check first to avoid false V3 match.
  if (ref.startsWith(V4_PREFIX)) {
    return decodeV4(ref.slice(V4_PREFIX.length));
  }

  // V3 refs use the shorter `text:` prefix.
  if (ref.startsWith(V3_PREFIX)) {
    return decodeV3(ref.slice(V3_PREFIX.length));
  }

  return null;
}

/**
 * Returns `true` if the ref string uses the V4 wire format.
 *
 * This is a prefix check only — it does NOT validate the payload.
 *
 * @param ref - The ref string to test.
 */
export function isV4Ref(ref: string): boolean {
  return ref.startsWith(V4_PREFIX);
}

// ---------------------------------------------------------------------------
// Internal decoders
// ---------------------------------------------------------------------------

function decodeV4(encoded: string): StoryRefV4 | null {
  try {
    const payload: unknown = JSON.parse(atob(encoded));
    if (!isPlainObject(payload)) return null;
    if (payload.v !== 4) return null;
    return payload as unknown as StoryRefV4;
  } catch {
    return null;
  }
}

function decodeV3(encoded: string): StoryRefV3 | null {
  try {
    const payload: unknown = JSON.parse(atob(encoded));
    if (!isPlainObject(payload)) return null;

    // V3 payloads have `v: 3`; older refs without a version field are
    // treated as V3 for backward compatibility.
    if (payload.v !== undefined && payload.v !== 3) return null;

    return payload as unknown as StoryRefV3;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
