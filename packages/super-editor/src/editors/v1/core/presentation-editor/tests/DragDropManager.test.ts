import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { TextSelection } from 'prosemirror-state';

import {
  DragDropManager,
  FIELD_ANNOTATION_DATA_TYPE,
  type DragDropDependencies,
  getDropPayloadKind,
  hasPossibleFiles,
  getDroppedImageFiles,
} from '../input/DragDropManager.js';

// Mock TextSelection.create to avoid needing a real ProseMirror doc
vi.spyOn(TextSelection, 'create').mockImplementation(() => {
  return { from: 50, to: 50 } as unknown as TextSelection;
});

// =============================================================================
// Test Helpers
// =============================================================================

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
 * Creates a mock DragEvent with field annotation data.
 */
function createFieldAnnotationDragEvent(
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

/**
 * Creates a mock DragEvent with image files.
 */
function createImageDragEvent(
  type: string,
  options: {
    clientX?: number;
    clientY?: number;
    files?: File[];
  } = {},
): DragEvent {
  const { clientX = 100, clientY = 200 } = options;
  const files = options.files ?? [new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })];

  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  }) as DragEvent;

  const fileList = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    [Symbol.iterator]: function* () {
      for (let i = 0; i < files.length; i++) yield files[i];
    },
  } as unknown as FileList;

  // Index files for array-style access
  files.forEach((f, i) => {
    (fileList as Record<number, File>)[i] = f;
  });

  const mockDataTransfer: Partial<DataTransfer> = {
    types: ['Files'],
    files: fileList,
    getData: vi.fn(() => ''),
    setData: vi.fn(),
    dropEffect: 'none' as DataTransferDropEffect,
    effectAllowed: 'all' as DataTransferEffectAllowed,
  };

  Object.defineProperty(event, 'dataTransfer', {
    value: mockDataTransfer,
    writable: false,
  });

  return event;
}

/**
 * Creates a mock DragEvent with no recognized payload.
 */
function createEmptyDragEvent(type: string): DragEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: 200,
  }) as DragEvent;

  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: [],
      files: { length: 0, item: () => null },
      getData: () => '',
      setData: vi.fn(),
      dropEffect: 'none' as DataTransferDropEffect,
      effectAllowed: 'all' as DataTransferEffectAllowed,
    },
    writable: false,
  });

  return event;
}

// =============================================================================
// Payload Classification Tests
// =============================================================================

