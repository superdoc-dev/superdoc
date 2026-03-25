import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactive, ref } from 'vue';
import { usePasswordPrompt } from './use-password-prompt.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a doc object wrapped in reactive() to mimic the Pinia store behaviour.
 * Vue auto-unwraps the nested ref, so `doc.editorMountNonce` is a number on the proxy.
 */
const makeDoc = (id = 'doc-1') =>
  reactive({
    id,
    password: undefined,
    editorMountNonce: ref(0),
  });

/**
 * Minimal SurfaceManager stub whose `open()` returns a controllable handle.
 */
function createManagerStub() {
  let settleHandle;
  const handle = {
    id: 'surface-1',
    mode: 'dialog',
    close: vi.fn(),
    result: new Promise((resolve) => {
      settleHandle = resolve;
    }),
  };

  return {
    open: vi.fn(() => handle),
    handle,
    /** Settle the current handle manually */
    settle: (outcome) => settleHandle(outcome),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePasswordPrompt', () => {
  let manager;
  let passwordPromptConfig;

  /** @type {ReturnType<typeof usePasswordPrompt>} */
  let prompt;

  beforeEach(() => {
    manager = createManagerStub();
    passwordPromptConfig = undefined;
    prompt = usePasswordPrompt({
      getSurfaceManager: () => manager,
      getPasswordPromptConfig: () => passwordPromptConfig,
    });
  });

  // ---- feature gate --------------------------------------------------------

  it('does nothing when passwordPrompt config is explicitly false', () => {
    passwordPromptConfig = false;
    const doc = makeDoc();
    expect(prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED')).toBe(false);
    expect(manager.open).not.toHaveBeenCalled();
  });

  // ---- error code filtering ------------------------------------------------

  it('ignores DOCX_ENCRYPTION_UNSUPPORTED', () => {
    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_ENCRYPTION_UNSUPPORTED');
    expect(manager.open).not.toHaveBeenCalled();
  });

  it('ignores DOCX_DECRYPTION_FAILED', () => {
    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_DECRYPTION_FAILED');
    expect(manager.open).not.toHaveBeenCalled();
  });

  // ---- basic open ----------------------------------------------------------

  it('opens a surface dialog on DOCX_PASSWORD_REQUIRED', async () => {
    const doc = makeDoc();
    expect(prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED')).toBe(true);

    // Dynamic import is async, so wait a tick
    await vi.dynamicImportSettled();

    expect(manager.open).toHaveBeenCalledTimes(1);
    const request = manager.open.mock.calls[0][0];
    expect(request.mode).toBe('dialog');
    expect(request.closeOnBackdrop).toBe(false);
  });

  it('opens a surface dialog on DOCX_PASSWORD_INVALID', async () => {
    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_INVALID');
    await vi.dynamicImportSettled();

    expect(manager.open).toHaveBeenCalledTimes(1);
  });

  // ---- queue deduplication -------------------------------------------------

  it('does not queue duplicate entries for the same doc', async () => {
    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED');
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED');
    await vi.dynamicImportSettled();

    // Only one open call — the second was a no-op (doc already active)
    expect(manager.open).toHaveBeenCalledTimes(1);
  });

  // ---- signal: success via handleEditorReady ------------------------------

  it('resolves pending signal on handleEditorReady', async () => {
    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED');
    await vi.dynamicImportSettled();

    // Grab the attemptPassword function passed as a prop
    const attemptPassword = manager.open.mock.calls[0][0].payload.attemptPassword;
    const resultPromise = attemptPassword('secret');

    expect(doc.password).toBe('secret');
    expect(doc.editorMountNonce).toBe(1);

    // Simulate editor ready
    prompt.handleEditorReady(doc);

    const result = await resultPromise;
    expect(result).toEqual({ success: true });
  });

  // ---- signal: failure via handleEncryptionError --------------------------

  it('resolves pending signal with failure on re-entrant encryption error', async () => {
    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED');
    await vi.dynamicImportSettled();

    const attemptPassword = manager.open.mock.calls[0][0].payload.attemptPassword;
    const resultPromise = attemptPassword('wrong');

    // Simulate editor re-throwing with INVALID
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_INVALID');

    const result = await resultPromise;
    expect(result).toEqual({ success: false, errorCode: 'DOCX_PASSWORD_INVALID' });

    // Should NOT open a second dialog — the active prompt handles it in-place
    expect(manager.open).toHaveBeenCalledTimes(1);
  });

  // ---- FIFO queue ----------------------------------------------------------

  it('processes queued docs in order after first dialog closes', async () => {
    const doc1 = makeDoc('doc-1');
    const doc2 = makeDoc('doc-2');

    prompt.handleEncryptionError(doc1, 'DOCX_PASSWORD_REQUIRED');
    prompt.handleEncryptionError(doc2, 'DOCX_PASSWORD_REQUIRED');
    await vi.dynamicImportSettled();

    // Only the first dialog is open
    expect(manager.open).toHaveBeenCalledTimes(1);

    // Create a new handle for the second dialog
    let settleSecond;
    const secondHandle = {
      id: 'surface-2',
      mode: 'dialog',
      close: vi.fn(),
      result: new Promise((resolve) => {
        settleSecond = resolve;
      }),
    };
    manager.open.mockReturnValueOnce(secondHandle);

    // Settle the first dialog (user cancelled)
    manager.settle({ status: 'closed', reason: 'user-cancelled' });

    // Let the async showPrompt finish and drainQueue start
    await vi.dynamicImportSettled();
    await new Promise((r) => setTimeout(r, 0));

    // Second dialog should now be open
    expect(manager.open).toHaveBeenCalledTimes(2);
  });

  // ---- attemptPassword mutates doc ----------------------------------------

  it('attemptPassword sets doc.password and increments nonce', async () => {
    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED');
    await vi.dynamicImportSettled();

    const attemptPassword = manager.open.mock.calls[0][0].payload.attemptPassword;
    const promise = attemptPassword('my-pass');

    expect(doc.password).toBe('my-pass');
    expect(doc.editorMountNonce).toBe(1);

    // Resolve the signal so the promise completes
    prompt.handleEditorReady(doc);
    await promise;
  });

  // ---- cancel flow ---------------------------------------------------------

  it('drains queue on cancel (closed outcome)', async () => {
    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED');
    await vi.dynamicImportSettled();

    expect(manager.open).toHaveBeenCalledTimes(1);

    // Settle as closed
    manager.settle({ status: 'closed', reason: 'user-cancelled' });

    // Should not throw, and activePrompt should clear
    await new Promise((r) => setTimeout(r, 0));
  });

  // ---- destroy cleanup -----------------------------------------------------

  it('resolves all pending signals and clears queue on destroy', async () => {
    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED');
    await vi.dynamicImportSettled();

    const attemptPassword = manager.open.mock.calls[0][0].payload.attemptPassword;
    const resultPromise = attemptPassword('test');

    prompt.destroy();

    const result = await resultPromise;
    expect(result).toEqual({ success: false, errorCode: 'destroyed' });
  });

  // ---- resolver suppression ------------------------------------------------

  it('respects resolver suppression and does not fall back to built-in', async () => {
    manager.open.mockImplementation(() => {
      throw new Error('SurfaceManager: resolver explicitly suppressed surface for kind "password-prompt".');
    });

    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED');
    await vi.dynamicImportSettled();

    // open was called once (the intent-based attempt), but the suppression was respected
    expect(manager.open).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to built-in on consumer resolver bugs', async () => {
    // A consumer resolver bug (not a "no renderer resolved" error) must NOT
    // be swallowed by falling back to the built-in component.
    const resolverError = new TypeError('Cannot read properties of undefined');
    manager.open.mockImplementation(() => {
      throw resolverError;
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const doc = makeDoc();

    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED');
    await vi.dynamicImportSettled();
    // Flush so the .catch() handler runs
    await new Promise((r) => setTimeout(r, 0));

    // The error was surfaced via console.error, not swallowed
    expect(consoleSpy).toHaveBeenCalledWith('[SuperDoc] Password prompt error:', resolverError);
    // open was called exactly once — no silent fallback to built-in
    expect(manager.open).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('continues draining queue after an error in showPrompt', async () => {
    const doc1 = makeDoc('doc-1');
    const doc2 = makeDoc('doc-2');

    // First call throws (consumer resolver bug), second call succeeds
    const resolverError = new TypeError('boom');
    let callCount = 0;
    manager.open.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw resolverError;
      return manager.handle;
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    prompt.handleEncryptionError(doc1, 'DOCX_PASSWORD_REQUIRED');
    prompt.handleEncryptionError(doc2, 'DOCX_PASSWORD_REQUIRED');
    await vi.dynamicImportSettled();
    await new Promise((r) => setTimeout(r, 0));

    // First doc errored, second doc should still get its dialog
    expect(callCount).toBe(2);

    consoleSpy.mockRestore();
  });

  // ---- config resolution ---------------------------------------------------

  it('uses custom titles from config object', async () => {
    prompt = usePasswordPrompt({
      getSurfaceManager: () => manager,
      getPasswordPromptConfig: () => ({
        title: 'Unlock',
        invalidTitle: 'Wrong password',
        submitLabel: 'Go',
        cancelLabel: 'Nope',
      }),
    });

    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_REQUIRED');
    await vi.dynamicImportSettled();

    const request = manager.open.mock.calls[0][0];
    expect(request.title).toBe('Unlock');
    expect(request.payload.submitLabel).toBe('Go');
    expect(request.payload.cancelLabel).toBe('Nope');
  });

  it('passes both title and invalidTitle in payload for intent-based requests', async () => {
    prompt = usePasswordPrompt({
      getSurfaceManager: () => manager,
      getPasswordPromptConfig: () => ({
        title: 'Enter password',
        invalidTitle: 'Try again',
      }),
    });

    const doc = makeDoc();
    prompt.handleEncryptionError(doc, 'DOCX_PASSWORD_INVALID');
    await vi.dynamicImportSettled();

    const request = manager.open.mock.calls[0][0];
    // Surface-level title is always the base title (set once, immutable on the dialog shell).
    // The component itself switches between title/invalidTitle reactively.
    expect(request.title).toBe('Enter password');
    expect(request.payload.title).toBe('Enter password');
    expect(request.payload.invalidTitle).toBe('Try again');
  });
});
