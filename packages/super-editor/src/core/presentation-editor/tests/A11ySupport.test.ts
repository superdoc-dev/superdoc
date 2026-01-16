import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { EditorState } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';

import {
  syncHiddenEditorA11yAttributes,
  scheduleA11ySelectionAnnouncement,
  computeA11ySelectionAnnouncement,
} from '../A11ySupport.js';

describe('syncHiddenEditorA11yAttributes', () => {
  let pmDom: HTMLElement;

  beforeEach(() => {
    pmDom = document.createElement('div');
  });

  it('sets tabindex to 0 if not already present', () => {
    syncHiddenEditorA11yAttributes(pmDom, 'editing');
    expect(pmDom.tabIndex).toBe(0);
  });

  it('preserves existing tabindex attribute', () => {
    pmDom.tabIndex = 2;
    pmDom.setAttribute('tabindex', '2');
    syncHiddenEditorA11yAttributes(pmDom, 'editing');
    expect(pmDom.tabIndex).toBe(2);
  });

  it('sets role to textbox if not already present', () => {
    syncHiddenEditorA11yAttributes(pmDom, 'editing');
    expect(pmDom.getAttribute('role')).toBe('textbox');
  });

  it('preserves existing role attribute', () => {
    pmDom.setAttribute('role', 'document');
    syncHiddenEditorA11yAttributes(pmDom, 'editing');
    expect(pmDom.getAttribute('role')).toBe('document');
  });

  it('sets aria-multiline to true if not already present', () => {
    syncHiddenEditorA11yAttributes(pmDom, 'editing');
    expect(pmDom.getAttribute('aria-multiline')).toBe('true');
  });

  it('preserves existing aria-multiline attribute', () => {
    pmDom.setAttribute('aria-multiline', 'false');
    syncHiddenEditorA11yAttributes(pmDom, 'editing');
    expect(pmDom.getAttribute('aria-multiline')).toBe('false');
  });

  it('sets aria-label to "Document content area" if not already present', () => {
    syncHiddenEditorA11yAttributes(pmDom, 'editing');
    expect(pmDom.getAttribute('aria-label')).toBe('Document content area');
  });

  it('preserves existing aria-label attribute', () => {
    pmDom.setAttribute('aria-label', 'Custom label');
    syncHiddenEditorA11yAttributes(pmDom, 'editing');
    expect(pmDom.getAttribute('aria-label')).toBe('Custom label');
  });

  it('sets aria-readonly to false when documentMode is "editing"', () => {
    syncHiddenEditorA11yAttributes(pmDom, 'editing');
    expect(pmDom.getAttribute('aria-readonly')).toBe('false');
  });

  it('sets aria-readonly to false when documentMode is "suggesting"', () => {
    syncHiddenEditorA11yAttributes(pmDom, 'suggesting');
    expect(pmDom.getAttribute('aria-readonly')).toBe('false');
  });

  it('sets aria-readonly to true when documentMode is "viewing"', () => {
    syncHiddenEditorA11yAttributes(pmDom, 'viewing');
    expect(pmDom.getAttribute('aria-readonly')).toBe('true');
  });

  it('updates aria-readonly even if previously set', () => {
    pmDom.setAttribute('aria-readonly', 'true');
    syncHiddenEditorA11yAttributes(pmDom, 'editing');
    expect(pmDom.getAttribute('aria-readonly')).toBe('false');
  });

  it('handles non-HTMLElement input gracefully', () => {
    const notAnElement = { nodeType: 1 };
    expect(() => syncHiddenEditorA11yAttributes(notAnElement, 'editing')).not.toThrow();
  });

  it('handles null input gracefully', () => {
    expect(() => syncHiddenEditorA11yAttributes(null, 'editing')).not.toThrow();
  });

  it('handles undefined input gracefully', () => {
    expect(() => syncHiddenEditorA11yAttributes(undefined, 'editing')).not.toThrow();
  });
});

