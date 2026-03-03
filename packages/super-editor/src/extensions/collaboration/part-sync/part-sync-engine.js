/**
 * Generic part-sync engine — publish, apply, hydrate for any PartSpec.
 *
 * All structured Y.Map collaboration channels (stylesModel, headerFooterModel,
 * ooxmlPartModels) flow through this engine. Part-specific behavior is
 * encapsulated in PartSpec callbacks; this module owns the shared mechanics:
 *
 * - Per-editor, per-spec remote-apply guards (WeakMap<Editor, Set<specId>>)
 * - Semantic equality filtering (JSON.stringify comparison)
 * - Structured clone on publish/apply to sever Y.js object references
 * - Y.Map transact wrappers
 * - Metadata tracking in ooxmlPartMeta
 *
 * @module part-sync-engine
 */

import { EXCLUDED_PART_PATHS } from './part-spec-registry.js';

// ---------------------------------------------------------------------------
// Per-editor guard state
// ---------------------------------------------------------------------------

/**
 * Tracks which specs are currently applying remote data, per editor.
 * Prevents publish → apply → re-publish feedback loops.
 *
 * @type {WeakMap<object, Set<string>>}
 */
const applyingRemoteParts = new WeakMap();

/**
 * Check whether a remote apply is in progress for a given spec on an editor.
 *
 * @param {object} editor
 * @param {string} specId
 * @returns {boolean}
 */
export function isApplyingRemotePart(editor, specId) {
  return applyingRemoteParts.get(editor)?.has(specId) === true;
}

function setApplyGuard(editor, specId) {
  let set = applyingRemoteParts.get(editor);
  if (!set) {
    set = new Set();
    applyingRemoteParts.set(editor, set);
  }
  set.add(specId);
}

