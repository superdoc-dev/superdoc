import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextSelection } from 'prosemirror-state';

import {
  EditorInputManager,
  type EditorInputDependencies,
  type EditorInputCallbacks,
} from '../pointer-events/EditorInputManager.js';

/**
 * Behavior tests for SD-2676: drag selection must keep updating as the pointer
 * sweeps downward through a multi-row table.
 *
 * The regression introduced by PR #2205 pinned `head` to the position just
 * before/after the outermost isolating ancestor (the table). That made every
 * pointermove inside the table dispatch a selection with the SAME `head`, so
 * the highlight froze. These tests assert the opposite: each pointermove past
 * the drag threshold dispatches a new selection whose `head` follows the
 * pointer-resolved position, so the highlight updates continuously across
 * multiple rows and over long downward distances.
 */

const resolverHits: Array<{
  pos: number;
  layoutEpoch: number;
  pageIndex: number;
  blockId: string;
  column: number;
  lineIndex: number;
}> = [];
let resolverIndex = 0;

vi.mock('../input/PositionHitResolver.js', () => ({
  resolvePointerPositionHit: vi.fn(() => {
    const hit = resolverHits[Math.min(resolverIndex, resolverHits.length - 1)];
    resolverIndex += 1;
    return hit;
  }),
}));

vi.mock('@superdoc/layout-bridge', () => ({
  clickToPosition: vi.fn(),
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

describe('EditorInputManager - drag selection through a multi-row table (SD-2676)', () => {
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

  beforeEach(() => {
    resolverHits.length = 0;
    resolverIndex = 0;

    scrollContainer = document.createElement('div');
    scrollContainer.style.overflowY = 'auto';
    scrollContainer.style.height = '600px';

    visibleHost = document.createElement('div');
    visibleHost.className = 'presentation-editor';
    viewportHost = document.createElement('div');
    viewportHost.className = 'presentation-editor__viewport';
    visibleHost.appendChild(viewportHost);
    scrollContainer.appendChild(visibleHost);
    document.body.appendChild(scrollContainer);

    Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(scrollContainer, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 600, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollWidth', { value: 400, configurable: true });
    scrollContainer.getBoundingClientRect = () =>
      ({ top: 0, bottom: 600, left: 0, right: 400, width: 400, height: 600 }) as DOMRect;

    viewportHost.setPointerCapture = vi.fn();
    viewportHost.releasePointerCapture = vi.fn();
    viewportHost.hasPointerCapture = vi.fn(() => true);

    mockEditor = {
      isEditable: true,
      state: {
        doc: { content: { size: 1000 } },
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
      getLayoutState: vi.fn(() => ({ layout: {} as never, blocks: [], measures: [] })),
      getEpochMapper: vi.fn(() => ({
        // Identity mapping: head pos passed through unchanged so we can verify
        // the value the manager hands to TextSelection.create directly.
        mapPosFromLayoutToCurrentDetailed: vi.fn((pos: number) => ({ ok: true, pos, toEpoch: 1 })),
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
      normalizeClientPoint: vi.fn((clientX: number, clientY: number) => ({
        x: clientX,
        y: clientY,
        pageIndex: 0,
        pageLocalY: clientY,
      })),
      updateSelectionVirtualizationPins: vi.fn(),
      scheduleSelectionUpdate: vi.fn(),
      notifyDragSelectionEnded: vi.fn(),
      // No table hits — the drag never enters CellSelection mode. This isolates
      // the regression to the text-selection drag path.
      hitTestTable: vi.fn(() => null),
    };

    manager = new EditorInputManager();
    manager.setDependencies(mockDeps);
    manager.setCallbacks(mockCallbacks);
    manager.bind();
  });

  afterEach(() => {
    manager.destroy();
    document.body.removeChild(scrollContainer);
    vi.clearAllMocks();
  });

  function getPointerEventImpl(): typeof PointerEvent | typeof MouseEvent {
    return (
      (globalThis as unknown as { PointerEvent?: typeof PointerEvent; MouseEvent: typeof MouseEvent }).PointerEvent ??
      globalThis.MouseEvent
    );
  }

  function dispatch(type: 'pointerdown' | 'pointermove' | 'pointerup', clientX: number, clientY: number): void {
    const Impl = getPointerEventImpl();
    viewportHost.dispatchEvent(
      new Impl(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
      } as PointerEventInit),
    );
  }

  function pushHit(pos: number): void {
    resolverHits.push({ pos, layoutEpoch: 1, pageIndex: 0, blockId: '', column: 0, lineIndex: -1 });
  }

  function selectionCallArgs(): Array<[unknown, number, number | undefined]> {
    const calls = (TextSelection.create as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<unknown[]>;
    return calls.map((args) => [args[0], args[1] as number, args[2] as number | undefined]);
  }

  it('updates the selection head on each pointermove while sweeping downward through table rows', () => {
    // Simulated positions: anchor in paragraph above the table (pos=10), then
    // four progressively deeper hits as the pointer traverses four rows of a
    // multi-row table (pos=120, 220, 320, 420).
    pushHit(10); // pointerdown anchor (paragraph above table)
    pushHit(120); // first move, row 1
    pushHit(220); // row 2
    pushHit(320); // row 3
    pushHit(420); // row 4

    dispatch('pointerdown', 100, 20);
    // Sweep downward; each move must exceed the 5px drag threshold relative to
    // the start position so every pointermove triggers a selection dispatch.
    dispatch('pointermove', 100, 80);
    dispatch('pointermove', 100, 160);
    dispatch('pointermove', 100, 240);
    dispatch('pointermove', 100, 320);

    const args = selectionCallArgs();
    // Pointerdown places the caret (one call). Then four pointermoves each
    // dispatch one extended selection — five total.
    expect(args.length).toBe(5);

    // First call is the pointerdown caret placement — TextSelection.create
    // is invoked with a single position (no head argument) when seating the
    // caret. The drag-extension calls below are what carry an explicit head.
    expect(args[0][1]).toBe(10);

    // Each drag extension keeps the same anchor (10) and the head must follow
    // the resolved hit position — i.e. NOT pinned to a single table-boundary
    // value. Heads must be strictly increasing as the pointer sweeps downward
    // through successive rows.
    const dragHeads = args.slice(1).map(([, , head]) => head);
    expect(dragHeads).toEqual([120, 220, 320, 420]);

    // Sanity: anchor never jumps during the drag.
    for (const [, anchor] of args.slice(1)) {
      expect(anchor).toBe(10);
    }
  });

  it('keeps extending the selection across a long downward drag (regression guard)', () => {
    // Twelve successive hits spanning ~600 doc positions — represents a long
    // sweep through a tall table. The pre-fix behavior would pin head to the
    // table boundary, so all dragHeads would collapse to a single value.
    pushHit(50); // anchor (paragraph above table)
    for (let i = 1; i <= 12; i += 1) {
      pushHit(50 + i * 50);
    }

    dispatch('pointerdown', 100, 20);
    for (let i = 1; i <= 12; i += 1) {
      dispatch('pointermove', 100, 20 + i * 40);
    }

    const args = selectionCallArgs();
    const dragHeads = args.slice(1).map(([, , head]) => head);

    // Every move past the threshold produced a distinct head — selection
    // updates continuously instead of freezing at a clamped boundary.
    expect(new Set(dragHeads).size).toBe(dragHeads.length);
    expect(dragHeads).toEqual(dragHeads.slice().sort((a, b) => a - b));
    expect(dragHeads[dragHeads.length - 1]).toBeGreaterThan(dragHeads[0]);
  });
});