describe('scheduleA11ySelectionAnnouncement', () => {
  let ariaLiveRegion: HTMLElement;
  let visibleHost: HTMLElement;
  let announceNow: ReturnType<typeof vi.fn>;
  let currentTimeout: number | null;

  beforeEach(() => {
    ariaLiveRegion = document.createElement('div');
    visibleHost = document.createElement('div');
    announceNow = vi.fn();
    currentTimeout = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('schedules announcement with 150ms delay by default', () => {
    const deps = {
      ariaLiveRegion,
      sessionMode: 'body' as const,
      isDragging: false,
      visibleHost,
      currentTimeout,
      announceNow,
    };

    const timeoutId = scheduleA11ySelectionAnnouncement(deps);

    expect(timeoutId).not.toBeNull();
    expect(announceNow).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);

    expect(announceNow).toHaveBeenCalledTimes(1);
  });

  it('schedules announcement immediately when immediate option is true', () => {
    const deps = {
      ariaLiveRegion,
      sessionMode: 'body' as const,
      isDragging: false,
      visibleHost,
      currentTimeout,
      announceNow,
    };

    const timeoutId = scheduleA11ySelectionAnnouncement(deps, { immediate: true });

    expect(timeoutId).not.toBeNull();

    vi.advanceTimersByTime(0);

    expect(announceNow).toHaveBeenCalledTimes(1);
  });

  it('clears previous timeout when scheduling new announcement', () => {
    const deps = {
      ariaLiveRegion,
      sessionMode: 'body' as const,
      isDragging: false,
      visibleHost,
      currentTimeout: 123 as unknown as number,
      announceNow,
    };

    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    scheduleA11ySelectionAnnouncement(deps);

    expect(clearTimeoutSpy).toHaveBeenCalledWith(123);
  });

  it('returns currentTimeout unchanged when ariaLiveRegion is null', () => {
    const deps = {
      ariaLiveRegion: null,
      sessionMode: 'body' as const,
      isDragging: false,
      visibleHost,
      currentTimeout: 456 as unknown as number,
      announceNow,
    };

    const timeoutId = scheduleA11ySelectionAnnouncement(deps);

    expect(timeoutId).toBe(456);
    expect(announceNow).not.toHaveBeenCalled();
  });

  it('returns currentTimeout unchanged when sessionMode is "header"', () => {
    const deps = {
      ariaLiveRegion,
      sessionMode: 'header' as const,
      isDragging: false,
      visibleHost,
      currentTimeout: 789 as unknown as number,
      announceNow,
    };

    const timeoutId = scheduleA11ySelectionAnnouncement(deps);

    expect(timeoutId).toBe(789);
    expect(announceNow).not.toHaveBeenCalled();
  });

  it('returns currentTimeout unchanged when sessionMode is "footer"', () => {
    const deps = {
      ariaLiveRegion,
      sessionMode: 'footer' as const,
      isDragging: false,
      visibleHost,
      currentTimeout: 999 as unknown as number,
      announceNow,
    };

    const timeoutId = scheduleA11ySelectionAnnouncement(deps);

    expect(timeoutId).toBe(999);
    expect(announceNow).not.toHaveBeenCalled();
  });

  it('returns currentTimeout unchanged when isDragging is true and immediate is false', () => {
    const deps = {
      ariaLiveRegion,
      sessionMode: 'body' as const,
      isDragging: true,
      visibleHost,
      currentTimeout: 111 as unknown as number,
      announceNow,
    };

    const timeoutId = scheduleA11ySelectionAnnouncement(deps);

    expect(timeoutId).toBe(111);
    expect(announceNow).not.toHaveBeenCalled();
  });

  it('schedules announcement when isDragging is true but immediate is true', () => {
    const deps = {
      ariaLiveRegion,
      sessionMode: 'body' as const,
      isDragging: true,
      visibleHost,
      currentTimeout: null,
      announceNow,
    };

    const timeoutId = scheduleA11ySelectionAnnouncement(deps, { immediate: true });

    expect(timeoutId).not.toBeNull();

    vi.advanceTimersByTime(0);

    expect(announceNow).toHaveBeenCalledTimes(1);
  });

  it('uses window from visibleHost.ownerDocument.defaultView when available', () => {
    const customWindow = {
      setTimeout: vi.fn((callback: () => void, delay: number) => {
        return window.setTimeout(callback, delay);
      }),
    };

    const customDocument = {
      defaultView: customWindow,
    };

    visibleHost = {
      ownerDocument: customDocument,
    } as unknown as HTMLElement;

    const deps = {
      ariaLiveRegion,
      sessionMode: 'body' as const,
      isDragging: false,
      visibleHost,
      currentTimeout: null,
      announceNow,
    };

    scheduleA11ySelectionAnnouncement(deps);

    expect(customWindow.setTimeout).toHaveBeenCalled();
  });

  it('falls back to global window when visibleHost is null', () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    const deps = {
      ariaLiveRegion,
      sessionMode: 'body' as const,
      isDragging: false,
      visibleHost: null,
      currentTimeout: null,
      announceNow,
    };

    scheduleA11ySelectionAnnouncement(deps);

    expect(setTimeoutSpy).toHaveBeenCalled();
  });
});

