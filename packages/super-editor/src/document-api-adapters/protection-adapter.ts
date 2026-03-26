import type {
  DocumentProtectionState,
  EditingRestrictionMode,
  SetEditingRestrictionInput,
  ClearEditingRestrictionInput,
  ProtectionMutationResult,
  MutationOptions,
} from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import type { PartId } from '../core/parts/types.js';
import { DocumentApiAdapterError } from './errors.js';
import { rejectTrackedMode } from './helpers/mutation-helpers.js';
import { mutatePart } from '../core/parts/mutation/mutate-part.js';
import { applyEffectiveEditability, getProtectionStorage } from '../extensions/protection/editability.js';
import {
  SETTINGS_PART_PATH,
  readSettingsRoot,
  ensureSettingsRoot,
  parseProtectionState,
  setDocumentProtection,
  clearDocumentProtectionEnforcement,
  type ConverterWithDocumentSettings,
} from './document-settings.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SETTINGS_PART: PartId = SETTINGS_PART_PATH as PartId;

function getConverter(editor: Editor): ConverterWithDocumentSettings | undefined {
  return (editor as unknown as { converter?: ConverterWithDocumentSettings }).converter ?? undefined;
}

function requireConverter(editor: Editor, operationName: string): ConverterWithDocumentSettings {
  const converter = getConverter(editor);
  if (!converter) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      `${operationName} requires an active document converter.`,
    );
  }
  return converter;
}

/**
 * Build a previewed post-mutation protection state without mutating the document.
 * Used by dryRun paths to return what the state *would* be.
 */
function buildPreviewState(
  current: DocumentProtectionState,
  editingRestriction: { mode: EditingRestrictionMode; enforced: boolean; formattingRestricted: boolean },
): DocumentProtectionState {
  const { mode, enforced } = editingRestriction;
  const runtimeEnforced = mode === 'readOnly' && enforced;

  return {
    editingRestriction: {
      mode,
      enforced,
      runtimeEnforced,
      passwordProtected: current.editingRestriction.passwordProtected,
      formattingRestricted: editingRestriction.formattingRestricted,
    },
    writeProtection: current.writeProtection,
    readOnlyRecommended: current.readOnlyRecommended,
  };
}

// ---------------------------------------------------------------------------
// protection.get
// ---------------------------------------------------------------------------

export function protectionGetAdapter(editor: Editor): DocumentProtectionState {
  // Read from storage (populated by #initProtectionState)
  const stored = getProtectionStorage(editor);
  if (stored?.initialized) {
    return stored.state;
  }

  // Fallback: parse directly (edge case where storage isn't ready)
  const converter = getConverter(editor);
  const settingsRoot = converter ? readSettingsRoot(converter) : null;
  return parseProtectionState(settingsRoot);
}

// ---------------------------------------------------------------------------
// protection.setEditingRestriction
// ---------------------------------------------------------------------------

export function protectionSetEditingRestrictionAdapter(
  editor: Editor,
  input: SetEditingRestrictionInput,
  options?: MutationOptions,
): ProtectionMutationResult {
  rejectTrackedMode('protection.setEditingRestriction', options);
  const converter = requireConverter(editor, 'protection.setEditingRestriction');

  const result = mutatePart({
    editor,
    partId: SETTINGS_PART,
    operation: 'mutate',
    source: 'protection.setEditingRestriction',
    dryRun: options?.dryRun === true,
    expectedRevision: options?.expectedRevision,
    mutate({ part, dryRun: isDryRun }) {
      // Check current state for NO_OP detection
      const currentState = parseProtectionState(readSettingsRoot(converter));
      const { editingRestriction } = currentState;

      const alreadyMatches =
        editingRestriction.mode === input.mode &&
        editingRestriction.enforced === true &&
        (input.formattingRestricted === undefined ||
          editingRestriction.formattingRestricted === input.formattingRestricted);

      if (alreadyMatches) {
        return {
          success: false,
          failure: { code: 'NO_OP', message: 'Editing restriction already matches the requested state.' },
        };
      }

      if (isDryRun) {
        // Preview: compute what the state would be without mutating
        const previewState = buildPreviewState(currentState, {
          mode: input.mode,
          enforced: true,
          formattingRestricted: input.formattingRestricted ?? currentState.editingRestriction.formattingRestricted,
        });
        return { success: true, state: previewState };
      }

      const settingsRoot = ensureSettingsRoot(part as Parameters<typeof ensureSettingsRoot>[0]);
      setDocumentProtection(settingsRoot, {
        mode: input.mode,
        enforced: true,
        formattingRestricted: input.formattingRestricted,
      });

      const newState = parseProtectionState(settingsRoot);
      const protStorage = getProtectionStorage(editor);
      if (protStorage) {
        protStorage.state = newState;
      }

      editor.emit('protectionChanged', {
        editor,
        state: newState,
        source: 'local-mutation',
      });

      return { success: true, state: newState };
    },
  });

  // Recompute effective editability after protection state change
  if (options?.dryRun !== true) {
    applyEffectiveEditability(editor);
  }

  return result.result as ProtectionMutationResult;
}

// ---------------------------------------------------------------------------
// protection.clearEditingRestriction
// ---------------------------------------------------------------------------

export function protectionClearEditingRestrictionAdapter(
  editor: Editor,
  _input?: ClearEditingRestrictionInput,
  options?: MutationOptions,
): ProtectionMutationResult {
  rejectTrackedMode('protection.clearEditingRestriction', options);
  const converter = requireConverter(editor, 'protection.clearEditingRestriction');

  const result = mutatePart({
    editor,
    partId: SETTINGS_PART,
    operation: 'mutate',
    source: 'protection.clearEditingRestriction',
    dryRun: options?.dryRun === true,
    expectedRevision: options?.expectedRevision,
    mutate({ part, dryRun: isDryRun }) {
      const currentState = parseProtectionState(readSettingsRoot(converter));

      // Already unenforced or no protection → NO_OP
      if (!currentState.editingRestriction.enforced) {
        return {
          success: false,
          failure: { code: 'NO_OP', message: 'Editing restriction is already not enforced.' },
        };
      }

      if (isDryRun) {
        // Preview: compute what the state would be without mutating
        const previewState = buildPreviewState(currentState, {
          mode: currentState.editingRestriction.mode,
          enforced: false,
          formattingRestricted: currentState.editingRestriction.formattingRestricted,
        });
        return { success: true, state: previewState };
      }

      const settingsRoot = ensureSettingsRoot(part as Parameters<typeof ensureSettingsRoot>[0]);
      clearDocumentProtectionEnforcement(settingsRoot);

      const newState = parseProtectionState(settingsRoot);
      const protStorage = getProtectionStorage(editor);
      if (protStorage) {
        protStorage.state = newState;
      }

      editor.emit('protectionChanged', {
        editor,
        state: newState,
        source: 'local-mutation',
      });

      return { success: true, state: newState };
    },
  });

  // Recompute effective editability after protection state change
  if (options?.dryRun !== true) {
    applyEffectiveEditability(editor);
  }

  return result.result as ProtectionMutationResult;
}
