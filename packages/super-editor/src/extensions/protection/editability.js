/**
 * Single enforcement owner for effective editability.
 *
 * Computes and applies the final editability state by reading:
 *   1. editor.storage.protection.state (protection enforcement)
 *   2. editor.storage.permissionRanges (allowed ranges for current user)
 *   3. editor.options.documentMode (consumer-set mode)
 *
 * Priority: protection enforcement > permission-range override > documentMode > consumer setEditable()
 *
 * Called after every event that could change the effective state:
 *   - setDocumentMode()
 *   - setEditingRestriction / clearEditingRestriction
 *   - permission-ranges plugin apply()
 *   - partChanged for word/settings.xml (remote sync)
 */

/**
 * Shape of editor.storage.protection, used for typed access across modules.
 * @typedef {{
 *   state: import('@superdoc/document-api').DocumentProtectionState;
 *   initialized: boolean;
 *   editableBaseline: boolean | null;
 * }} ProtectionStorage
 */

/**
 * Cast editor.storage.protection to its typed shape.
 * @param {import('../../core/Editor.js').Editor} editor
 * @returns {ProtectionStorage | undefined}
 */
export function getProtectionStorage(editor) {
  return /** @type {ProtectionStorage | undefined} */ (editor?.storage?.protection);
}

/**
 * Returns true when the document has runtime-enforced read-only protection.
 * @param {import('../../core/Editor.js').Editor} editor
 * @returns {boolean}
 */
export function isReadOnlyProtectionRuntimeEnforced(editor) {
  const storage = getProtectionStorage(editor);
  if (!storage?.initialized) return false;
  return storage.state?.editingRestriction?.runtimeEnforced === true;
}

/**
 * Returns true when the editor is effectively read-only, considering both
 * protection state and consumer documentMode.
 * @param {import('../../core/Editor.js').Editor} editor
 * @returns {boolean}
 */
export function isEffectivelyReadOnly(editor) {
  if (isReadOnlyProtectionRuntimeEnforced(editor)) return true;
  return editor?.options?.documentMode === 'viewing';
}

/**
 * Refilter allowedRanges from allRanges using current protection state and
 * user principal matching, then compute and apply effective editability.
 *
 * This does NOT dispatch a synthetic PM transaction. It operates entirely
 * on storage and editor state.
 *
 * @param {import('../../core/Editor.js').Editor} editor
 * @param {{ refilterRanges?: boolean }} [opts]
 */
export function applyEffectiveEditability(editor, opts = {}) {
  if (!editor || editor.isDestroyed) return;

  const refilter = opts.refilterRanges !== false;

  // Step 1: Optionally refilter permission ranges
  if (refilter) {
    refilterAllowedRanges(editor);
  }

  // Step 2: Compute effective editability
  const protectionEnforced = isReadOnlyProtectionRuntimeEnforced(editor);
  const hasAllowedRanges = editor.storage?.permissionRanges?.hasAllowedRanges === true;
  const documentMode = editor.options?.documentMode;
  const storage = getProtectionStorage(editor);

  // Step 3: Compute and apply effective editability
  //
  // Priority: protection enforcement > permission-range override > documentMode
  //
  // When protection is first enforced, snapshot the host's current editability
  // as `editableBaseline`. While protection is active, protection owns
  // editability and may flip it arbitrarily (lock, unlock via allowed ranges,
  // re-lock when ranges change, etc.). When protection is cleared, restore
  // the baseline — this is the only reliable way to return to the host's
  // intended state regardless of how many times protection flipped editability.
  if (protectionEnforced) {
    // Capture the baseline on the first enforced recompute only.
    if (storage && storage.editableBaseline === null) {
      storage.editableBaseline = editor.isEditable;
    }
    const shouldBeEditable = hasAllowedRanges;
    if (editor.isEditable !== shouldBeEditable) {
      editor.setEditable(shouldBeEditable, false);
    }
  } else {
    // Protection not enforced. If we have a saved baseline, restore it.
    const baseline = storage?.editableBaseline ?? null;
    if (storage) storage.editableBaseline = null;

    if (documentMode === 'viewing') {
      if (editor.isEditable !== false) {
        editor.setEditable(false, false);
      }
    } else if (baseline !== null && editor.isEditable !== baseline) {
      // Restore the host's editability from before protection was enforced.
      editor.setEditable(baseline, false);
    }
  }
}

/**
 * Refilter `allowedRanges` from `allRanges` using current protection state
 * and user principals.
 *
 * @param {import('../../core/Editor.js').Editor} editor
 */
function refilterAllowedRanges(editor) {
  const storage = editor?.storage?.permissionRanges;
  if (!storage) return;

  const allRanges = storage.allRanges;
  if (!Array.isArray(allRanges)) return;

  const protectionEnforced = isReadOnlyProtectionRuntimeEnforced(editor);

  if (!protectionEnforced) {
    // When protection is not enforced, permission ranges are inactive
    storage.allowedRanges = [];
    storage.hasAllowedRanges = false;
    // Keep legacy storage.ranges in sync
    storage.ranges = [];
    return;
  }

  // Filter through user principal matching
  const allowedIdentifiers = buildAllowedIdentifierSetFromEditor(editor);
  const filtered = allRanges.filter((entry) => isRangeAllowedForPrincipal(entry, allowedIdentifiers));

  storage.allowedRanges = filtered;
  storage.hasAllowedRanges = filtered.length > 0;
  // Keep legacy storage.ranges in sync
  storage.ranges = filtered;
}

/**
 * Build the set of identifiers the current user matches against.
 * Prefers explicit `permissionPrincipals` if set; falls back to email derivation.
 *
 * Exported so the permission-ranges extension can share the same logic
 * without duplicating the identifier derivation rules.
 *
 * @param {import('../../core/Editor.js').Editor} editor
 * @returns {Set<string>}
 */
export function buildAllowedIdentifierSetFromEditor(editor) {
  const user = editor?.options?.user;
  if (!user) return new Set();

  // Any provided array (including empty) is authoritative — no email fallback.
  // An empty array means "this user matches no named principals."
  const principals = user.permissionPrincipals;
  if (Array.isArray(principals)) {
    return new Set(principals.map((p) => (typeof p === 'string' ? p.trim().toLowerCase() : '')).filter(Boolean));
  }

  // Fallback: derive from email only when permissionPrincipals is not set
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!email) return new Set();
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return new Set();
  return new Set([`${domain}\\${localPart}`]);
}

/**
 * Check if a range entry is allowed for the given user identifiers.
 * @param {{ principal?: { kind: string, id?: string }, edGrp?: string, ed?: string }} entry
 * @param {Set<string>} allowedIdentifiers
 * @returns {boolean}
 */
function isRangeAllowedForPrincipal(entry, allowedIdentifiers) {
  // Support both the new principal model and legacy attrs
  if (entry.principal) {
    if (entry.principal.kind === 'everyone') return true;
    if (entry.principal.kind === 'editor') {
      const id = typeof entry.principal.id === 'string' ? entry.principal.id.trim().toLowerCase() : '';
      return id ? allowedIdentifiers.has(id) : false;
    }
  }

  // Legacy attrs path
  const edGrp = typeof entry.edGrp === 'string' ? entry.edGrp.trim().toLowerCase() : '';
  if (edGrp === 'everyone') return true;

  const ed = typeof entry.ed === 'string' ? entry.ed.trim().toLowerCase() : '';
  return ed ? allowedIdentifiers.has(ed) : false;
}
