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

    it('should hide toolbar when toolbar={false}', () => {
      const { container } = render(<SuperDocEditor toolbar={false} />);

      expect(container.querySelector('.superdoc-toolbar-container')).toBeFalsy();
    });

    it('should apply className and style props', () => {
      const { container } = render(<SuperDocEditor className='custom-class' style={{ backgroundColor: 'red' }} />);

      const wrapper = container.querySelector('.superdoc-wrapper');
      expect(wrapper?.classList.contains('custom-class')).toBe(true);
      expect((wrapper as HTMLElement)?.style.backgroundColor).toBe('red');
    });

    it('should handle unmount without throwing', async () => {
      const { unmount } = render(<SuperDocEditor />);

      // Wait a bit for async initialization
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Unmount should not throw
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('ref methods', () => {
    it('should expose ref methods', () => {
      const ref = createRef<SuperDocRef>();
      render(<SuperDocEditor ref={ref} />);

      // Ref should be available immediately
      expect(ref.current).not.toBeNull();
      expect(typeof ref.current?.getInstance).toBe('function');
      expect(typeof ref.current?.setDocumentMode).toBe('function');
      expect(typeof ref.current?.export).toBe('function');
      expect(typeof ref.current?.getHTML).toBe('function');
      expect(typeof ref.current?.focus).toBe('function');
      expect(typeof ref.current?.search).toBe('function');
      expect(typeof ref.current?.setLocked).toBe('function');
      expect(typeof ref.current?.save).toBe('function');
      expect(typeof ref.current?.toggleRuler).toBe('function');
    });

    it('should return empty array from getHTML before ready', () => {
      const ref = createRef<SuperDocRef>();
      render(<SuperDocEditor ref={ref} />);

      // Before async init completes
      const result = ref.current?.getHTML();
      expect(result).toEqual([]);
    });

    it('should return empty array from search before ready', () => {
      const ref = createRef<SuperDocRef>();
      render(<SuperDocEditor ref={ref} />);

      // Before async init completes
      const result = ref.current?.search('test');
      expect(result).toEqual([]);
    });

    it('should not throw when calling methods before ready', () => {
      const ref = createRef<SuperDocRef>();
      render(<SuperDocEditor ref={ref} />);

      // All methods should be safe to call before initialization
      expect(() => ref.current?.focus()).not.toThrow();
      expect(() => ref.current?.setDocumentMode('viewing')).not.toThrow();
      expect(() => ref.current?.toggleRuler()).not.toThrow();
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
