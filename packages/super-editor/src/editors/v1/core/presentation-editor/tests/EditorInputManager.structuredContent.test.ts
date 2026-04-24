import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { resolvePointerPositionHit } from '../input/PositionHitResolver.js';

const { mockTextSelectionCreate, mockNodeSelectionCreate } = vi.hoisted(() => ({
  mockTextSelectionCreate: vi.fn(),
  mockNodeSelectionCreate: vi.fn(),
}));
const { mockApplyEditableSlotAtInlineBoundary } = vi.hoisted(() => ({
  mockApplyEditableSlotAtInlineBoundary: vi.fn(),
}));

vi.mock('../input/PositionHitResolver.js', () => ({
  resolvePointerPositionHit: vi.fn(() => ({
    pos: 12,
    layoutEpoch: 1,
    pageIndex: 0,
    blockId: 'body-1',
    column: 0,
    lineIndex: 0,
  })),
}));

vi.mock('@superdoc/layout-bridge', () => ({
  getFragmentAtPosition: vi.fn(() => null),
}));

vi.mock('@helpers/ensure-editable-slot-inline-boundary.js', () => ({
  applyEditableSlotAtInlineBoundary: mockApplyEditableSlotAtInlineBoundary,
}));

vi.mock('prosemirror-state', async (importOriginal) => {
  const original = await importOriginal<typeof import('prosemirror-state')>();
  return {
    ...original,
    TextSelection: {
      ...original.TextSelection,
      create: mockTextSelectionCreate,
    },
    NodeSelection: {
      ...original.NodeSelection,
      create: mockNodeSelectionCreate,
    },
    Selection: {
      ...original.Selection,
      near: vi.fn(() => ({
        empty: true,
        $from: { parent: { inlineContent: true } },
      })),
    },
  };
});

function getPointerEventImpl(): typeof PointerEvent | typeof MouseEvent {
  return (
    (globalThis as unknown as { PointerEvent?: typeof PointerEvent; MouseEvent: typeof MouseEvent }).PointerEvent ??
    globalThis.MouseEvent
  );
}

function createMockDoc(mode: 'tableInSdt' | 'plainSdt' | 'inlineSdtAfterBoundary') {
  return {
    content: { size: 200 },
    nodeAt: vi.fn(() => ({ nodeSize: 20 })),
    resolve: vi.fn((_pos: number) => {
      if (mode === 'tableInSdt') {
        return {
          depth: 2,
          node: (depth: number) => {
            if (depth === 2) return { type: { name: 'table' } };
            if (depth === 1) return { type: { name: 'structuredContentBlock' } };
            return { type: { name: 'doc' } };
          },
          before: (depth: number) => (depth === 1 ? 10 : 11),
          start: (depth: number) => (depth === 1 ? 11 : 12),
          end: (depth: number) => (depth === 1 ? 30 : 29),
        };
      }
      if (mode === 'inlineSdtAfterBoundary') {
        return {
          depth: 2,
          node: (depth: number) => {
            if (depth === 2) return { type: { name: 'structuredContent' }, nodeSize: 3 };
            if (depth === 1) return { type: { name: 'paragraph' } };
            return { type: { name: 'doc' } };
          },
          before: (depth: number) => (depth === 2 ? 10 : 0),
          start: (depth: number) => (depth === 2 ? 11 : 1),
          end: (depth: number) => (depth === 2 ? 12 : 199),
        };
      }
      return {
        depth: 1,
        node: (depth: number) => {
          if (depth === 1) return { type: { name: 'structuredContentBlock' } };
          return { type: { name: 'doc' } };
        },
        before: (_depth: number) => 10,
        start: (_depth: number) => 11,
        end: (_depth: number) => 30,
      };
    }),
    nodesBetween: vi.fn((_from: number, _to: number, cb: (node: unknown, pos: number) => void) => {
      cb({ isTextblock: true }, 0);
    }),
  };
}

