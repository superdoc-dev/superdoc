import { shallowRef, markRaw } from 'vue';

/** @typedef {import('../core/types').PasswordPromptConfig} PasswordPromptConfig */

const RECOVERABLE_CODES = ['DOCX_PASSWORD_REQUIRED', 'DOCX_PASSWORD_INVALID'];

const SUPPRESSED_ERROR_FRAGMENT = 'explicitly suppressed';
const NO_RENDERER_ERROR_FRAGMENT = 'no renderer resolved';

const SIGNAL_TIMEOUT_MS = 30_000;

/**
 * Composable that coordinates password-prompt dialogs for encrypted DOCX files.
 *
 * Owns a FIFO queue of pending prompts (one active dialog at a time), and a
 * `pendingSignals` map that bridges the async gap between triggering a remount
 * and observing the result via `onEditorReady` / `onEditorException`.
 *
 * @param {Object} options
 * @param {() => import('../core/surface-manager').SurfaceManager | null} options.getSurfaceManager
 * @param {() => boolean | PasswordPromptConfig | undefined} options.getPasswordPromptConfig
 */
export function usePasswordPrompt({ getSurfaceManager, getPasswordPromptConfig }) {
  // ---- internal state -------------------------------------------------------

  /** @type {Array<{ doc: any, errorCode: string }>} */
  const queue = [];

  /** @type {import('vue').ShallowRef<{ doc: any, surfaceHandle: any } | null>} */
  const activePrompt = shallowRef(null);

  /**
   * One-shot rendezvous: the coordinator registers a resolve callback before
   * triggering a remount; `handleEditorReady` / `handleEncryptionError` resolves it.
   * @type {Map<string, { resolve: (result: { success: boolean, errorCode?: string }) => void, timer: ReturnType<typeof setTimeout> }>}
   */
  const pendingSignals = new Map();

  let destroyed = false;

  // ---- public API -----------------------------------------------------------

  /**
   * Called from `onEditorException` in SuperDoc.vue.
   * @param {any} doc  The reactive document object from the store.
   * @param {string} errorCode  e.g. `'DOCX_PASSWORD_REQUIRED'`
   * @returns {boolean} Whether the error was taken over by the password prompt flow.
   */
  function handleEncryptionError(doc, errorCode) {
    if (!doc || !RECOVERABLE_CODES.includes(errorCode)) return false;
    if (getPasswordPromptConfig() === false) return false;
    if (!getSurfaceManager()) return false;

    // If a signal is pending for this doc, we're in a retry loop — resolve it
    // so the dialog can update in-place rather than queueing a new entry.
    const pending = pendingSignals.get(doc.id);
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve({ success: false, errorCode });
      pendingSignals.delete(doc.id);
      return true;
    }

    // Dedupe: update code if already queued or active
    const existing = queue.find((e) => e.doc.id === doc.id);
    if (existing) {
      existing.errorCode = errorCode;
      return true;
    }
    if (activePrompt.value?.doc.id === doc.id) return true;

    queue.push({ doc, errorCode });
    drainQueue();
    return true;
  }

  /**
   * Called from `onEditorReady` in SuperDoc.vue.
   * @param {any} doc
   */
  function handleEditorReady(doc) {
    if (!doc) return;
    const pending = pendingSignals.get(doc.id);
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve({ success: true });
      pendingSignals.delete(doc.id);
    }
  }

  /** Tear down the coordinator, resolving any pending signals and clearing the queue. */
  function destroy() {
    destroyed = true;
    for (const [, signal] of pendingSignals) {
      clearTimeout(signal.timer);
      signal.resolve({ success: false, errorCode: 'destroyed' });
    }
    pendingSignals.clear();
    queue.length = 0;
    activePrompt.value = null;
  }

  // ---- internals ------------------------------------------------------------

  function drainQueue() {
    if (destroyed) return;
    if (activePrompt.value) return;
    if (queue.length === 0) return;

    const entry = queue.shift();
    showPrompt(entry).catch((err) => {
      // Surface errors (e.g. from a consumer's resolver) as console errors
      // rather than letting them become unhandled rejections.
      activePrompt.value = null;
      console.error('[SuperDoc] Password prompt error:', err);
      drainQueue();
    });
  }

  /**
   * @param {{ doc: any, errorCode: string }} entry
   */
  async function showPrompt({ doc, errorCode }) {
    const manager = getSurfaceManager();
    if (!manager || destroyed) return;

    const config = resolveConfig();

    /**
     * Async bridge passed to the dialog component. Sets the password on the doc,
     * increments the mount nonce to trigger a remount, and waits for the outcome.
     * @param {string} password
     * @returns {Promise<{ success: boolean, errorCode?: string }>}
     */
    const attemptPassword = (password) => {
      doc.password = password;
      // editorMountNonce is a ref inside a reactive store — Vue auto-unwraps it,
      // so on the reactive proxy it's already a number, not a Ref.
      doc.editorMountNonce++;

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pendingSignals.delete(doc.id);
          resolve({ success: false, errorCode: 'timeout' });
        }, SIGNAL_TIMEOUT_MS);

        pendingSignals.set(doc.id, { resolve, timer });
      });
    };

    let handle;
    try {
      // Tier 1: intent-based — let the consumer resolver handle it.
      // All data goes into `payload` (the documented IntentSurfaceRequest field).
      // The consumer's resolver can read payload and return resolution.props to
      // forward whichever values its custom component needs.
      handle = manager.open({
        mode: 'dialog',
        kind: 'password-prompt',
        title: config.title,
        closeOnBackdrop: false,
        payload: {
          documentId: doc.id,
          errorCode,
          attemptPassword,
          title: config.title,
          invalidTitle: config.invalidTitle,
          submitLabel: config.submitLabel,
          cancelLabel: config.cancelLabel,
        },
      });
    } catch (err) {
      // If the resolver explicitly suppressed this kind, respect that.
      if (err?.message?.includes(SUPPRESSED_ERROR_FRAGMENT)) {
        drainQueue();
        return;
      }

      // Only fall back to the built-in component when the surface manager itself
      // couldn't resolve the intent (no resolver configured, or resolver returned null).
      // Any other error (e.g. a bug inside a consumer's resolver) must propagate.
      if (!err?.message?.includes(NO_RENDERER_ERROR_FRAGMENT)) {
        throw err;
      }

      // Tier 2: fall back to built-in component
      // Lazy-import to avoid circular deps and keep the surface-manager clean.
      const { default: PasswordPromptSurface } = await import('../components/surfaces/PasswordPromptSurface.vue');

      // Omit surface-level title — the built-in component renders its own
      // heading that updates reactively on retry failure.
      handle = manager.open({
        mode: 'dialog',
        component: markRaw(PasswordPromptSurface),
        closeOnBackdrop: false,
        props: {
          attemptPassword,
          errorCode,
          title: config.title,
          invalidTitle: config.invalidTitle,
          submitLabel: config.submitLabel,
          cancelLabel: config.cancelLabel,
        },
      });
    }

    activePrompt.value = { doc, surfaceHandle: handle };

    // Block until the dialog settles (submitted / closed / replaced / destroyed)
    await handle.result;

    activePrompt.value = null;
    drainQueue();
  }

  /**
   * Normalise `getPasswordPromptConfig()` into a config object with defaults.
   * The password prompt is enabled by default; only an explicit `false` disables it.
   * @returns {{ title: string, invalidTitle: string, submitLabel: string, cancelLabel: string }}
   */
  function resolveConfig() {
    const raw = getPasswordPromptConfig();
    const cfg = typeof raw === 'object' && raw !== null ? raw : {};
    return {
      title: cfg.title || 'Password Required',
      invalidTitle: cfg.invalidTitle || 'Incorrect Password',
      submitLabel: cfg.submitLabel || 'Open',
      cancelLabel: cfg.cancelLabel || 'Cancel',
    };
  }

  return {
    handleEncryptionError,
    handleEditorReady,
    destroy,
  };
}
