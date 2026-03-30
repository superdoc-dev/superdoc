import { Extension } from '../../core/Extension.js';

/**
 * Protection extension — provides `editor.storage.protection` as the
 * single source of truth for document-level protection state.
 *
 * State is NOT initialized here via `onCreate` because that fires async
 * after `#createInitialState()`. Instead, `Editor.#initProtectionState()`
 * writes to storage before ProseMirror plugins init.
 */
export const Protection = Extension.create({
  name: 'protection',

  addStorage() {
    return {
      /** @type {import('@superdoc/document-api').DocumentProtectionState} */
      state: {
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
      },
      /** Whether state has been populated from the document's settings.xml. */
      initialized: false,
      /**
       * Host editability snapshot taken when protection was first enforced.
       * Restored when protection is cleared. `null` means protection has not
       * overridden editability (or has already been cleared).
       * @type {boolean | null}
       */
      editableBaseline: null,
    };
  },
});
