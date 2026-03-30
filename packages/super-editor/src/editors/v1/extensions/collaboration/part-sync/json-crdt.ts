/**
 * JSON ↔ Yjs encode/decode for part CRDT storage.
 *
 * v1 semantics: full-part replace. The OOXML JSON tree is recursively encoded
 * into Yjs types (Y.Map / Y.Array / scalar) for the `data` field of the
 * envelope. The envelope scalars (v, clientId) are written directly.
 *
 * `decodeYjsToJson` converts the Yjs structures back to plain JSON for
 * local consumption by the mutation core.
 */

import * as Y from 'yjs';
import type { PartEnvelope } from './types.js';

// ---------------------------------------------------------------------------
// Encode: JSON → Yjs
// ---------------------------------------------------------------------------

/** Recursively encode a JSON value into a Yjs-compatible structure. */
function encodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    const yArray = new Y.Array();
    const encoded = value.map(encodeValue);
    yArray.push(encoded);
    return yArray;
  }

  if (typeof value === 'object') {
    const yMap = new Y.Map();
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      yMap.set(k, encodeValue(v));
    }
    return yMap;
  }

  // Scalar: string | number | boolean
  return value;
}

/**
 * Encode a `PartEnvelope` into a Y.Map suitable for setting in the `parts` map.
 *
 * Layout: `Y.Map { v: number, clientId: number, data: <recursively encoded> }`
 */
export function encodeEnvelopeToYjs(envelope: PartEnvelope): Y.Map<unknown> {
  const yMap = new Y.Map<unknown>();
  yMap.set('v', envelope.v);
  yMap.set('clientId', envelope.clientId);
  yMap.set('data', encodeValue(envelope.data));
  return yMap;
}

// ---------------------------------------------------------------------------
// Decode: Yjs → JSON
// ---------------------------------------------------------------------------

/** Recursively decode a Yjs value back to plain JSON. */
function decodeValue(value: unknown): unknown {
  if (value instanceof Y.Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) {
      obj[k] = decodeValue(v);
    }
    return obj;
  }

  if (value instanceof Y.Array) {
    return value.toArray().map(decodeValue);
  }

  // Scalar passthrough (string, number, boolean, null, undefined)
  return value;
}

/**
 * Decode a Y.Map from the `parts` map back into a `PartEnvelope`.
 *
 * Returns `null` if the structure is missing required fields.
 */
export function decodeYjsToEnvelope(yMap: Y.Map<unknown>): PartEnvelope | null {
  const v = yMap.get('v');
  const clientId = yMap.get('clientId');
  const rawData = yMap.get('data');

  if (typeof v !== 'number' || typeof clientId !== 'number') return null;

  return {
    v,
    clientId,
    data: decodeValue(rawData),
  };
}

/**
 * Read the current version from a Yjs parts map entry without full decode.
 * Returns 0 if the entry doesn't exist or lacks a version.
 */
export function readEnvelopeVersion(partsMap: Y.Map<unknown>, partId: string): number {
  const entry = partsMap.get(partId);
  if (entry instanceof Y.Map) {
    const v = entry.get('v');
    return typeof v === 'number' ? v : 0;
  }
  return 0;
}
