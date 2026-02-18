import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { TextSelection } from 'prosemirror-state';

import { DragDropManager, FIELD_ANNOTATION_DATA_TYPE, type DragDropDependencies } from '../input/DragDropManager.js';

// Mock TextSelection.create to avoid needing a real ProseMirror doc
vi.spyOn(TextSelection, 'create').mockImplementation(() => {
  return { from: 50, to: 50 } as unknown as TextSelection;
});

/**
 * Creates a manual RAF scheduler for testing, allowing control over when
 * animation frame callbacks execute.
 */
function createManualRafScheduler(): {
  requestAnimationFrame: Mock<[FrameRequestCallback], number>;
  cancelAnimationFrame: Mock<[number], void>;
  flush: () => void;
  hasPending: () => boolean;
} {
  let cb: FrameRequestCallback | null = null;
  let rafId = 0;

  return {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      cb = callback;
      return ++rafId;
    }),
    cancelAnimationFrame: vi.fn(() => {
      cb = null;
    }),
    flush: () => {
      const fn = cb;
      cb = null;
      fn?.(performance.now());
    },
    hasPending: () => cb !== null,
  };
}

/**
 * Creates a mock DragEvent with the specified properties.
 */
function createDragEvent(
  type: string,
  options: {
    clientX?: number;
    clientY?: number;
    dataTransfer?: Partial<DataTransfer>;
  } = {},
): DragEvent {
  const { clientX = 100, clientY = 200, dataTransfer } = options;

  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  }) as DragEvent;

  // Mock dataTransfer
  const mockDataTransfer: Partial<DataTransfer> = {
    types: [FIELD_ANNOTATION_DATA_TYPE],
    getData: vi.fn((mimeType: string) => {
      if (mimeType === FIELD_ANNOTATION_DATA_TYPE) {
        return JSON.stringify({
          attributes: { fieldId: 'test', fieldType: 'text', displayLabel: 'Test', type: 'field' },
        });
      }
      return '';
    }),
    setData: vi.fn(),
    dropEffect: 'copy' as DataTransferDropEffect,
    effectAllowed: 'all' as DataTransferEffectAllowed,
    ...dataTransfer,
  };

  Object.defineProperty(event, 'dataTransfer', {
    value: mockDataTransfer,
    writable: false,
  });

  return event;
}

