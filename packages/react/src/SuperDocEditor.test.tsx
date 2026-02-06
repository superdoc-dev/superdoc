import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { SuperDocEditor } from './SuperDocEditor';
import type { SuperDocRef } from './types';

describe('SuperDocEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('mounting and unmounting', () => {
    it('should render container elements', () => {
      const { container } = render(<SuperDocEditor />);

      expect(container.querySelector('.superdoc-wrapper')).toBeTruthy();
      expect(container.querySelector('.superdoc-editor-container')).toBeTruthy();
      expect(container.querySelector('.superdoc-toolbar-container')).toBeTruthy();
    });

    it('should hide toolbar when hideToolbar={true}', () => {
      const { container } = render(<SuperDocEditor hideToolbar />);

      expect(container.querySelector('.superdoc-toolbar-container')).toBeFalsy();
    });

    it('should apply className and style props', () => {
      const { container } = render(<SuperDocEditor className='custom-class' style={{ backgroundColor: 'red' }} />);

      const wrapper = container.querySelector('.superdoc-wrapper');
      expect(wrapper?.classList.contains('custom-class')).toBe(true);
      expect((wrapper as HTMLElement)?.style.backgroundColor).toBe('red');
    });

    it('should handle unmount without throwing', async () => {
      const onReady = vi.fn();
      const { unmount } = render(<SuperDocEditor onReady={onReady} />);

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
      const ref = createRef<SuperDocRef>();
      render(<SuperDocEditor ref={ref} />);

      // Ref should be available immediately with getInstance
      expect(ref.current).not.toBeNull();
      expect(typeof ref.current?.getInstance).toBe('function');
    });

    it('should return null from getInstance before ready', () => {
      const ref = createRef<SuperDocRef>();
      render(<SuperDocEditor ref={ref} />);

      // Before async init completes, getInstance returns null
      const instance = ref.current?.getInstance();
      expect(instance).toBeNull();
    });

    it('should safely handle calls through getInstance before ready', () => {
      const ref = createRef<SuperDocRef>();
      render(<SuperDocEditor ref={ref} />);

      // Using optional chaining through getInstance is safe
      expect(() => ref.current?.getInstance()?.focus()).not.toThrow();
      expect(() => ref.current?.getInstance()?.setDocumentMode('viewing')).not.toThrow();
      expect(() => ref.current?.getInstance()?.toggleRuler()).not.toThrow();
    });
  });

  describe('loading state', () => {
    it('should show loading content initially', () => {
      const { container } = render(
        <SuperDocEditor renderLoading={() => <div data-testid='loading'>Loading...</div>} />,
      );

      expect(container.querySelector('[data-testid="loading"]')).toBeTruthy();
    });
  });

  describe('callbacks', () => {
    it('should call onReady when SuperDoc is ready', async () => {
      const onReady = vi.fn();
      render(<SuperDocEditor onReady={onReady} />);

      await waitFor(
        () => {
          expect(onReady).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );
    });

    it('should call onEditorCreate when editor is created', async () => {
      const onEditorCreate = vi.fn();
      render(<SuperDocEditor onEditorCreate={onEditorCreate} />);

      await waitFor(
        () => {
          expect(onEditorCreate).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );
    });
  });

  describe('onEditorDestroy', () => {
    it('should call onEditorDestroy when component unmounts', async () => {
      const onReady = vi.fn();
      const onEditorDestroy = vi.fn();
      const { unmount } = render(<SuperDocEditor onReady={onReady} onEditorDestroy={onEditorDestroy} />);

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
      const { container } = render(
        <SuperDocEditor document={'not-a-valid-doc' as unknown as File} onException={onException} />,
      );

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

  describe('Strict Mode compatibility', () => {
    it('should not throw in Strict Mode', () => {
      expect(() => {
        render(
          <StrictMode>
            <SuperDocEditor />
          </StrictMode>,
        );
      }).not.toThrow();
    });
  });

  describe('unique IDs', () => {
    it('should generate unique container IDs for multiple instances', () => {
      const { container: container1 } = render(<SuperDocEditor />);
      const { container: container2 } = render(<SuperDocEditor />);

      const id1 = container1.querySelector('.superdoc-editor-container')?.id;
      const id2 = container2.querySelector('.superdoc-editor-container')?.id;

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });
  });

  describe('with real superdoc', () => {
    it('should initialize superdoc instance', async () => {
      const ref = createRef<SuperDocRef>();
      const onReady = vi.fn();

      render(<SuperDocEditor ref={ref} onReady={onReady} />);

      await waitFor(
        () => {
          expect(onReady).toHaveBeenCalled();
          expect(ref.current?.getInstance()).not.toBeNull();
        },
        { timeout: 5000 },
      );
    });

    it('should provide access to superdoc methods after ready', async () => {
      const ref = createRef<SuperDocRef>();
      const onReady = vi.fn();

      render(<SuperDocEditor ref={ref} onReady={onReady} />);

      await waitFor(
        () => {
          expect(onReady).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );

      const instance = ref.current?.getInstance();
      expect(instance).toBeTruthy();
      expect(typeof instance?.destroy).toBe('function');
      expect(typeof instance?.setDocumentMode).toBe('function');
    });
  });
});
