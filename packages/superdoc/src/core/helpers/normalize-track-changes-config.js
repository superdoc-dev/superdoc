// @ts-check

/**
 * @typedef {'review' | 'original' | 'final' | 'off'} TrackChangesMode
 * @typedef {'paired' | 'independent'} TrackChangesReplacements
 * @typedef {{ enabled?: boolean, overrides?: Record<string, string>, resolve?: (author: { name?: string, email?: string, image?: string }) => (string | undefined) }} AuthorColorsConfig
 * @typedef {{ visible: boolean, mode: TrackChangesMode, enabled: boolean, replacements: TrackChangesReplacements, authorColors?: AuthorColorsConfig }} NormalizedTrackChangesConfig
 */

/** @type {ReadonlyArray<TrackChangesMode>} */
const ALLOWED_MODES = ['review', 'original', 'final', 'off'];

/** @type {ReadonlyArray<TrackChangesReplacements>} */
const ALLOWED_REPLACEMENTS = ['paired', 'independent'];

// Marks a config object we've already normalized so a second pass with the same
// object (e.g. a consumer reusing the config to mount another SuperDoc) doesn't
// warn on the legacy keys we wrote back during the first pass.
const NORMALIZED_MARKER = Symbol.for('@superdoc/trackChanges:normalized');

/** @type {Set<string>} */
const warnedKeys = new Set();

/**
 * @param {string} legacyPath
 * @param {string} newPath
 */
function warnOnce(legacyPath, newPath) {
  if (warnedKeys.has(legacyPath)) return;
  warnedKeys.add(legacyPath);
  console.warn(`[SuperDoc] ${legacyPath} is deprecated — use ${newPath} instead.`);
}

/**
 * @param {unknown} newVal
 * @param {unknown} legacyVal
 * @param {boolean} fallback
 * @returns {boolean}
 */
function resolveBool(newVal, legacyVal, fallback) {
  if (typeof newVal === 'boolean') return newVal;
  if (typeof legacyVal === 'boolean') return legacyVal;
  return fallback;
}

/**
 * @param {unknown} newVal
 * @param {unknown} legacyVal
 * @param {TrackChangesMode} fallback
 * @returns {TrackChangesMode}
 */
function resolveMode(newVal, legacyVal, fallback) {
  if (typeof newVal === 'string' && ALLOWED_MODES.includes(/** @type {TrackChangesMode} */ (newVal))) {
    return /** @type {TrackChangesMode} */ (newVal);
  }
  if (typeof legacyVal === 'string' && ALLOWED_MODES.includes(/** @type {TrackChangesMode} */ (legacyVal))) {
    return /** @type {TrackChangesMode} */ (legacyVal);
  }
  return fallback;
}

/**
 * @param {unknown} value
 * @returns {TrackChangesReplacements | null}
 */
function coerceReplacements(value) {
  if (typeof value === 'string' && ALLOWED_REPLACEMENTS.includes(/** @type {TrackChangesReplacements} */ (value))) {
    return /** @type {TrackChangesReplacements} */ (value);
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function pickObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * Resolves track-changes configuration from the new canonical path
 * (`config.modules.trackChanges`) and the two legacy paths
 * (`config.trackChanges` for visibility, `config.layoutEngineOptions.trackedChanges`
 * for mode/enabled), then mirrors the merged result back to all three
 * paths so internal consumers that still read legacy keys keep working.
 *
 * Precedence per field: canonical > legacy > derived default.
 *
 * Emits a one-time deprecation warning per legacy key path that was
 * populated by the caller. Suppresses warnings on a second pass over the
 * same config object so write-through values don't look like new legacy
 * usage.
 *
 * @param {Record<string, any>} config  The SuperDoc config object (mutated in place)
 * @returns {NormalizedTrackChangesConfig}
 */
export function normalizeTrackChangesConfig(config) {
  const alreadyNormalized = /** @type {Record<symbol, unknown>} */ (config)[NORMALIZED_MARKER] === true;

  if (!pickObject(config.modules)) {
    config.modules = {};
  }

  const fromCanonical = pickObject(config.modules.trackChanges);
  const fromLegacyVisible = pickObject(config.trackChanges);
  const fromLegacyLayout = pickObject(config.layoutEngineOptions?.trackedChanges);

  if (!alreadyNormalized) {
    if (fromLegacyVisible) {
      warnOnce('config.trackChanges', 'config.modules.trackChanges');
    }
    if (fromLegacyLayout) {
      warnOnce('config.layoutEngineOptions.trackedChanges', 'config.modules.trackChanges');
    }
  }

  const visible = resolveBool(fromCanonical?.visible, fromLegacyVisible?.visible, false);

  const enabled = resolveBool(fromCanonical?.enabled, fromLegacyLayout?.enabled, true);

  // Replacement behavior is only surfaced on the canonical path. The legacy
  // buckets never exposed this knob, so there's no alias to resolve.
  const replacements = coerceReplacements(fromCanonical?.replacements) ?? 'paired';

  // Per-author colors live only on the canonical path. Preserve the object by
  // reference (it may carry a `resolve` function) rather than cloning, so the
  // composed resolver SuperDoc builds keeps the host's callback intact.
  const authorColors = pickObject(fromCanonical?.authorColors)
    ? /** @type {AuthorColorsConfig} */ (/** @type {Record<string, unknown>} */ (fromCanonical).authorColors)
    : undefined;

  // Default mode derives from documentMode + visibility so a viewing-mode
  // document without an explicit mode falls back to 'original' unless the
  // consumer asked for tracked changes to be visible.
  const isViewingMode = config.documentMode === 'viewing';
  /** @type {TrackChangesMode} */
  const defaultMode = isViewingMode ? (visible ? 'review' : 'original') : 'review';
  const mode = resolveMode(fromCanonical?.mode, fromLegacyLayout?.mode, defaultMode);

  /** @type {NormalizedTrackChangesConfig} */
  const normalized = { visible, mode, enabled, replacements };
  if (authorColors) {
    normalized.authorColors = authorColors;
  }

  // Write-through to every path so all existing internal reads see the same
  // resolved values without needing to migrate each call site in this pass.
  config.modules.trackChanges = normalized;
  config.trackChanges = { visible };
  if (!pickObject(config.layoutEngineOptions)) {
    config.layoutEngineOptions = {};
  }
  config.layoutEngineOptions.trackedChanges = { mode, enabled };

  Object.defineProperty(config, NORMALIZED_MARKER, {
    value: true,
    writable: true,
    configurable: true,
    enumerable: false,
  });

  return normalized;
}

/**
 * Test-only hook: clears the deduplicated deprecation-warning set so
 * tests can assert the warning fires on the first invocation.
 */
export function __resetDeprecationWarnings() {
  warnedKeys.clear();
}
