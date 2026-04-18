import type { AdapterMutationFailure } from '../types/adapter-result.js';

// ---------------------------------------------------------------------------
// Editing restriction modes
// ---------------------------------------------------------------------------

/** Word document protection modes from `w:edit` attribute values. */
export type EditingRestrictionMode = 'none' | 'readOnly' | 'comments' | 'trackedChanges' | 'forms';

// ---------------------------------------------------------------------------
// Protection state (returned by protection.get)
// ---------------------------------------------------------------------------

export interface EditingRestrictionState {
  /** Active protection mode. `'none'` when `w:documentProtection` is absent. */
  mode: EditingRestrictionMode;
  /** Whether OOXML enforcement is on (`w:enforcement="1"`). */
  enforced: boolean;
  /**
   * Whether the current engine version actively enforces this restriction
   * in editing behavior. Engine-version-dependent — may change across
   * releases as support for additional modes is added.
   */
  runtimeEnforced: boolean;
  /** Whether verifier/hash fields are present (password was set). */
  passwordProtected: boolean;
  /** Whether `w:formatting="1"` restricts formatting changes. */
  formattingRestricted: boolean;
}

export interface WriteProtectionState {
  /** Whether `w:writeProtection` is present and active. */
  enabled: boolean;
  /** Whether verifier/hash fields are present on `w:writeProtection`. */
  passwordProtected: boolean;
}

export interface DocumentProtectionState {
  editingRestriction: EditingRestrictionState;
  writeProtection: WriteProtectionState;
  readOnlyRecommended: boolean;
}

// ---------------------------------------------------------------------------
// Default state (no protection)
// ---------------------------------------------------------------------------

export const DEFAULT_PROTECTION_STATE: DocumentProtectionState = {
  editingRestriction: {
    mode: 'none',
    enforced: false,
    runtimeEnforced: false,
    passwordProtected: false,
    formattingRestricted: false,
  },
  writeProtection: {
    enabled: false,
    passwordProtected: false,
  },
  readOnlyRecommended: false,
};

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Input for `protection.get` — empty object, no parameters needed. */
export type ProtectionGetInput = Record<string, never> | undefined;

/** Input for `protection.setEditingRestriction`. */
export interface SetEditingRestrictionInput {
  /** Only `'readOnly'` is accepted in v1. */
  mode: 'readOnly';
  /** Whether to restrict formatting changes. Defaults to false. */
  formattingRestricted?: boolean;
}

/** Input for `protection.clearEditingRestriction`. */
export type ClearEditingRestrictionInput = Record<string, never> | undefined;

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface ProtectionMutationSuccess {
  success: true;
  state: DocumentProtectionState;
}

export type ProtectionMutationResult = ProtectionMutationSuccess | AdapterMutationFailure;
