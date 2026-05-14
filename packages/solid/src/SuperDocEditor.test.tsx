import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@solidjs/testing-library';
import { SuperDocEditor } from './SuperDocEditor';
import type { SuperDocRef } from './types';
import { createSignal } from 'solid-js';

function skipWithReason(reason: string) {
  return {
    describe: (name: string, fn: () => void) => describe.skip(`${name} | ⚠️ Skipped due to: (${reason})`, fn),
    it: (name: string, fn: () => void) => it.skip(`${name} | ⚠️ Skipped due to: (${reason})`, fn),
  };
}

describe('SuperDocEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('mounting and unmounting', () => {
    it('should render container elements', () => {
      const { container } = render(() => <SuperDocEditor />);

      expect(container.querySelector('.superdoc-wrapper')).toBeTruthy();
      expect(container.querySelector('.superdoc-editor-container')).toBeTruthy();
      expect(container.querySelector('.superdoc-toolbar-container')).toBeTruthy();
    });

    it('should hide toolbar when hideToolbar={true}', () => {
      const { container } = render(() => <SuperDocEditor hideToolbar />);

      expect(container.querySelector('.superdoc-toolbar-container')).toBeFalsy();
    });

    it('should apply class and style props', () => {
      const { container } = render(() => <SuperDocEditor class='custom-class' style={{ 'background-color': 'red' }} />);

      const wrapper = container.querySelector('.superdoc-wrapper');
      expect(wrapper?.classList.contains('custom-class')).toBe(true);
      expect((wrapper as HTMLElement)?.style.backgroundColor).toBe('red');
    });

    it('should handle unmount without throwing', async () => {
      const onReady = vi.fn();
      const { unmount } = render(() => <SuperDocEditor onReady={onReady} />);

      // Wait for initialization to complete
      await waitFor(
        () => {
          expect(onReady).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );

      // Unmount should not throw
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('ref methods', () => {
    it('should expose getInstance method only', () => {
      let ref: SuperDocRef | undefined;
      render(() => <SuperDocEditor ref={ref} />);

      // Ref should be available immediately with getInstance
      expect(ref).not.toBeNull();
      expect(typeof ref?.getInstance).toBe('function');
    });

    it('should return null from getInstance before ready', () => {
      let ref: SuperDocRef | undefined;
      render(() => <SuperDocEditor ref={ref} />);

      // Before async init completes, getInstance returns null
      const instance = ref?.getInstance();
      expect(instance).toBeNull();
    });

    it('should safely handle calls through getInstance before ready', () => {
      let ref: SuperDocRef | undefined;
      render(() => <SuperDocEditor ref={ref} />);

      // Using optional chaining through getInstance is safe
      expect(() => ref?.getInstance()?.focus()).not.toThrow();
      expect(() => ref?.getInstance()?.setDocumentMode('viewing')).not.toThrow();
      expect(() => ref?.getInstance()?.toggleRuler()).not.toThrow();
    });
  });

  describe('loading state', () => {
    it('should show loading content initially', () => {
      const { container } = render(() => (
        <SuperDocEditor renderLoading={() => <div data-testid='loading'>Loading...</div>} />
      ));

      expect(container.querySelector('[data-testid="loading"]')).toBeTruthy();
    });
  });

  describe('callbacks', () => {
    it('should call onReady when SuperDoc is ready', async () => {
      const onReady = vi.fn();
      render(() => <SuperDocEditor onReady={onReady} />);

      await waitFor(
        () => {
          expect(onReady).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );
    });

    it('should call onEditorCreate when editor is created', async () => {
      const onEditorCreate = vi.fn();
      render(() => <SuperDocEditor onEditorCreate={onEditorCreate} />);

      await waitFor(
        () => {
          expect(onEditorCreate).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );
    });

    it('should route onTransaction through the latest callback after callback implementation changes', async () => {
      let ref: SuperDocRef | undefined;
      const onReady = vi.fn();

      let i: 'first' | 'second' = 'first';
      const firstOnTransaction = vi.fn();
      const secondOnTransaction = vi.fn();
      const onTransaction = vi.fn((...args: any[]) =>
        i === 'first' ? firstOnTransaction(...args) : secondOnTransaction(...args),
      );

      render(() => <SuperDocEditor ref={ref} onReady={onReady} onTransaction={onTransaction} />);

      await waitFor(() => expect(onReady).toHaveBeenCalled(), { timeout: 5000 });

      const instance = ref?.getInstance();
      expect(instance).toBeTruthy();

      const transactionEvent = {
        editor: {},
        sourceEditor: {},
        transaction: { docChanged: true },
        surface: 'body',
      };

      const firstCallCountBeforeManualDispatch = firstOnTransaction.mock.calls.length;
      (instance as any).config.onTransaction(transactionEvent);

      expect(firstOnTransaction).toHaveBeenLastCalledWith(transactionEvent);
      expect(firstOnTransaction).toHaveBeenCalledTimes(firstCallCountBeforeManualDispatch + 1);
      expect(secondOnTransaction).not.toHaveBeenCalled();

      i = 'second';

      expect(ref?.getInstance()).toBe(instance);

      const firstCallCountBeforeRerenderDispatch = firstOnTransaction.mock.calls.length;
      const secondCallCountBeforeManualDispatch = secondOnTransaction.mock.calls.length;
      (instance as any).config.onTransaction(transactionEvent);

      expect(firstOnTransaction).toHaveBeenCalledTimes(firstCallCountBeforeRerenderDispatch);
      expect(secondOnTransaction).toHaveBeenLastCalledWith(transactionEvent);
      expect(secondOnTransaction).toHaveBeenCalledTimes(secondCallCountBeforeManualDispatch + 1);
    });
  });

  describe('onEditorDestroy', () => {
    it('should call onEditorDestroy when component unmounts', async () => {
      const onReady = vi.fn();
      const onEditorDestroy = vi.fn();
      const { unmount } = render(() => <SuperDocEditor onReady={onReady} onEditorDestroy={onEditorDestroy} />);

      await waitFor(
        () => {
          expect(onReady).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );

      unmount();

      await waitFor(
        () => {
          expect(onEditorDestroy).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );
    });
  });

  describe('error states', () => {
    it('should show error container when initialization fails', async () => {
      // Force an error by providing an invalid document
      const onException = vi.fn();
      const { container } = render(() => (
        <SuperDocEditor document={'not-a-valid-doc' as unknown as File} onException={onException} />
      ));

      await waitFor(
        () => {
          const errorContainer = container.querySelector('.superdoc-error-container');
          // If SuperDoc throws on invalid input, error UI shows
          // If SuperDoc handles it gracefully, onException may be called instead
          expect(errorContainer || onException.mock.calls.length > 0).toBeTruthy();
        },
        { timeout: 5000 },
      );
    });
  });

  skipWithReason('no <StrictMode /> in SolidJS').describe('Strict Mode compatibility', () => {
    it('should not throw in Strict Mode', () => {});
  });

  describe('prop stability (SD-2635)', () => {
    it('does not destroy/re-init when user prop is a new object literal with identical content', async () => {
      let ref: SuperDocRef | undefined;
      const onReady = vi.fn();
      const onEditorDestroy = vi.fn();
      const [user, setUser] = createSignal({ name: 'Alex', email: 'alex@example.com' });

      render(() => <SuperDocEditor ref={ref} user={user()} onReady={onReady} onEditorDestroy={onEditorDestroy} />);

      await waitFor(() => expect(onReady).toHaveBeenCalled(), { timeout: 5000 });
      const instanceBefore = ref?.getInstance();
      expect(instanceBefore).toBeTruthy();

      // Solid users would usually keep object updates fine-grained with createStore.
      // The user prop compares fields to protect equal replacement objects.
      setUser({ name: 'Alex', email: 'alex@example.com' });

      // Same underlying instance proves no destroy+rebuild happened.
      expect(ref?.getInstance()).toBe(instanceBefore);
      expect(onEditorDestroy).not.toHaveBeenCalled();
    });

    it('does not destroy/re-init when users prop is a new array literal with identical content', async () => {
      let ref: SuperDocRef | undefined;
      const onReady = vi.fn();
      const onEditorDestroy = vi.fn();
      const [users, setUsers] = createSignal([{ name: 'Alex', email: 'alex@example.com' }]);

      render(() => <SuperDocEditor ref={ref} users={users()} onReady={onReady} onEditorDestroy={onEditorDestroy} />);

      await waitFor(() => expect(onReady).toHaveBeenCalled(), { timeout: 5000 });
      const instanceBefore = ref?.getInstance();

      // Solid users would usually keep object updates fine-grained with createStore.
      // The users prop compares fields to protect equal replacement objects.
      setUsers([{ name: 'Alex', email: 'alex@example.com' }]);

      expect(ref?.getInstance()).toBe(instanceBefore);
      expect(onEditorDestroy).not.toHaveBeenCalled();
    });

    it('rebuilds and remounts a new instance when user prop value actually changes', async () => {
      let ref: SuperDocRef | undefined;
      const onReady = vi.fn();
      const onEditorDestroy = vi.fn();
      const [user, setUser] = createSignal({ name: 'Alex', email: 'alex@example.com' });

      render(() => <SuperDocEditor ref={ref} user={user()} onReady={onReady} onEditorDestroy={onEditorDestroy} />);

      await waitFor(() => expect(onReady).toHaveBeenCalled(), { timeout: 5000 });
      const instanceBefore = ref?.getInstance();

      setUser({ name: 'Jamie', email: 'jamie@example.com' });

      // Old instance torn down, new instance ready.
      await waitFor(() => expect(onEditorDestroy).toHaveBeenCalled(), { timeout: 5000 });
      await waitFor(() => expect(onReady).toHaveBeenCalledTimes(2), { timeout: 5000 });
      expect(ref?.getInstance()).not.toBe(instanceBefore);
    });

    skipWithReason('SolidJS has no double-invocation and no <StrictMode />').it(
      'stays stable under StrictMode double-invocation on rerender',
      () => {},
    );

    skipWithReason('SolidJS has no <StrictMode />').it(
      'still rebuilds under StrictMode when user prop value actually changes',
      () => {},
    );

    it('rebuilds when a new modules object is passed, even if content looks equal', async () => {
      // `modules` is intentionally kept on reference identity in the dep
      // array because it can carry functions and live objects that a
      // structural compare would miss. This test pins that contract —
      // if a future refactor wraps `modules` in useStructuralMemo, this
      // test will fail and flag the regression.
      let ref: SuperDocRef | undefined;
      const onReady = vi.fn();
      const onEditorDestroy = vi.fn();
      const [modules, setModules] = createSignal({ comments: { visible: true } });

      render(() => (
        <SuperDocEditor ref={ref} modules={modules()} onReady={onReady} onEditorDestroy={onEditorDestroy} />
      ));

      await waitFor(() => expect(onReady).toHaveBeenCalled(), { timeout: 5000 });
      const instanceBefore = ref?.getInstance();

      setModules({ comments: { visible: true } });

      await waitFor(() => expect(onEditorDestroy).toHaveBeenCalled(), { timeout: 5000 });
      await waitFor(() => expect(onReady).toHaveBeenCalledTimes(2), { timeout: 5000 });
      expect(ref?.getInstance()).not.toBe(instanceBefore);
    });
  });

  describe('unique IDs', () => {
    it('should generate unique container IDs for multiple instances', () => {
      const { container: container1 } = render(() => <SuperDocEditor />);
      const { container: container2 } = render(() => <SuperDocEditor />);

      const id1 = container1.querySelector('.superdoc-editor-container')?.id;
      const id2 = container2.querySelector('.superdoc-editor-container')?.id;

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });
  });

  describe('with real superdoc', () => {
    it('should initialize superdoc instance', async () => {
      let ref: SuperDocRef | undefined;
      const onReady = vi.fn();

      render(() => <SuperDocEditor ref={ref} onReady={onReady} />);

      await waitFor(
        () => {
          expect(onReady).toHaveBeenCalled();
          expect(ref?.getInstance()).not.toBeNull();
        },
        { timeout: 5000 },
      );
    });

    it('should provide access to superdoc methods after ready', async () => {
      let ref: SuperDocRef | undefined;
      const onReady = vi.fn();

      render(() => <SuperDocEditor ref={ref} onReady={onReady} />);

      await waitFor(
        () => {
          expect(onReady).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );

      const instance = ref?.getInstance();
      expect(instance).toBeTruthy();
      expect(typeof instance?.destroy).toBe('function');
      expect(typeof instance?.setDocumentMode).toBe('function');
    });
  });
});