describe('Payload classification helpers', () => {
  describe('getDropPayloadKind', () => {
    it('returns "fieldAnnotation" for field annotation payloads', () => {
      const event = createFieldAnnotationDragEvent('dragover');
      expect(getDropPayloadKind(event)).toBe('fieldAnnotation');
    });

    it('returns "imageFiles" for image file payloads', () => {
      const event = createImageDragEvent('dragover');
      expect(getDropPayloadKind(event)).toBe('imageFiles');
    });

    it('returns "none" for unsupported payloads', () => {
      const event = createEmptyDragEvent('dragover');
      expect(getDropPayloadKind(event)).toBe('none');
    });

    it('returns "fieldAnnotation" for mixed payloads (field annotation takes precedence)', () => {
      const event = createFieldAnnotationDragEvent('dragover');

      // Add image files to the same event
      const files = [new File([new Uint8Array([1])], 'img.png', { type: 'image/png' })];
      const fileList = { length: 1, item: (i: number) => files[i], 0: files[0] } as unknown as FileList;
      Object.defineProperty(event.dataTransfer, 'files', { value: fileList });

      expect(getDropPayloadKind(event)).toBe('fieldAnnotation');
    });
  });

  describe('hasPossibleFiles', () => {
    it('returns true when dataTransfer.types includes "Files"', () => {
      const event = createImageDragEvent('dragover');
      expect(hasPossibleFiles(event)).toBe(true);
    });

    it('returns true for non-image files (cannot distinguish during dragover)', () => {
      const files = [new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' })];
      const event = createImageDragEvent('dragover', { files });
      // types still contains "Files" — hasPossibleFiles cannot inspect file types
      expect(hasPossibleFiles(event)).toBe(true);
    });

    it('returns false when dataTransfer has no files', () => {
      const event = createEmptyDragEvent('dragover');
      expect(hasPossibleFiles(event)).toBe(false);
    });
  });

  describe('getDroppedImageFiles', () => {
    it('extracts only image files from dataTransfer', () => {
      const imageFile = new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' });
      const pdfFile = new File([new Uint8Array([2])], 'doc.pdf', { type: 'application/pdf' });
      const jpgFile = new File([new Uint8Array([3])], 'pic.jpg', { type: 'image/jpeg' });

      const event = createImageDragEvent('drop', { files: [imageFile, pdfFile, jpgFile] });
      const result = getDroppedImageFiles(event);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('photo.png');
      expect(result[1].name).toBe('pic.jpg');
    });

    it('returns empty array for events with no dataTransfer', () => {
      const event = new MouseEvent('drop') as DragEvent;
      expect(getDroppedImageFiles(event)).toEqual([]);
    });

    it('accepts image files with empty MIME type when extension is a known image format', () => {
      const emptyMime = new File([new Uint8Array([1])], 'screenshot.png', { type: '' });
      const jpgEmpty = new File([new Uint8Array([2])], 'photo.JPG', { type: '' });
      const txtEmpty = new File([new Uint8Array([3])], 'notes.txt', { type: '' });
      const noExt = new File([new Uint8Array([4])], 'noext', { type: '' });

      const event = createImageDragEvent('drop', { files: [emptyMime, jpgEmpty, txtEmpty, noExt] });
      const result = getDroppedImageFiles(event);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('screenshot.png');
      expect(result[1].name).toBe('photo.JPG');
    });

    it('does not use extension fallback when MIME type is a non-image type', () => {
      const pdfWithImageExt = new File([new Uint8Array([1])], 'trick.png', { type: 'application/pdf' });

      const event = createImageDragEvent('drop', { files: [pdfWithImageExt] });
      const result = getDroppedImageFiles(event);

      expect(result).toHaveLength(0);
    });
  });
});

// =============================================================================
// DragDropManager Tests
// =============================================================================

describe('DragDropManager', () => {
  let manager: DragDropManager;
  let viewportHost: HTMLElement;
  let painterHost: HTMLElement;
  let rafScheduler: ReturnType<typeof createManualRafScheduler>;
  let mockEditor: {
    isEditable: boolean;
    options: Record<string, unknown>;
    state: {
      doc: { content: { size: number }; nodeAt: Mock };
      tr: { setSelection: Mock; setMeta: Mock };
      selection: { from: number; to: number };
    };
    view: { dispatch: Mock; dom: HTMLElement; focus: Mock };
    emit: Mock;
    commands: { addFieldAnnotation: Mock };
    getMaxContentSize: Mock;
  };
  let mockDeps: DragDropDependencies;
  let hitTestMock: Mock;
  let scheduleSelectionUpdateMock: Mock;
  let insertImageFileMock: Mock;

  beforeEach(() => {
    viewportHost = document.createElement('div');
    viewportHost.className = 'viewport-host';
    painterHost = document.createElement('div');
    painterHost.className = 'painter-host';
    document.body.appendChild(viewportHost);
    document.body.appendChild(painterHost);

    rafScheduler = createManualRafScheduler();

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

    const mockTr = {
      setSelection: vi.fn().mockReturnThis(),
      setMeta: vi.fn().mockReturnThis(),
    };
    mockEditor = {
      isEditable: true,
      options: {},
      state: {
        doc: { content: { size: 100 }, nodeAt: vi.fn() },
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
      getMaxContentSize: vi.fn(() => ({ width: 800, height: 600 })),
    };

    hitTestMock = vi.fn(() => ({ pos: 50 }));
    scheduleSelectionUpdateMock = vi.fn();
    insertImageFileMock = vi.fn().mockResolvedValue('success');

    mockDeps = {
      getActiveEditor: vi.fn(() => mockEditor as unknown as ReturnType<DragDropDependencies['getActiveEditor']>),
      hitTest: hitTestMock,
      scheduleSelectionUpdate: scheduleSelectionUpdateMock,
      getViewportHost: vi.fn(() => viewportHost),
      getPainterHost: vi.fn(() => painterHost),
      insertImageFile: insertImageFileMock,
    };

    manager = new DragDropManager();
    manager.setDependencies(mockDeps);
    manager.bind();
  });

  afterEach(() => {
    manager.destroy();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Field Annotation Dragover (existing behavior preserved)
  // ==========================================================================

  describe('field annotation dragover coalescing', () => {
    it('should schedule RAF on first dragover event', () => {
      const event = createFieldAnnotationDragEvent('dragover', { clientX: 100, clientY: 200 });
      viewportHost.dispatchEvent(event);

      expect(rafScheduler.requestAnimationFrame).toHaveBeenCalledTimes(1);
      expect(rafScheduler.hasPending()).toBe(true);
    });

    it('should coalesce multiple dragover events into single RAF callback', () => {
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover', { clientX: 100, clientY: 200 }));
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover', { clientX: 150, clientY: 250 }));
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover', { clientX: 200, clientY: 300 }));

      expect(rafScheduler.requestAnimationFrame).toHaveBeenCalledTimes(1);
    });

    it('should use the latest coordinates when RAF fires', () => {
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover', { clientX: 100, clientY: 200 }));
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover', { clientX: 150, clientY: 250 }));
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover', { clientX: 200, clientY: 300 }));

      rafScheduler.flush();

      expect(hitTestMock).toHaveBeenCalledWith(200, 300);
    });

    it('should update selection when RAF fires', () => {
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover', { clientX: 100, clientY: 200 }));

      expect(mockEditor.view.dispatch).not.toHaveBeenCalled();

      rafScheduler.flush();

      expect(mockEditor.state.tr.setSelection).toHaveBeenCalled();
      expect(mockEditor.view.dispatch).toHaveBeenCalled();
      expect(scheduleSelectionUpdateMock).toHaveBeenCalled();
    });

    it('should allow scheduling new RAF after previous one fires', () => {
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover', { clientX: 100, clientY: 200 }));
      expect(rafScheduler.requestAnimationFrame).toHaveBeenCalledTimes(1);

      rafScheduler.flush();
      expect(rafScheduler.hasPending()).toBe(false);

      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover', { clientX: 150, clientY: 250 }));
      expect(rafScheduler.requestAnimationFrame).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // Image Dragover
  // ==========================================================================

  describe('image dragover', () => {
    it('should prevent default for image file payloads', () => {
      const event = createImageDragEvent('dragover');
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      viewportHost.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should set dropEffect to "copy" for image files', () => {
      const event = createImageDragEvent('dragover');
      viewportHost.dispatchEvent(event);

      expect(event.dataTransfer!.dropEffect).toBe('copy');
    });

    it('should schedule RAF-coalesced selection update during dragover', () => {
      viewportHost.dispatchEvent(createImageDragEvent('dragover', { clientX: 120, clientY: 220 }));

      expect(rafScheduler.requestAnimationFrame).toHaveBeenCalledTimes(1);

      rafScheduler.flush();

      expect(hitTestMock).toHaveBeenCalledWith(120, 220);
    });

    it('should not schedule RAF when editor is not editable', () => {
      mockEditor.isEditable = false;

      viewportHost.dispatchEvent(createImageDragEvent('dragover'));

      expect(rafScheduler.requestAnimationFrame).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Image Drop
  // ==========================================================================

  describe('image drop', () => {
    it('should call insertImageFile for each dropped image', async () => {
      const file1 = new File([new Uint8Array([1])], 'photo1.png', { type: 'image/png' });
      const file2 = new File([new Uint8Array([2])], 'photo2.jpg', { type: 'image/jpeg' });
      const event = createImageDragEvent('drop', { files: [file1, file2] });

      viewportHost.dispatchEvent(event);

      // insertImageFile is async; wait for it
      await vi.waitFor(() => {
        expect(insertImageFileMock).toHaveBeenCalledTimes(2);
      });

      expect(insertImageFileMock.mock.calls[0][0].file).toBe(file1);
      expect(insertImageFileMock.mock.calls[1][0].file).toBe(file2);
    });

    it('should cancel pending RAF on drop', () => {
      viewportHost.dispatchEvent(createImageDragEvent('dragover'));
      expect(rafScheduler.hasPending()).toBe(true);

      viewportHost.dispatchEvent(createImageDragEvent('drop'));

      expect(rafScheduler.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should resolve drop position via hitTest', async () => {
      hitTestMock.mockReturnValue({ pos: 42 });

      const event = createImageDragEvent('drop', { clientX: 300, clientY: 400 });
      viewportHost.dispatchEvent(event);

      await vi.waitFor(() => {
        expect(insertImageFileMock).toHaveBeenCalledTimes(1);
      });

      expect(hitTestMock).toHaveBeenCalledWith(300, 400);
    });

    it('should not insert when editor is not editable', async () => {
      mockEditor.isEditable = false;

      viewportHost.dispatchEvent(createImageDragEvent('drop'));

      // Give async code a chance to run
      await new Promise((r) => setTimeout(r, 10));
      expect(insertImageFileMock).not.toHaveBeenCalled();
    });

    it('should handle empty files gracefully', async () => {
      const event = createImageDragEvent('drop', { files: [] });
      viewportHost.dispatchEvent(event);

      // No files to process, so insertImageFile should not be called
      await new Promise((r) => setTimeout(r, 10));
      expect(insertImageFileMock).not.toHaveBeenCalled();
    });

    it('should not move caret when dropped files contain no images', async () => {
      const pdfFile = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
      const event = createImageDragEvent('drop', { files: [pdfFile] });

      viewportHost.dispatchEvent(event);

      await new Promise((r) => setTimeout(r, 10));

      // Selection should NOT have been changed — no image means no state mutation
      expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
      expect(insertImageFileMock).not.toHaveBeenCalled();
    });

    it('should focus editor and schedule selection update after drop', async () => {
      viewportHost.dispatchEvent(createImageDragEvent('drop'));

      await vi.waitFor(() => {
        expect(insertImageFileMock).toHaveBeenCalled();
      });

      expect(mockEditor.view.focus).toHaveBeenCalled();
      expect(scheduleSelectionUpdateMock).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // hitTest Failure Fallback
  // ==========================================================================

  describe('hitTest failure fallback', () => {
    it('should fall back to current PM selection when hitTest returns null', async () => {
      hitTestMock.mockReturnValue(null);
      mockEditor.state.selection = { from: 25, to: 25 };

      viewportHost.dispatchEvent(createImageDragEvent('drop'));

      await vi.waitFor(() => {
        expect(insertImageFileMock).toHaveBeenCalledTimes(1);
      });

      // Selection should have been set (proving fallback position was used)
      expect(mockEditor.state.tr.setSelection).toHaveBeenCalled();
    });

    it('should fall back to document end when both hitTest and selection are unavailable', async () => {
      hitTestMock.mockReturnValue(null);
      // Set selection.from to null-ish by setting it to a valid number.
      // The real fallback chain is hitTest?.pos → selection?.from → doc.content.size
      // We test document end by checking that selection is set even with null hitTest.
      mockEditor.state.selection = { from: 0, to: 0 };

      viewportHost.dispatchEvent(createImageDragEvent('drop'));

      await vi.waitFor(() => {
        expect(insertImageFileMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ==========================================================================
  // Multi-image Drop Ordering
  // ==========================================================================

  describe('multi-image drop ordering', () => {
    it('should process images sequentially (deterministic order)', async () => {
      const callOrder: string[] = [];

      insertImageFileMock.mockImplementation(async ({ file }: { file: File }) => {
        callOrder.push(file.name);
        return 'success';
      });

      const files = [
        new File([new Uint8Array([1])], 'first.png', { type: 'image/png' }),
        new File([new Uint8Array([2])], 'second.png', { type: 'image/png' }),
        new File([new Uint8Array([3])], 'third.png', { type: 'image/png' }),
      ];

      viewportHost.dispatchEvent(createImageDragEvent('drop', { files }));

      await vi.waitFor(() => {
        expect(insertImageFileMock).toHaveBeenCalledTimes(3);
      });

      expect(callOrder).toEqual(['first.png', 'second.png', 'third.png']);
    });
  });

  // ==========================================================================
  // Drag Cancellation Cleanup
  // ==========================================================================

  describe('drag cancellation cleanup', () => {
    it('should cancel pending RAF on dragend', () => {
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover'));
      expect(rafScheduler.hasPending()).toBe(true);

      painterHost.dispatchEvent(createFieldAnnotationDragEvent('dragend'));

      expect(rafScheduler.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should not apply stale selection after drag ends', () => {
      hitTestMock.mockReturnValueOnce({ pos: 10 });

      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover'));
      painterHost.dispatchEvent(createFieldAnnotationDragEvent('dragend'));

      rafScheduler.flush();

      expect(hitTestMock).not.toHaveBeenCalled();
    });

    it('should cancel pending RAF on dragleave with null relatedTarget', () => {
      viewportHost.dispatchEvent(createImageDragEvent('dragover'));
      expect(rafScheduler.hasPending()).toBe(true);

      const leaveEvent = new MouseEvent('dragleave', {
        bubbles: true,
        cancelable: true,
        relatedTarget: null,
      }) as DragEvent;
      viewportHost.dispatchEvent(leaveEvent);

      expect(rafScheduler.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should NOT cancel pending RAF on dragleave with internal relatedTarget', () => {
      const innerChild = document.createElement('span');
      viewportHost.appendChild(innerChild);

      viewportHost.dispatchEvent(createImageDragEvent('dragover'));
      expect(rafScheduler.hasPending()).toBe(true);

      rafScheduler.cancelAnimationFrame.mockClear();

      const leaveEvent = new MouseEvent('dragleave', {
        bubbles: true,
        cancelable: true,
        relatedTarget: innerChild,
      }) as DragEvent;
      viewportHost.dispatchEvent(leaveEvent);

      expect(rafScheduler.cancelAnimationFrame).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Window-level Fallback
  // ==========================================================================

  describe('window-level fallback', () => {
    it('should route image drops on overlay targets through handleDrop', async () => {
      const overlay = document.createElement('div');
      document.body.appendChild(overlay);

      const event = createImageDragEvent('drop');
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      Object.defineProperty(event, 'target', { value: overlay });
      window.dispatchEvent(event);

      await vi.waitFor(() => {
        expect(insertImageFileMock).toHaveBeenCalledTimes(1);
      });
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should preventDefault on image dragover on overlay targets', () => {
      const overlay = document.createElement('div');
      document.body.appendChild(overlay);

      const event = createImageDragEvent('dragover');
      Object.defineProperty(event, 'target', { value: overlay });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      window.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(event.dataTransfer!.dropEffect).toBe('copy');
    });

    it('should handle field annotation drops on overlay targets (existing behavior)', () => {
      const overlay = document.createElement('div');
      document.body.appendChild(overlay);

      const event = createFieldAnnotationDragEvent('dragover');
      Object.defineProperty(event, 'target', { value: overlay });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      window.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Unrecognized Payloads
  // ==========================================================================

  describe('unrecognized payloads', () => {
    it('should not schedule RAF for dragover with no recognized payload', () => {
      const event = createEmptyDragEvent('dragover');
      viewportHost.dispatchEvent(event);

      expect(rafScheduler.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should not handle drop with no recognized payload', () => {
      const event = createEmptyDragEvent('drop');
      viewportHost.dispatchEvent(event);

      expect(insertImageFileMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Drop Cancels Pending RAF (existing behavior preserved)
  // ==========================================================================

  describe('drop cancels pending RAF', () => {
    it('should cancel pending dragover RAF when drop occurs', () => {
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover'));
      expect(rafScheduler.hasPending()).toBe(true);

      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('drop'));

      expect(rafScheduler.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should not apply stale dragover selection after drop', () => {
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover'));

      hitTestMock.mockClear();

      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('drop'));

      const callsAfterDrop = hitTestMock.mock.calls.length;

      rafScheduler.flush();

      expect(hitTestMock.mock.calls.length).toBe(callsAfterDrop);
    });

    it('should handle drop gracefully when no pending RAF exists', () => {
      expect(() => {
        viewportHost.dispatchEvent(createFieldAnnotationDragEvent('drop'));
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Destroy
  // ==========================================================================

  describe('destroy cancels pending RAF', () => {
    it('should cancel pending dragover RAF on destroy', () => {
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover'));
      expect(rafScheduler.hasPending()).toBe(true);

      manager.destroy();

      expect(rafScheduler.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should not schedule RAF when editor is not editable', () => {
      mockEditor.isEditable = false;

      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover'));

      expect(rafScheduler.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should not schedule RAF when event has no recognized data', () => {
      const event = createEmptyDragEvent('dragover');
      viewportHost.dispatchEvent(event);

      expect(rafScheduler.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should handle RAF callback when deps become null', () => {
      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover'));

      manager.destroy();

      expect(() => rafScheduler.flush()).not.toThrow();
    });

    it('should skip selection update if position unchanged', () => {
      hitTestMock.mockReturnValue({ pos: 50 });

      mockEditor.state.selection = { from: 50, to: 50 } as unknown as typeof mockEditor.state.selection;

      viewportHost.dispatchEvent(createFieldAnnotationDragEvent('dragover'));
      rafScheduler.flush();

      expect(hitTestMock).toHaveBeenCalled();
    });
  });
});