describe('EditorInputManager structuredContentBlock table exception', () => {
  let EditorInputManagerClass:
    | (new () => {
        setDependencies: (deps: unknown) => void;
        setCallbacks: (callbacks: unknown) => void;
        bind: () => void;
        destroy: () => void;
      })
    | null = null;
  let manager: InstanceType<NonNullable<typeof EditorInputManagerClass>>;
  let viewportHost: HTMLElement;
  let visibleHost: HTMLElement;
  let mountRoot: HTMLElement;
  let mockEditor: {
    isEditable: boolean;
    state: {
      doc: ReturnType<typeof createMockDoc>;
      tr: { setSelection: Mock; setStoredMarks: Mock };
      selection: { $anchor: null };
      storedMarks: null;
    };
    view: {
      dispatch: Mock;
      dom: HTMLElement;
      focus: Mock;
      hasFocus: Mock;
    };
    on: Mock;
    off: Mock;
    emit: Mock;
  };
  let mockHitTestTable: Mock;

  function mountWithDoc(mode: 'tableInSdt' | 'plainSdt') {
    mockEditor.state.doc = createMockDoc(mode);
  }

  beforeEach(async () => {
    mockTextSelectionCreate.mockReset();
    mockNodeSelectionCreate.mockReset();
    mockApplyEditableSlotAtInlineBoundary.mockReset();
    mockTextSelectionCreate.mockReturnValue({
      empty: true,
      $from: { parent: { inlineContent: true } },
    });
    mockNodeSelectionCreate.mockReturnValue({
      empty: false,
    });
    mockApplyEditableSlotAtInlineBoundary.mockImplementation((tr) => {
      tr.selection = {
        empty: true,
        $from: { parent: { inlineContent: true } },
      };
      return tr;
    });

    viewportHost = document.createElement('div');
    visibleHost = document.createElement('div');
    visibleHost.appendChild(viewportHost);
    mountRoot = document.createElement('div');
    mountRoot.appendChild(visibleHost);
    document.body.appendChild(mountRoot);

    mockEditor = {
      isEditable: true,
      state: {
        doc: createMockDoc('plainSdt'),
        tr: {
          setSelection: vi.fn().mockReturnThis(),
          setStoredMarks: vi.fn().mockReturnThis(),
        },
        selection: { $anchor: null },
        storedMarks: null,
      },
      view: {
        dispatch: vi.fn(),
        dom: document.createElement('div'),
        focus: vi.fn(),
        hasFocus: vi.fn(() => false),
      },
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };

    if (!EditorInputManagerClass) {
      const mod = await import('../pointer-events/EditorInputManager.js');
      EditorInputManagerClass = mod.EditorInputManager as typeof EditorInputManagerClass;
    }

    manager = new EditorInputManagerClass!();
    manager.setDependencies({
      getActiveEditor: vi.fn(() => mockEditor),
      getEditor: vi.fn(() => mockEditor),
      getLayoutState: vi.fn(() => ({ layout: {} as any, blocks: [], measures: [] })),
      getEpochMapper: vi.fn(() => ({
        mapPosFromLayoutToCurrentDetailed: vi.fn(() => ({ ok: true, pos: 12, toEpoch: 1 })),
      })),
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
    });
    manager.setCallbacks({
      normalizeClientPoint: vi.fn((clientX: number, clientY: number) => ({ x: clientX, y: clientY })),
      scheduleSelectionUpdate: vi.fn(),
      updateSelectionDebugHud: vi.fn(),
      hitTestTable: (mockHitTestTable = vi.fn(() => null)),
    });
    manager.bind();
  });

  afterEach(() => {
    manager.destroy();
    mountRoot.remove();
    vi.clearAllMocks();
  });

  it('uses TextSelection when click lands inside table within structuredContentBlock', () => {
    mountWithDoc('tableInSdt');
    mockHitTestTable.mockReturnValue({
      block: { id: 'table-1' },
      cellRowIndex: 0,
      cellColIndex: 0,
    });
    const tableFragment = document.createElement('div');
    tableFragment.className = 'superdoc-table-fragment';
    const target = document.createElement('span');
    tableFragment.appendChild(target);
    viewportHost.appendChild(tableFragment);

    const PointerEventImpl = getPointerEventImpl();
    target.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 20,
        clientY: 20,
      } as PointerEventInit),
    );

    expect(resolvePointerPositionHit as unknown as Mock).toHaveBeenCalled();
    expect(mockTextSelectionCreate).toHaveBeenCalled();
    expect(mockNodeSelectionCreate).not.toHaveBeenCalled();
  });

  it('uses NodeSelection for plain structuredContentBlock click (non-table)', () => {
    mountWithDoc('plainSdt');
    const target = document.createElement('span');
    viewportHost.appendChild(target);

    const PointerEventImpl = getPointerEventImpl();
    target.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 24,
        clientY: 24,
      } as PointerEventInit),
    );

    expect(resolvePointerPositionHit as unknown as Mock).toHaveBeenCalled();
    expect(mockNodeSelectionCreate).toHaveBeenCalled();
  });

  it('applies inline structured content boundary handling when the click lands at the trailing edge', () => {
    mountWithDoc('inlineSdtAfterBoundary');
    const target = document.createElement('span');
    viewportHost.appendChild(target);

    const PointerEventImpl = getPointerEventImpl();
    target.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 28,
        clientY: 28,
      } as PointerEventInit),
    );

    expect(resolvePointerPositionHit as unknown as Mock).toHaveBeenCalled();
    expect(mockTextSelectionCreate).toHaveBeenCalledWith(mockEditor.state.doc, 13);
    expect(mockApplyEditableSlotAtInlineBoundary).toHaveBeenCalledWith(mockEditor.state.tr, 13, 'after');
    expect(mockNodeSelectionCreate).not.toHaveBeenCalled();
  });
});
