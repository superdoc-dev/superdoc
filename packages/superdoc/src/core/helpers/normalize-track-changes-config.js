// @ts-check

/**
 * @typedef {'review' | 'original' | 'final' | 'off'} TrackChangesMode
 * @typedef {{ visible: boolean, mode: TrackChangesMode, enabled: boolean }} NormalizedTrackChangesConfig
 */

const ALLOWED_MODES = /** @type {const} */ (['review', 'original', 'final', 'off']);

// Marks a config object we've already normalized so a second pass with the same
// object (e.g. a consumer reusing the config to mount another SuperDoc) doesn't
// warn on the legacy keys we wrote back during the first pass.
const NORMALIZED_MARKER = Symbol.for('@superdoc/trackChanges:normalized');

const warnedKeys = new Set();

function warnOnce(legacyPath, newPath) {
  if (warnedKeys.has(legacyPath)) return;
  warnedKeys.add(legacyPath);
  console.warn(`[SuperDoc] ${legacyPath} is deprecated — use ${newPath} instead.`);
}

function resolveBool(newVal, legacyVal, fallback) {
  if (typeof newVal === 'boolean') return newVal;
  if (typeof legacyVal === 'boolean') return legacyVal;
  return fallback;
}

function resolveMode(newVal, legacyVal, fallback) {
  if (ALLOWED_MODES.includes(newVal)) return newVal;
  if (ALLOWED_MODES.includes(legacyVal)) return legacyVal;
  return fallback;
}

function pickObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
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
 * @param {object} config  The SuperDoc config object (mutated in place)
 * @returns {NormalizedTrackChangesConfig}
 */
export function normalizeTrackChangesConfig(config) {
  const alreadyNormalized = config[NORMALIZED_MARKER] === true;

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

  // Default mode derives from documentMode + visibility so a viewing-mode
  // document without an explicit mode falls back to 'original' unless the
  // consumer asked for tracked changes to be visible.
  const isViewingMode = config.documentMode === 'viewing';
  const defaultMode = isViewingMode ? (visible ? 'review' : 'original') : 'review';
  const mode = resolveMode(fromCanonical?.mode, fromLegacyLayout?.mode, defaultMode);

  /** @type {NormalizedTrackChangesConfig} */
  const normalized = { visible, mode, enabled };

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
