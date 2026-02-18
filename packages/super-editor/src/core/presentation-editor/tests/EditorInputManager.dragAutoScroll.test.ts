import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EditorInputManager,
  type EditorInputDependencies,
  type EditorInputCallbacks,
} from '../pointer-events/EditorInputManager.js';

vi.mock('@superdoc/layout-bridge', () => ({
  clickToPosition: vi.fn(() => ({ pos: 5, layoutEpoch: 1, pageIndex: 0 })),
  getFragmentAtPosition: vi.fn(() => null),
}));

vi.mock('prosemirror-state', async (importOriginal) => {
  const original = await importOriginal<typeof import('prosemirror-state')>();
  return {
    ...original,
    TextSelection: {
      ...original.TextSelection,
      create: vi.fn(() => ({
        $from: { parent: { inlineContent: true } },
        empty: true,
      })),
    },
  };
});

describe('EditorInputManager - Drag Auto Scroll', () => {
  let manager: EditorInputManager;
  let viewportHost: HTMLElement;
  let visibleHost: HTMLElement;
  let scrollContainer: HTMLElement;
  let mockEditor: {
    isEditable: boolean;
    state: {
      doc: { content: { size: number } };
      tr: { setSelection: ReturnType<typeof vi.fn> };
      selection: { $anchor?: null };
      storedMarks?: unknown;
    };
    view: { dispatch: ReturnType<typeof vi.fn>; dom: HTMLElement; hasFocus: ReturnType<typeof vi.fn> };
    emit: ReturnType<typeof vi.fn>;
  };
  let mockDeps: EditorInputDependencies;
  let mockCallbacks: EditorInputCallbacks;
  let rafCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    rafCallback = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      rafCallback = null;
    });

    scrollContainer = document.createElement('div');
    scrollContainer.style.overflowY = 'auto';
    scrollContainer.style.height = '100px';

    visibleHost = document.createElement('div');
    visibleHost.className = 'presentation-editor';
    viewportHost = document.createElement('div');
    viewportHost.className = 'presentation-editor__viewport';
    visibleHost.appendChild(viewportHost);
    scrollContainer.appendChild(visibleHost);
    document.body.appendChild(scrollContainer);

    Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(scrollContainer, 'clientWidth', { value: 100, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 300, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollWidth', { value: 100, configurable: true });
    scrollContainer.scrollTop = 0;
    scrollContainer.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 100,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
      }) as DOMRect;

    viewportHost.setPointerCapture = vi.fn();
    viewportHost.releasePointerCapture = vi.fn();
    viewportHost.hasPointerCapture = vi.fn(() => true);

    mockEditor = {
      isEditable: true,
      state: {
        doc: { content: { size: 100 } },
        tr: { setSelection: vi.fn().mockReturnThis() },
        selection: { $anchor: null },
      },
      view: {
        dispatch: vi.fn(),
        dom: document.createElement('div'),
        hasFocus: vi.fn(() => true),
      },
      emit: vi.fn(),
    };

    mockDeps = {
      getActiveEditor: vi.fn(() => mockEditor as unknown as ReturnType<EditorInputDependencies['getActiveEditor']>),
      getEditor: vi.fn(() => mockEditor as unknown as ReturnType<EditorInputDependencies['getEditor']>),
      getLayoutState: vi.fn(() => ({ layout: {} as any, blocks: [], measures: [] })),
      getEpochMapper: vi.fn(() => ({
        mapPosFromLayoutToCurrentDetailed: vi.fn(() => ({ ok: true, pos: 5, toEpoch: 1 })),
      })) as unknown as EditorInputDependencies['getEpochMapper'],
      getViewportHost: vi.fn(() => viewportHost),
      getVisibleHost: vi.fn(() => visibleHost),
      getLayoutMode: vi.fn(() => 'vertical'),
      getHeaderFooterSession: vi.fn(() => null),
      getPageGeometryHelper: vi.fn(() => null),
      getZoom: vi.fn(() => 1),
      isViewLocked: vi.fn(() => false),
      getDocumentMode: vi.fn(() => 'editing'),
      getPageElement: vi.fn(() => null),
      isSelectionAwareVirtualizationEnabled: vi.fn(() => false),
    };

    mockCallbacks = {
      normalizeClientPoint: vi.fn((clientX: number, clientY: number) => ({ x: clientX, y: clientY })),
      updateSelectionVirtualizationPins: vi.fn(),
      scheduleSelectionUpdate: vi.fn(),
    };

    manager = new EditorInputManager();
    manager.setDependencies(mockDeps);
    manager.setCallbacks(mockCallbacks);
    manager.bind();
  });

  afterEach(() => {
    manager.destroy();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  /** Helper to get PointerEvent constructor (falls back to MouseEvent in jsdom) */
  function getPointerEventImpl(): typeof PointerEvent | typeof MouseEvent {
    return (
      (globalThis as unknown as { PointerEvent?: typeof PointerEvent; MouseEvent: typeof MouseEvent }).PointerEvent ??
      globalThis.MouseEvent
    );
  }

  /** Helper to start a drag from a given position */
  function startDrag(clientX: number, clientY: number): void {
    const PointerEventImpl = getPointerEventImpl();
    viewportHost.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        button: 0,
        buttons: 1,
      } as PointerEventInit),
    );
  }

  /** Helper to move pointer during drag */
  function moveDrag(clientX: number, clientY: number): void {
    const PointerEventImpl = getPointerEventImpl();
    viewportHost.dispatchEvent(
      new PointerEventImpl('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        button: 0,
        buttons: 1,
      } as PointerEventInit),
    );
  }

  /** Helper to end a drag */
  function endDrag(clientX: number, clientY: number): void {
    const PointerEventImpl = getPointerEventImpl();
    viewportHost.dispatchEvent(
      new PointerEventImpl('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        button: 0,
        buttons: 0,
      } as PointerEventInit),
    );
  }

  it('auto-scrolls the nearest scrollable ancestor during drag selection', () => {
    startDrag(10, 10);
    moveDrag(10, 95);

    expect(rafCallback).not.toBeNull();
    rafCallback?.(0);

    expect(scrollContainer.scrollTop).toBeGreaterThan(0);
    expect(mockEditor.view.dispatch).toHaveBeenCalled();
  });

  it('stops auto-scroll when pointer moves away from edge zone', () => {
    startDrag(10, 10);
    moveDrag(10, 95);

    expect(rafCallback).not.toBeNull();
    rafCallback?.(0);
    const scrollAfterFirstTick = scrollContainer.scrollTop;
    expect(scrollAfterFirstTick).toBeGreaterThan(0);

    // Move pointer back to center (away from edge)
    moveDrag(10, 50);

    // RAF should have been cancelled or not scheduled again
    // The rafCallback should be null after stopAutoScroll is called
    expect(rafCallback).toBeNull();
  });

  it('does not auto-scroll when view is locked', () => {
    (mockDeps.isViewLocked as ReturnType<typeof vi.fn>).mockReturnValue(true);

    startDrag(10, 10);
    moveDrag(10, 95);

    // Should not schedule auto-scroll when view is locked
    expect(rafCallback).toBeNull();
    expect(scrollContainer.scrollTop).toBe(0);
  });

  it('stops auto-scroll on pointer up', () => {
    startDrag(10, 10);
    moveDrag(10, 95);

    expect(rafCallback).not.toBeNull();
    rafCallback?.(0);
    expect(scrollContainer.scrollTop).toBeGreaterThan(0);

    // End the drag
    endDrag(10, 95);

    // Auto-scroll should be stopped
    expect(rafCallback).toBeNull();
  });

  it('does not auto-scroll in header/footer mode', () => {
    (mockDeps.getHeaderFooterSession as ReturnType<typeof vi.fn>).mockReturnValue({
      session: { mode: 'header' },
    });

    startDrag(10, 10);
    moveDrag(10, 95);

    // Should not schedule auto-scroll in header/footer mode
    expect(rafCallback).toBeNull();
    expect(scrollContainer.scrollTop).toBe(0);
  });

  it('scrolls upward when pointer is near top edge', () => {
    // Start with some scroll position
    scrollContainer.scrollTop = 100;

    startDrag(10, 50);
    moveDrag(10, 5); // Move near top edge

    expect(rafCallback).not.toBeNull();
    rafCallback?.(0);

    expect(scrollContainer.scrollTop).toBeLessThan(100);
  });

  describe('horizontal scrolling', () => {
    beforeEach(() => {
      // Enable horizontal scrolling
      Object.defineProperty(scrollContainer, 'scrollWidth', { value: 300, configurable: true });
      scrollContainer.scrollLeft = 0;
    });

    it('scrolls horizontally in horizontal layout mode when pointer is near right edge', () => {
      (mockDeps.getLayoutMode as ReturnType<typeof vi.fn>).mockReturnValue('horizontal');

      startDrag(50, 50);
      moveDrag(95, 50); // Move near right edge

      expect(rafCallback).not.toBeNull();
      rafCallback?.(0);

      expect(scrollContainer.scrollLeft).toBeGreaterThan(0);
    });

    it('scrolls horizontally in book layout mode when pointer is near left edge', () => {
      (mockDeps.getLayoutMode as ReturnType<typeof vi.fn>).mockReturnValue('book');
      scrollContainer.scrollLeft = 100;

      startDrag(50, 50);
      moveDrag(5, 50); // Move near left edge

      expect(rafCallback).not.toBeNull();
      rafCallback?.(0);

      expect(scrollContainer.scrollLeft).toBeLessThan(100);
    });

    it('does NOT scroll horizontally in vertical layout mode', () => {
      (mockDeps.getLayoutMode as ReturnType<typeof vi.fn>).mockReturnValue('vertical');

      startDrag(50, 50);
      moveDrag(95, 50); // Move near right edge

      // Even if RAF is scheduled for vertical scroll check, horizontal scroll should not happen
      if (rafCallback) {
        rafCallback(0);
      }

      expect(scrollContainer.scrollLeft).toBe(0);
    });
  });
});
