// @ts-check
/**
 * Import diagnostics collector for inline token validation.
 *
 * Handlers push structured INVALID_INLINE_TOKEN records here during import.
 * The converter pipeline calls `startCollection()` before import and
 * `drainDiagnostics()` after to retrieve and clear collected records.
 *
 * @typedef {import('@superdoc/document-api').InlineTokenDiagnostic} InlineTokenDiagnostic
 */

/** @type {Map<number, InlineTokenDiagnostic[]>} */
const _buffers = new Map();

/** @type {number|null} */
let _defaultCollectionId = null;

let _nextCollectionId = 1;

/**
 * Start collecting diagnostics for a new import.
 * Returns a collection id that can be passed to `pushDiagnostic`/`drainDiagnostics`
 * to isolate concurrent imports.
 *
 * @param {number} [collectionId]
 * @returns {number}
 */
export function startCollection(collectionId) {
  const id = typeof collectionId === 'number' ? collectionId : _nextCollectionId++;
  _buffers.set(id, []);
  _defaultCollectionId = id;
  return id;
}

/**
 * Resolve a collection id, falling back to the most recent started collection.
 * @param {number} [collectionId]
 * @returns {number|null}
 */
function resolveCollectionId(collectionId) {
  if (typeof collectionId === 'number') return collectionId;
  return _defaultCollectionId;
}

/**
 * Push a diagnostic record into the collection buffer.
 * @param {InlineTokenDiagnostic} diagnostic
 * @param {number} [collectionId]
 */
export function pushDiagnostic(diagnostic, collectionId) {
  const id = resolveCollectionId(collectionId);
  if (id == null) return;

  const buffer = _buffers.get(id);
  if (!buffer) return;
  buffer.push(diagnostic);
}

/**
 * Drain and return all collected diagnostics, resetting the buffer.
 * @param {number} [collectionId]
 * @returns {InlineTokenDiagnostic[]}
 */
export function drainDiagnostics(collectionId) {
  const id = resolveCollectionId(collectionId);
  if (id == null) return [];

  const result = _buffers.get(id) ?? [];
  _buffers.delete(id);
  if (_defaultCollectionId === id) {
    _defaultCollectionId = null;
  }
  return result;
}

/**
 * Read (but don't drain) the current diagnostics. For testing.
 * @param {number} [collectionId]
 * @returns {ReadonlyArray<InlineTokenDiagnostic>}
 */
export function peekDiagnostics(collectionId) {
  const id = resolveCollectionId(collectionId);
  if (id == null) return [];
  return _buffers.get(id) ?? [];
}