describe('computeA11ySelectionAnnouncement', () => {
  it('returns null when editorState is null', () => {
    const result = computeA11ySelectionAnnouncement(null as unknown as EditorState);
    expect(result).toBeNull();
  });

  it('returns null when selection is null', () => {
    const editorState = {
      selection: null,
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);
    expect(result).toBeNull();
  });

  it('returns null when selection.from is not a number', () => {
    const editorState = {
      selection: {
        from: 'not a number',
        to: 10,
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);
    expect(result).toBeNull();
  });

  it('returns null when selection.to is not a number', () => {
    const editorState = {
      selection: {
        from: 5,
        to: 'not a number',
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);
    expect(result).toBeNull();
  });

  it('returns "Cursor moved." message when from equals to', () => {
    const editorState = {
      selection: {
        from: 10,
        to: 10,
      },
      doc: {
        textBetween: vi.fn(),
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.message).toBe('Cursor moved.');
    expect(result?.from).toBe(10);
    expect(result?.to).toBe(10);
    expect(result?.key).toBe('10:10:Cursor moved.');
  });

  it('returns "Table cells selected." message for CellSelection', () => {
    const mockCellSelection = Object.create(CellSelection.prototype) as CellSelection;
    Object.defineProperty(mockCellSelection, 'from', { value: 5, writable: true });
    Object.defineProperty(mockCellSelection, 'to', { value: 20, writable: true });

    const editorState = {
      selection: mockCellSelection,
      doc: {
        textBetween: vi.fn(),
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.message).toBe('Table cells selected.');
    expect(result?.from).toBe(5);
    expect(result?.to).toBe(20);
  });

  it('returns text snippet for text selection', () => {
    const editorState = {
      selection: {
        from: 10,
        to: 25,
      },
      doc: {
        textBetween: vi.fn((start: number, end: number) => {
          return 'Hello World Test';
        }),
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.message).toBe('Selected: Hello World Test');
    expect(result?.from).toBe(10);
    expect(result?.to).toBe(25);
    expect(result?.key).toContain('Selected: Hello World Test');
  });

  it('truncates long text selections to 256 characters', () => {
    const longText = 'A'.repeat(300);
    const editorState = {
      selection: {
        from: 0,
        to: 300,
      },
      doc: {
        textBetween: vi.fn((start: number, end: number) => {
          return longText.substring(start, end);
        }),
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.message).toContain('…');
    expect(result?.message.length).toBeLessThan(270); // "Selected: " + 256 chars + "…"
  });

  it('normalizes whitespace in text snippets', () => {
    const editorState = {
      selection: {
        from: 10,
        to: 30,
      },
      doc: {
        textBetween: vi.fn(() => 'Hello\n\n\nWorld\t\tTest   Multiple   Spaces'),
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.message).toBe('Selected: Hello World Test Multiple Spaces');
  });

  it('handles backward selections (to < from)', () => {
    const editorState = {
      selection: {
        from: 25,
        to: 10,
      },
      doc: {
        textBetween: vi.fn(() => 'Backward text'),
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.from).toBe(25);
    expect(result?.to).toBe(10);
    expect(result?.message).toContain('Backward text');
  });

  it('returns "Selection updated." when textBetween fails', () => {
    const editorState = {
      selection: {
        from: 10,
        to: 25,
      },
      doc: {
        textBetween: vi.fn(() => {
          throw new Error('Document error');
        }),
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.message).toBe('Selection updated.');
  });

  it('returns "Selection updated." when snippet is empty after trimming', () => {
    const editorState = {
      selection: {
        from: 10,
        to: 25,
      },
      doc: {
        textBetween: vi.fn(() => '   \n\n   \t\t   '),
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.message).toBe('Selection updated.');
  });

  it('returns "Selection updated." when doc.textBetween is not a function', () => {
    const editorState = {
      selection: {
        from: 10,
        to: 25,
      },
      doc: {
        textBetween: 'not a function',
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.message).toBe('Selection updated.');
  });

  it('returns "Selection updated." when doc is missing', () => {
    const editorState = {
      selection: {
        from: 10,
        to: 25,
      },
      doc: null,
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.message).toBe('Selection updated.');
  });

  it('generates unique key for each announcement', () => {
    const editorState1 = {
      selection: { from: 10, to: 10 },
      doc: { textBetween: vi.fn() },
    } as unknown as EditorState;

    const editorState2 = {
      selection: { from: 15, to: 15 },
      doc: { textBetween: vi.fn() },
    } as unknown as EditorState;

    const result1 = computeA11ySelectionAnnouncement(editorState1);
    const result2 = computeA11ySelectionAnnouncement(editorState2);

    expect(result1?.key).not.toBe(result2?.key);
  });

  it('handles negative positions by clamping to 0', () => {
    const editorState = {
      selection: {
        from: -5,
        to: 10,
      },
      doc: {
        textBetween: vi.fn((start: number, end: number) => {
          expect(start).toBeGreaterThanOrEqual(0);
          return 'Text';
        }),
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.from).toBe(-5); // Original values preserved in result
    expect(result?.to).toBe(10);
  });

  it('samples only first 256 characters of long selections', () => {
    const textBetweenMock = vi.fn((start: number, end: number) => {
      expect(end).toBeLessThanOrEqual(start + 256);
      return 'A'.repeat(256);
    });

    const editorState = {
      selection: {
        from: 0,
        to: 1000,
      },
      doc: {
        textBetween: textBetweenMock,
      },
    } as unknown as EditorState;

    computeA11ySelectionAnnouncement(editorState);

    expect(textBetweenMock).toHaveBeenCalledWith(0, 256, ' ', ' ');
  });

  it('appends ellipsis when sampleEnd is less than actual end', () => {
    const editorState = {
      selection: {
        from: 0,
        to: 500,
      },
      doc: {
        textBetween: vi.fn(() => 'A'.repeat(256)),
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.message).toContain('…');
  });

  it('does not append ellipsis when selection fits within 256 characters', () => {
    const editorState = {
      selection: {
        from: 0,
        to: 100,
      },
      doc: {
        textBetween: vi.fn(() => 'Short text'),
      },
    } as unknown as EditorState;

    const result = computeA11ySelectionAnnouncement(editorState);

    expect(result).not.toBeNull();
    expect(result?.message).not.toContain('…');
  });
});