function clearApplyGuard(editor, specId) {
  applyingRemoteParts.get(editor)?.delete(specId);
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/**
 * Semantic equality check via JSON serialization.
 * Sufficient for OOXML model objects (plain JSON, no cycles, no functions).
 */
export function semanticEquals(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Publish: converter → Y.Map
// ---------------------------------------------------------------------------

/**
 * Publish sections from the local converter to the spec's Y.Map channel.
 *
 * Reads each section via `spec.readSection`, compares against the Y.Map
 * entry, and writes only changed sections. Values are structuredClone'd to
 * prevent Y.js alias bugs (where mutating the live model would silently
 * alias the map entry).
 *
 * @param {object} editor
 * @param {import('./part-spec-registry.js').PartSpec} spec
 * @param {string[]} [sectionHints] — Optional subset of sections to publish.
 *   If omitted, publishes all sections returned by `spec.listSections`.
 */
export function publishPartSections(editor, spec, sectionHints) {
  if (EXCLUDED_PART_PATHS.has(spec.partPath)) return;
  if (isApplyingRemotePart(editor, spec.id)) return;
  if (!editor || editor.isDestroyed) return;

  const ydoc = editor.options?.ydoc;
  if (!ydoc || ydoc.isDestroyed) return;
  if (!editor.converter) return;

  const map = ydoc.getMap(spec.channel);
  const sections = sectionHints ?? spec.listSections(editor.converter);
  const localKeySet = new Set(sections.map((s) => spec.sectionKey(s)));

  const writes = [];
  for (const section of sections) {
    const key = spec.sectionKey(section);
    const value = spec.readSection(editor.converter, section);
    const existing = map.get(key);
    if (semanticEquals(value, existing)) continue;
    writes.push({ key, value, section });
  }

  // Detect keys in the Y.Map that belong to this spec but no longer exist
  // locally. Only do this for full publishes (no sectionHints) to avoid
  // accidentally deleting keys during targeted partial publishes.
  const deletes = [];
  if (sectionHints == null && typeof map.forEach === 'function') {
    map.forEach((_value, key) => {
      if (key === '_version') return;
      if (spec.parseKey(key) != null && !localKeySet.has(key)) {
        deletes.push(key);
      }
    });
  }

  if (writes.length === 0 && deletes.length === 0) return;

  const userId = editor.options.user?.id ?? 'unknown';
  const metaMap = ydoc.getMap('ooxmlPartMeta');

  ydoc.transact(
    () => {
      for (const { key, value } of writes) {
        map.set(key, structuredClone(value));
      }
      for (const key of deletes) {
        map.delete(key);
      }
      if (spec.version != null && !map.has('_version')) {
        map.set('_version', spec.version);
      }
      for (const { key } of writes) {
        metaMap.set(key, { updatedBy: userId, updatedAt: Date.now() });
      }
    },
    { event: `${spec.id}-publish`, user: editor.options.user },
  );
}

// ---------------------------------------------------------------------------
// Apply: Y.Map → converter
// ---------------------------------------------------------------------------

/**
 * Apply remote section changes from a Y.Map to the local converter.
 *
 * For each changed key: validates via `spec.validateSection`, skips semantic
 * no-ops, applies via `spec.applySection` (with structuredClone), then calls
 * `spec.afterApply` and emits `xmlPartChanged`.
 *
 * @param {object} editor
 * @param {import('./part-spec-registry.js').PartSpec} spec
 * @param {object} map — The Y.Map instance for the spec's channel
 * @param {string[]} changedKeys — Y.Map keys that changed (from observer)
 */
export function applyRemotePartSections(editor, spec, map, changedKeys) {
  if (EXCLUDED_PART_PATHS.has(spec.partPath)) return;
  if (!editor || editor.isDestroyed || !editor.converter) return;

  setApplyGuard(editor, spec.id);

  try {
    const appliedSections = [];

    for (const key of changedKeys) {
      const section = spec.parseKey(key);
      if (section == null) continue;

      const remoteValue = map.get(key);
      if (!spec.validateSection(section, remoteValue)) {
        console.warn(`[part-sync] Rejected invalid remote section: ${spec.id}/${section}`);
        continue;
      }

      const localValue = spec.readSection(editor.converter, section);
      if (semanticEquals(localValue, remoteValue)) continue;

      spec.applySection(editor.converter, section, structuredClone(remoteValue));
      appliedSections.push(section);
    }

    if (appliedSections.length === 0) return;

    spec.afterApply?.(editor, appliedSections);

    editor.emit('partChanged', {
      partId: spec.id,
      changedPaths: appliedSections,
      source: 'yjs.remote',
    });
  } finally {
    // Clear guard on next macrotask so synchronous listeners triggered by
    // emit/afterApply still see the guard as active (prevents re-publish).
    setTimeout(() => clearApplyGuard(editor, spec.id), 0);
  }
}

// ---------------------------------------------------------------------------
// Delete: Y.Map deletion → converter removal
// ---------------------------------------------------------------------------

/**
 * Remove sections from the local converter that were deleted remotely.
 *
 * @param {object} editor
 * @param {import('./part-spec-registry.js').PartSpec} spec
 * @param {string[]} deletedKeys — Y.Map keys that were deleted
 */
export function deleteRemotePartSections(editor, spec, deletedKeys) {
  if (!editor || editor.isDestroyed || !editor.converter) return;
  if (!spec.removeSection) return;

  setApplyGuard(editor, spec.id);

  try {
    const removedSections = [];

    for (const key of deletedKeys) {
      const section = spec.parseKey(key);
      if (section == null) continue;

      spec.removeSection(editor.converter, section);
      removedSections.push(section);
    }

    if (removedSections.length === 0) return;

    spec.afterApply?.(editor, removedSections);

    editor.emit('partChanged', {
      partId: spec.id,
      changedPaths: removedSections,
      source: 'yjs.remote.delete',
    });
  } finally {
    setTimeout(() => clearApplyGuard(editor, spec.id), 0);
  }
}

// ---------------------------------------------------------------------------
// Hydrate / Seed
// ---------------------------------------------------------------------------

/**
 * Hydrate from or seed the Y.Map channel for a spec after provider sync.
 *
 * - If the map has a version sentinel: room already has data → apply it
 *   as the authority over local converter state.
 * - If the map has no sentinel: this is the first client → seed from converter.
 *
 * @param {object} editor
 * @param {import('./part-spec-registry.js').PartSpec} spec
 */
export function hydrateOrSeedPart(editor, spec) {
  if (EXCLUDED_PART_PATHS.has(spec.partPath)) return;
  if (!editor || editor.isDestroyed) return;

  const ydoc = editor.options?.ydoc;
  if (!ydoc || ydoc.isDestroyed) return;

  const map = ydoc.getMap(spec.channel);

  if (map.has('_version')) {
    // Room has this channel — hydrate from remote authority.
    // Scan the Y.Map for keys belonging to this spec rather than relying on
    // local converter state. Late joiners may not have parts that were created
    // by other collaborators after bootstrap (e.g. comments, footnotes, rels).
    const keys = [];
    if (typeof map.forEach === 'function') {
      map.forEach((_value, key) => {
        if (spec.parseKey(key) != null) {
          keys.push(key);
        }
      });
    }

    if (keys.length > 0) {
      applyRemotePartSections(editor, spec, map, keys);
    }

    // Remove local sections that no longer exist remotely. This handles parts
    // deleted in-room before this client joined — the Y.Map has _version but
    // no remaining keys for this spec, yet bootstrap left stale local data.
    if (editor.converter && spec.removeSection) {
      const localSections = spec.listSections(editor.converter);
      const remoteSet = new Set(keys.map((k) => spec.parseKey(k)));
      const staleKeys = localSections.filter((s) => !remoteSet.has(s)).map((s) => spec.sectionKey(s));
      if (staleKeys.length > 0) {
        deleteRemotePartSections(editor, spec, staleKeys);
      }
    }
  } else if (editor.converter) {
    // Room doesn't have this channel — seed from local converter
    publishPartSections(editor, spec);
  }
}

// ---------------------------------------------------------------------------
// Observer helpers
// ---------------------------------------------------------------------------

/**
 * Create a Y.Map observer that routes changes to applyRemotePartSections
 * for the given spec. Only processes non-local, non-version-sentinel keys.
 *
 * @param {object} editor
 * @param {import('./part-spec-registry.js').PartSpec} spec
 * @returns {(event: object) => void}
 */
export function createSpecObserver(editor, spec) {
  return (event) => {
    if (event.transaction.local) return;

    const changedKeys = [];
    const deletedKeys = [];
    event.changes.keys.forEach((change, key) => {
      if (key === '_version') return;
      if (change.action === 'add' || change.action === 'update') {
        changedKeys.push(key);
      } else if (change.action === 'delete') {
        deletedKeys.push(key);
      }
    });

    const map = editor.options.ydoc?.getMap(spec.channel);
    if (!map) return;

    if (changedKeys.length > 0) {
      applyRemotePartSections(editor, spec, map, changedKeys);
    }
    if (deletedKeys.length > 0) {
      deleteRemotePartSections(editor, spec, deletedKeys);
    }
  };
}
