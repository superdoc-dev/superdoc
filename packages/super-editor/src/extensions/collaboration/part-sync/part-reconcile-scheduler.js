/**
 * Part reconcile scheduler — debounced full-export reconciliation.
 *
 * Replaces the legacy updateYdocDocxData debounce with a structured approach:
 * on fire, calls `editor.exportDocx({ getUpdatedDocs: true })` to ensure
 * convertedXml is current, then publishes all registered specs through the
 * part-sync engine.
 *
 * Timing: 30s debounce / 60s maxWait (matches legacy behavior).
 *
 * The reconcile is a safety net — targeted publishes (e.g., stylesChanged →
 * publishPartSections for styles) handle most real-time sync. The reconcile
 * catches anything that slipped through (numbering changes, comment edits,
 * relationship updates, etc.).
 *
 * @module part-reconcile-scheduler
 */

import { publishPartSections } from './part-sync-engine.js';
import { getOoxmlPartSpecs, invalidateDiscoveredSpecs } from './part-spec-registry.js';

const DEBOUNCE_MS = 30_000;
const MAX_WAIT_MS = 60_000;
const CONTENT_TYPES_PART_PATH = '[Content_Types].xml';

// ---------------------------------------------------------------------------
// Per-editor state
// ---------------------------------------------------------------------------

/** @type {WeakMap<object, { debounceTimer: ReturnType<typeof setTimeout> | null, maxWaitTimer: ReturnType<typeof setTimeout> | null, dirtyCounter: number, lastReconciledAt: number }>} */
const stateByEditor = new WeakMap();

function getOrCreateState(editor) {
  let state = stateByEditor.get(editor);
  if (!state) {
    state = { debounceTimer: null, maxWaitTimer: null, dirtyCounter: 0, lastReconciledAt: 0 };
    stateByEditor.set(editor, state);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Reconcile logic
// ---------------------------------------------------------------------------

/**
 * Keep converter.convertedXml['[Content_Types].xml'] in sync with the export
 * output so CONTENT_TYPES_SPEC can publish structured model data.
 *
 * @param {object} editor
 * @param {unknown} updatedDocs
 */
function syncContentTypesIntoConverter(editor, updatedDocs) {
  if (!updatedDocs || typeof updatedDocs !== 'object') return;

  const contentTypesXml = updatedDocs[CONTENT_TYPES_PART_PATH];
  if (typeof contentTypesXml !== 'string' || contentTypesXml.length === 0) return;

  const converter = editor.converter;
  if (!converter || typeof converter.parseXmlToJson !== 'function') return;

  try {
    const parsed = converter.parseXmlToJson(contentTypesXml);
    if (!parsed?.elements?.[0]) return;

    if (!converter.convertedXml) converter.convertedXml = {};
    converter.convertedXml[CONTENT_TYPES_PART_PATH] = parsed;
    if (converter.parts) converter.parts[CONTENT_TYPES_PART_PATH] = parsed;
  } catch (error) {
    console.warn('[part-reconcile] Failed to parse [Content_Types].xml', error);
  }
}

async function executeReconcile(editor) {
  const state = stateByEditor.get(editor);
  if (state) {
    clearTimeout(state.debounceTimer);
    clearTimeout(state.maxWaitTimer);
    state.debounceTimer = null;
    state.maxWaitTimer = null;
  }

  if (!editor || editor.isDestroyed) return;

  const ydoc = editor.options?.ydoc;
  if (!ydoc || ydoc.isDestroyed) return;

  // Skip if nothing has been marked dirty since last reconcile
  if (state && state.dirtyCounter === state.lastReconciledAt) return;

  try {
    // Full export updates convertedXml for all parts as a side effect.
    // We discard the returned XML strings — we publish structured data, not strings.
    const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });
    syncContentTypesIntoConverter(editor, updatedDocs);

    if (editor.isDestroyed || ydoc.isDestroyed) return;

    // Export may have created new parts — invalidate discovered specs so
    // getOoxmlPartSpecs re-scans the converter's part store.
    invalidateDiscoveredSpecs(editor.converter);

    // Publish all ooxmlPartModels specs through the engine.
    // Each publish does semantic equality checking, so unchanged parts are skipped.
    const specs = getOoxmlPartSpecs(editor.converter);
    for (const spec of specs) {
      publishPartSections(editor, spec);
    }

    if (state) state.lastReconciledAt = state.dirtyCounter;
  } catch (error) {
    console.warn('[part-reconcile] Reconcile failed', error);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mark the editor as dirty so the next reconcile will run exportDocx.
 * Call this before scheduleReconcile to ensure the reconcile actually fires.
 *
 * @param {object} editor
 */
export function markDirty(editor) {
  if (!editor) return;
  const state = getOrCreateState(editor);
  state.dirtyCounter += 1;
}

/**
 * Schedule a debounced reconcile. Resets the 30s timer on each call.
 * A maxWait timer ensures at least one reconcile within 60s of the first call.
 *
 * @param {object} editor
 * @param {string} _reason — For logging/debugging (unused in production)
 */
export function scheduleReconcile(editor, _reason) {
  if (!editor || editor.isDestroyed) return;

  const ydoc = editor.options?.ydoc;
  if (!ydoc || ydoc.isDestroyed) return;

  const state = getOrCreateState(editor);

  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => executeReconcile(editor), DEBOUNCE_MS);

  if (state.maxWaitTimer == null) {
    state.maxWaitTimer = setTimeout(() => executeReconcile(editor), MAX_WAIT_MS);
  }
}

/**
 * Run a reconcile immediately, bypassing the debounce/maxWait timers.
 *
 * Use this after operations like `replaceFile` where structured channels must
 * be consistent before any other client can observe the new state.
 *
 * Automatically marks the editor dirty so the reconcile is not skipped.
 *
 * @param {object} editor
 * @returns {Promise<void>}
 */
export async function reconcileImmediately(editor) {
  markDirty(editor);
  await executeReconcile(editor);
}

/**
 * Clear all pending timers and per-editor state. Called on editor destroy.
 *
 * @param {object} editor
 */
export function destroyReconcileState(editor) {
  const state = stateByEditor.get(editor);
  if (!state) return;

  clearTimeout(state.debounceTimer);
  clearTimeout(state.maxWaitTimer);
  state.debounceTimer = null;
  state.maxWaitTimer = null;

  stateByEditor.delete(editor);
}