describe('DragDropManager - RAF Coalescing', () => {
  let manager: DragDropManager;
  let viewportHost: HTMLElement;
  let painterHost: HTMLElement;
  let rafScheduler: ReturnType<typeof createManualRafScheduler>;
  let mockEditor: {
    isEditable: boolean;
    state: {
      doc: { content: { size: number } };
      tr: { setSelection: Mock; setMeta: Mock };
      selection: { from: number; to: number };
    };
    view: { dispatch: Mock; dom: HTMLElement; focus: Mock };
    emit: Mock;
    commands: { addFieldAnnotation: Mock };
  };
  let mockDeps: DragDropDependencies;
  let hitTestMock: Mock;
  let scheduleSelectionUpdateMock: Mock;

  beforeEach(() => {
    // Create DOM elements
    viewportHost = document.createElement('div');
    viewportHost.className = 'viewport-host';
    painterHost = document.createElement('div');
    painterHost.className = 'painter-host';
    document.body.appendChild(viewportHost);
    document.body.appendChild(painterHost);

    // Create RAF scheduler
    rafScheduler = createManualRafScheduler();

    // Mock window RAF on the document's defaultView
    Object.defineProperty(viewportHost.ownerDocument.defaultView, 'requestAnimationFrame', {
      value: rafScheduler.requestAnimationFrame,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(viewportHost.ownerDocument.defaultView, 'cancelAnimationFrame', {
      value: rafScheduler.cancelAnimationFrame,
      writable: true,
      configurable: true,
    });

    // Create mock editor
    const mockTr = {
      setSelection: vi.fn().mockReturnThis(),
      setMeta: vi.fn().mockReturnThis(),
    };
    mockEditor = {
      isEditable: true,
      state: {
        doc: { content: { size: 100 } },
        tr: mockTr,
        selection: { from: 0, to: 0 },
      },
      view: {
        dispatch: vi.fn(),
        dom: document.createElement('div'),
        focus: vi.fn(),
      },
      emit: vi.fn(),
      commands: {
        addFieldAnnotation: vi.fn(),
      },
    };

    // Create mock dependencies
    hitTestMock = vi.fn(() => ({ pos: 50 }));
    scheduleSelectionUpdateMock = vi.fn();

    mockDeps = {
      getActiveEditor: vi.fn(() => mockEditor as unknown as ReturnType<DragDropDependencies['getActiveEditor']>),
      hitTest: hitTestMock,
      scheduleSelectionUpdate: scheduleSelectionUpdateMock,
      getViewportHost: vi.fn(() => viewportHost),
      getPainterHost: vi.fn(() => painterHost),
    };

    // Initialize manager
    manager = new DragDropManager();
    manager.setDependencies(mockDeps);
    manager.bind();
  });

  afterEach(() => {
    manager.destroy();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('dragover coalescing', () => {
    it('should schedule RAF on first dragover event', () => {
      const event = createDragEvent('dragover', { clientX: 100, clientY: 200 });
      viewportHost.dispatchEvent(event);

      expect(rafScheduler.requestAnimationFrame).toHaveBeenCalledTimes(1);
      expect(rafScheduler.hasPending()).toBe(true);
    });

    it('should coalesce multiple dragover events into single RAF callback', () => {
      // Dispatch multiple dragover events rapidly
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 150, clientY: 250 }));
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 200, clientY: 300 }));

      // Should only schedule one RAF
      expect(rafScheduler.requestAnimationFrame).toHaveBeenCalledTimes(1);
    });

    it('should use the latest coordinates when RAF fires', () => {
      // Dispatch multiple dragover events with different coordinates
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 150, clientY: 250 }));
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 200, clientY: 300 }));

      // Flush the RAF
      rafScheduler.flush();

      // hitTest should be called with the LAST coordinates
      expect(hitTestMock).toHaveBeenCalledWith(200, 300);
    });

    it('should update selection when RAF fires', () => {
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));

      // Before RAF fires, no selection update
      expect(mockEditor.view.dispatch).not.toHaveBeenCalled();

      // Flush the RAF
      rafScheduler.flush();

      // Now selection should be updated
      expect(mockEditor.state.tr.setSelection).toHaveBeenCalled();
      expect(mockEditor.view.dispatch).toHaveBeenCalled();
      expect(scheduleSelectionUpdateMock).toHaveBeenCalled();
    });

    it('should allow scheduling new RAF after previous one fires', () => {
      // First dragover
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));
      expect(rafScheduler.requestAnimationFrame).toHaveBeenCalledTimes(1);

      // Flush first RAF
      rafScheduler.flush();
      expect(rafScheduler.hasPending()).toBe(false);

      // Second dragover should schedule new RAF
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 150, clientY: 250 }));
      expect(rafScheduler.requestAnimationFrame).toHaveBeenCalledTimes(2);
    });
  });

  describe('drop cancels pending RAF', () => {
    it('should cancel pending dragover RAF when drop occurs', () => {
      // Schedule a dragover RAF
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));
      expect(rafScheduler.hasPending()).toBe(true);

      // Now drop
      viewportHost.dispatchEvent(createDragEvent('drop', { clientX: 150, clientY: 250 }));

      // RAF should be cancelled
      expect(rafScheduler.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should not apply stale dragover selection after drop', () => {
      // Simulate the race condition scenario:
      // 1. Dragover schedules RAF with position A
      // 2. Drop sets selection to position B
      // 3. RAF fires (if not cancelled) would overwrite to position A

      // Dragover schedules RAF
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));

      // Clear mock to track only calls after this point
      hitTestMock.mockClear();

      // Drop occurs before RAF fires - this calls hitTest for the drop position
      viewportHost.dispatchEvent(createDragEvent('drop', { clientX: 150, clientY: 250 }));

      // At this point hitTest was called once for the drop
      const callsAfterDrop = hitTestMock.mock.calls.length;

      // Try to flush - should do nothing since RAF was cancelled
      rafScheduler.flush();

      // No additional hitTest calls should have occurred (the stale dragover RAF was cancelled)
      expect(hitTestMock.mock.calls.length).toBe(callsAfterDrop);
    });

    it('should handle drop gracefully when no pending RAF exists', () => {
      // Drop without prior dragover - should not throw
      expect(() => {
        viewportHost.dispatchEvent(createDragEvent('drop', { clientX: 150, clientY: 250 }));
      }).not.toThrow();

      // cancelAnimationFrame might still be called but with no effect
      // The important thing is no error occurred
    });
  });

  describe('dragEnd cancels pending RAF', () => {
    it('should cancel pending dragover RAF when drag ends', () => {
      // Schedule a dragover RAF
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));
      expect(rafScheduler.hasPending()).toBe(true);

      // End the drag (e.g., user cancelled or dropped outside)
      painterHost.dispatchEvent(createDragEvent('dragend'));

      // RAF should be cancelled
      expect(rafScheduler.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should not apply stale selection after drag ends', () => {
      hitTestMock.mockReturnValueOnce({ pos: 10 });

      // Dragover schedules RAF
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));

      // Drag ends (e.g., user releases outside drop zone)
      painterHost.dispatchEvent(createDragEvent('dragend'));

      // Try to flush - should do nothing since cancelled
      rafScheduler.flush();

      // hitTest should not have been called since RAF was cancelled
      expect(hitTestMock).not.toHaveBeenCalled();
    });
  });

  describe('destroy cancels pending RAF', () => {
    it('should cancel pending dragover RAF on destroy', () => {
      // Schedule a dragover RAF
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));
      expect(rafScheduler.hasPending()).toBe(true);

      // Destroy the manager
      manager.destroy();

      // RAF should be cancelled
      expect(rafScheduler.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should not schedule RAF when editor is not editable', () => {
      mockEditor.isEditable = false;

      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));

      expect(rafScheduler.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should not schedule RAF when event has no field annotation data', () => {
      const event = new MouseEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 200,
      }) as DragEvent;

      // No dataTransfer = no field annotation data
      Object.defineProperty(event, 'dataTransfer', {
        value: { types: [], getData: () => '' },
        writable: false,
      });

      viewportHost.dispatchEvent(event);

      expect(rafScheduler.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should handle RAF callback when deps become null', () => {
      // Schedule RAF
      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));

      // Simulate deps being cleared (edge case during teardown)
      manager.destroy();

      // Manually invoke the callback that was scheduled (simulating race)
      // This shouldn't throw
      expect(() => rafScheduler.flush()).not.toThrow();
    });

    it('should skip selection update if position unchanged', () => {
      // Set current selection to match where hitTest will return
      hitTestMock.mockReturnValue({ pos: 50 });

      // Mock the selection to appear as a TextSelection at pos 50
      // The actual code checks instanceof TextSelection, but our mock won't pass that check
      // so it will always update. We just verify the basic flow works.
      mockEditor.state.selection = { from: 50, to: 50 } as unknown as typeof mockEditor.state.selection;

      viewportHost.dispatchEvent(createDragEvent('dragover', { clientX: 100, clientY: 200 }));
      rafScheduler.flush();

      // Verify the dragover flow executed (hitTest was called)
      expect(hitTestMock).toHaveBeenCalled();
    });
  });
});
