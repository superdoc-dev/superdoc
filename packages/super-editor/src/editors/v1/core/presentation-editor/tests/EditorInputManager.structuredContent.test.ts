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

function createMockDoc(
  mode: 'tableInSdt' | 'plainSdt' | 'inlineSdtAfterBoundary' | 'emptyInlineSdt' | 'nestedInlineInBlock',
) {
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
      if (mode === 'emptyInlineSdt') {
        return {
          depth: 2,
          node: (depth: number) => {
            if (depth === 2) return { type: { name: 'structuredContent' }, nodeSize: 2 };
            if (depth === 1) return { type: { name: 'paragraph' } };
            return { type: { name: 'doc' } };
          },
          before: (depth: number) => (depth === 2 ? 8 : 0),
          start: (depth: number) => (depth === 2 ? 9 : 1),
          end: (depth: number) => (depth === 2 ? 9 : 199),
        };
      }
      if (mode === 'nestedInlineInBlock') {
        return {
          depth: 3,
          node: (depth: number) => {
            if (depth === 3) return { type: { name: 'structuredContent' }, nodeSize: 5 };
            if (depth === 2) return { type: { name: 'paragraph' } };
            if (depth === 1) return { type: { name: 'structuredContentBlock' } };
            return { type: { name: 'doc' } };
          },
          before: (depth: number) => {
            if (depth === 3) return 10;
            if (depth === 1) return 5;
            return 6;
          },
          start: (depth: number) => {
            if (depth === 3) return 11;
            if (depth === 1) return 6;
            return 7;
          },
          end: (depth: number) => {
            if (depth === 3) return 14;
            if (depth === 1) return 30;
            return 29;
          },
        };
      }
      return {
        depth: 1,
        node: (depth: number) => {
          if (depth === 1) {
            return {
              type: { name: 'structuredContentBlock' },
              nodeSize: 21,
              descendants: (cb: (node: unknown, pos: number) => void) => {
                cb({ isTextblock: true, nodeSize: 20 }, 0);
              },
            };
          }
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

describe('EditorInputManager structured content clicks', () => {
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
  let getActiveEditor: Mock;
  let getEditor: Mock;
  let mockHitTestTable: Mock;
  let scheduleSelectionUpdate: Mock;

  function mountWithDoc(
    mode: 'tableInSdt' | 'plainSdt' | 'inlineSdtAfterBoundary' | 'emptyInlineSdt' | 'nestedInlineInBlock',
  ) {
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
    getActiveEditor = vi.fn(() => mockEditor);
    getEditor = vi.fn(() => mockEditor);
    manager.setDependencies({
      getActiveEditor,
      getEditor,
      getLayoutState: vi.fn(() => ({ layout: {} as any, blocks: [], measures: [] })),
      getEpochMapper: vi.fn(() => ({
        mapPosFromLayoutToCurrentDetailed: vi.fn((pos: number) => ({ ok: true, pos, toEpoch: 1 })),
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
      normalizeClientPoint: vi.fn((clientX: number, clientY: number) => ({
        x: clientX,
        y: clientY,
        pageIndex: 0,
        pageLocalY: clientY,
      })),
      scheduleSelectionUpdate: (scheduleSelectionUpdate = vi.fn()),
      updateSelectionDebugHud: vi.fn(),
      hitTestTable: (mockHitTestTable = vi.fn(() => null)),
    });
    manager.bind();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('uses collapsed TextSelection for plain structuredContentBlock body click', () => {
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
    expect(mockTextSelectionCreate).toHaveBeenCalledWith(mockEditor.state.doc, 12);
    expect(mockNodeSelectionCreate).not.toHaveBeenCalled();
  });

  it('resolves nested inline structured content before an ancestor block', () => {
    mountWithDoc('nestedInlineInBlock');
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
    expect(mockTextSelectionCreate).toHaveBeenCalledWith(mockEditor.state.doc, 12);
    expect(mockNodeSelectionCreate).not.toHaveBeenCalled();
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

  it('keeps placeholder clicks inside an empty inline structured content node', () => {
    mountWithDoc('emptyInlineSdt');
    (resolvePointerPositionHit as unknown as Mock).mockReturnValueOnce({
      pos: 9,
      layoutEpoch: 1,
      pageIndex: 0,
      blockId: 'body-1',
      column: 0,
      lineIndex: 0,
    });
    const target = document.createElement('span');
    target.className = 'superdoc-empty-sdt-placeholder superdoc-empty-inline-sdt-placeholder';
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
    expect(mockTextSelectionCreate).toHaveBeenCalledWith(mockEditor.state.doc, 9);
    expect(mockApplyEditableSlotAtInlineBoundary).not.toHaveBeenCalled();
    expect(mockNodeSelectionCreate).not.toHaveBeenCalled();
  });

  it('selects the whole inline structured content when its label is clicked', () => {
    mountWithDoc('inlineSdtAfterBoundary');
    const wrapper = document.createElement('span');
    wrapper.className = 'superdoc-structured-content-inline';
    wrapper.dataset.pmStart = '10';
    wrapper.dataset.pmEnd = '13';
    const label = document.createElement('span');
    label.className = 'superdoc-structured-content-inline__label';
    wrapper.appendChild(label);
    viewportHost.appendChild(wrapper);

    label.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 28,
        clientY: 28,
      }),
    );

    expect(resolvePointerPositionHit as unknown as Mock).not.toHaveBeenCalled();
    expect(mockNodeSelectionCreate).toHaveBeenCalledWith(mockEditor.state.doc, 10);
    expect(mockTextSelectionCreate).not.toHaveBeenCalled();
  });

  it('does not prevent default on structured content label pointerdown', () => {
    mountWithDoc('inlineSdtAfterBoundary');
    const wrapper = document.createElement('span');
    wrapper.className = 'superdoc-structured-content-inline';
    wrapper.dataset.pmStart = '10';
    wrapper.dataset.pmEnd = '13';
    const label = document.createElement('span');
    label.className = 'superdoc-structured-content-inline__label';
    label.draggable = true;
    label.dataset.dragSourceKind = 'structuredContent';
    wrapper.appendChild(label);
    viewportHost.appendChild(wrapper);

    const PointerEventImpl = getPointerEventImpl();
    const event = new PointerEventImpl('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 28,
      clientY: 28,
    } as PointerEventInit);
    label.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(resolvePointerPositionHit as unknown as Mock).not.toHaveBeenCalled();
    expect(mockNodeSelectionCreate).not.toHaveBeenCalled();
    expect(mockTextSelectionCreate).not.toHaveBeenCalled();
  });

  it('selects a draggable block structured content label on click without blocking pointerdown', () => {
    mountWithDoc('plainSdt');
    const wrapper = document.createElement('div');
    wrapper.className = 'superdoc-structured-content-block';
    wrapper.dataset.pmStart = '10';
    wrapper.dataset.pmEnd = '31';
    const label = document.createElement('div');
    label.className = 'superdoc-structured-content__label';
    label.draggable = true;
    label.dataset.dragSourceKind = 'structuredContent';
    wrapper.appendChild(label);
    viewportHost.appendChild(wrapper);

    const PointerEventImpl = getPointerEventImpl();
    const pointerDown = new PointerEventImpl('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 24,
      clientY: 24,
    } as PointerEventInit);
    label.dispatchEvent(pointerDown);

    const pointerUp = new PointerEventImpl('pointerup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 0,
      clientX: 24,
      clientY: 24,
    } as PointerEventInit);
    label.dispatchEvent(pointerUp);
    label.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 24,
        clientY: 24,
      }),
    );

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(resolvePointerPositionHit as unknown as Mock).not.toHaveBeenCalled();
    expect(mockNodeSelectionCreate).toHaveBeenCalledWith(mockEditor.state.doc, 10);
    expect(mockNodeSelectionCreate).toHaveBeenCalledTimes(1);
    expect(mockEditor.view.dispatch).toHaveBeenCalledTimes(1);
    expect(scheduleSelectionUpdate).toHaveBeenCalledTimes(1);
    expect(mockTextSelectionCreate).not.toHaveBeenCalled();
  });

  it('focuses the editor when an inline structured content label is clicked', () => {
    mountWithDoc('inlineSdtAfterBoundary');
    const outsideButton = document.createElement('button');
    mountRoot.appendChild(outsideButton);
    outsideButton.focus();
    const wrapper = document.createElement('span');
    wrapper.className = 'superdoc-structured-content-inline';
    wrapper.dataset.pmStart = '10';
    wrapper.dataset.pmEnd = '13';
    const label = document.createElement('span');
    label.className = 'superdoc-structured-content-inline__label';
    wrapper.appendChild(label);
    viewportHost.appendChild(wrapper);

    label.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 28,
        clientY: 28,
      }),
    );

    expect(mockNodeSelectionCreate).toHaveBeenCalledWith(mockEditor.state.doc, 10);
    expect(mockEditor.view.focus).toHaveBeenCalled();
  });

  it('uses the active editor doc when a structured content label is clicked', () => {
    mountWithDoc('plainSdt');
    const activeEditor = {
      ...mockEditor,
      state: {
        ...mockEditor.state,
        doc: createMockDoc('inlineSdtAfterBoundary'),
        tr: {
          setSelection: vi.fn().mockReturnThis(),
          setStoredMarks: vi.fn().mockReturnThis(),
        },
      },
      view: {
        ...mockEditor.view,
        dispatch: vi.fn(),
        focus: vi.fn(),
      },
    };
    getActiveEditor.mockReturnValue(activeEditor);
    const wrapper = document.createElement('span');
    wrapper.className = 'superdoc-structured-content-inline';
    wrapper.dataset.pmStart = '10';
    wrapper.dataset.pmEnd = '13';
    const label = document.createElement('span');
    label.className = 'superdoc-structured-content-inline__label';
    wrapper.appendChild(label);
    viewportHost.appendChild(wrapper);

    label.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 28,
        clientY: 28,
      }),
    );

    expect(mockNodeSelectionCreate).toHaveBeenCalledWith(activeEditor.state.doc, 10);
    expect(activeEditor.view.dispatch).toHaveBeenCalledWith(activeEditor.state.tr);
    expect(mockTextSelectionCreate).not.toHaveBeenCalled();
  });

  it('selects the whole block structured content when its label is clicked', () => {
    mountWithDoc('plainSdt');
    const wrapper = document.createElement('div');
    wrapper.className = 'superdoc-structured-content-block';
    wrapper.dataset.pmStart = '10';
    wrapper.dataset.pmEnd = '31';
    const label = document.createElement('div');
    label.className = 'superdoc-structured-content__label';
    label.dataset.pmStart = '10';
    wrapper.appendChild(label);
    viewportHost.appendChild(wrapper);

    label.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 24,
        clientY: 24,
      }),
    );

    expect(resolvePointerPositionHit as unknown as Mock).not.toHaveBeenCalled();
    expect(mockNodeSelectionCreate).toHaveBeenCalledWith(mockEditor.state.doc, 10);
    expect(mockNodeSelectionCreate).toHaveBeenCalledTimes(1);
    expect(mockEditor.view.dispatch).toHaveBeenCalledTimes(1);
    expect(mockTextSelectionCreate).not.toHaveBeenCalled();
  });

  it('ignores block structured content labels covered by another click target', () => {
    mountWithDoc('plainSdt');
    const wrapper = document.createElement('div');
    wrapper.className = 'superdoc-structured-content-block';
    wrapper.dataset.pmStart = '10';
    wrapper.dataset.pmEnd = '31';
    const label = document.createElement('div');
    label.className = 'superdoc-structured-content__label';
    label.dataset.pmStart = '10';
    wrapper.appendChild(label);
    viewportHost.appendChild(wrapper);

    const overlayButton = document.createElement('button');
    mountRoot.appendChild(overlayButton);

    const originalElementsFromPoint = document.elementsFromPoint;
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [overlayButton, label]),
    });

    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 24,
    });

    try {
      overlayButton.dispatchEvent(event);
    } finally {
      if (originalElementsFromPoint) {
        Object.defineProperty(document, 'elementsFromPoint', {
          configurable: true,
          value: originalElementsFromPoint,
        });
      } else {
        Reflect.deleteProperty(document, 'elementsFromPoint');
      }
    }

    expect(event.defaultPrevented).toBe(false);
    expect(mockNodeSelectionCreate).not.toHaveBeenCalled();
    expect(mockEditor.view.dispatch).not.toHaveBeenCalled();
    expect(scheduleSelectionUpdate).not.toHaveBeenCalled();
  });

  it('clears a pending structured content label gesture on pointercancel', () => {
    mountWithDoc('plainSdt');
    const wrapper = document.createElement('div');
    wrapper.className = 'superdoc-structured-content-block';
    wrapper.dataset.pmStart = '10';
    wrapper.dataset.pmEnd = '31';
    const label = document.createElement('div');
    label.className = 'superdoc-structured-content__label';
    wrapper.appendChild(label);
    viewportHost.appendChild(wrapper);

    const PointerEventImpl = getPointerEventImpl();
    label.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 24,
        clientY: 24,
      } as PointerEventInit),
    );
    label.dispatchEvent(
      new PointerEventImpl('pointercancel', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 0,
        clientX: 24,
        clientY: 24,
      } as PointerEventInit),
    );
    label.dispatchEvent(
      new PointerEventImpl('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 0,
        clientX: 24,
        clientY: 24,
      } as PointerEventInit),
    );

    expect(mockNodeSelectionCreate).not.toHaveBeenCalled();
    expect(mockEditor.view.dispatch).not.toHaveBeenCalled();
  });

  it('does not suppress a later label click when the click after pointerup never arrives', () => {
    mountWithDoc('plainSdt');
    const wrapper = document.createElement('div');
    wrapper.className = 'superdoc-structured-content-block';
    wrapper.dataset.pmStart = '10';
    wrapper.dataset.pmEnd = '31';
    const label = document.createElement('div');
    label.className = 'superdoc-structured-content__label';
    wrapper.appendChild(label);
    viewportHost.appendChild(wrapper);

    const PointerEventImpl = getPointerEventImpl();
    label.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 24,
        clientY: 24,
      } as PointerEventInit),
    );
    label.dispatchEvent(
      new PointerEventImpl('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 0,
        clientX: 24,
        clientY: 24,
      } as PointerEventInit),
    );

    mockNodeSelectionCreate.mockClear();
    mockEditor.view.dispatch.mockClear();

    label.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 24,
        clientY: 24,
      }),
    );

    expect(mockNodeSelectionCreate).toHaveBeenCalledWith(mockEditor.state.doc, 10);
    expect(mockEditor.view.dispatch).toHaveBeenCalledWith(mockEditor.state.tr);
  });

  it('ignores structured content labels rendered by another input manager', () => {
    mountWithDoc('plainSdt');
    const otherViewportHost = document.createElement('div');
    const otherVisibleHost = document.createElement('div');
    otherVisibleHost.appendChild(otherViewportHost);
    mountRoot.appendChild(otherVisibleHost);

    const otherEditor = {
      ...mockEditor,
      state: {
        ...mockEditor.state,
        doc: createMockDoc('plainSdt'),
        tr: {
          setSelection: vi.fn().mockReturnThis(),
          setStoredMarks: vi.fn().mockReturnThis(),
        },
      },
      view: {
        ...mockEditor.view,
        dispatch: vi.fn(),
        dom: document.createElement('div'),
        focus: vi.fn(),
      },
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };

    const otherManager = new EditorInputManagerClass!();
    otherManager.setDependencies({
      getActiveEditor: vi.fn(() => otherEditor),
      getEditor: vi.fn(() => otherEditor),
      getLayoutState: vi.fn(() => ({ layout: {} as any, blocks: [], measures: [] })),
      getEpochMapper: vi.fn(() => ({
        mapPosFromLayoutToCurrentDetailed: vi.fn(() => ({ ok: true, pos: 12, toEpoch: 1 })),
      })),
      getViewportHost: vi.fn(() => otherViewportHost),
      getVisibleHost: vi.fn(() => otherVisibleHost),
      getLayoutMode: vi.fn(() => 'vertical'),
      getHeaderFooterSession: vi.fn(() => null),
      getPageGeometryHelper: vi.fn(() => null),
      getZoom: vi.fn(() => 1),
      isViewLocked: vi.fn(() => false),
      getDocumentMode: vi.fn(() => 'editing'),
      getPageElement: vi.fn(() => null),
      isSelectionAwareVirtualizationEnabled: vi.fn(() => false),
    });
    otherManager.setCallbacks({
      normalizeClientPoint: vi.fn((clientX: number, clientY: number) => ({
        x: clientX,
        y: clientY,
        pageIndex: 0,
        pageLocalY: clientY,
      })),
      scheduleSelectionUpdate: vi.fn(),
      updateSelectionDebugHud: vi.fn(),
      hitTestTable: vi.fn(() => null),
    });
    otherManager.bind();

    const wrapper = document.createElement('div');
    wrapper.className = 'superdoc-structured-content-block';
    wrapper.dataset.pmStart = '10';
    wrapper.dataset.pmEnd = '31';
    const label = document.createElement('div');
    label.className = 'superdoc-structured-content__label';
    wrapper.appendChild(label);
    otherViewportHost.appendChild(wrapper);

    try {
      label.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: 24,
          clientY: 24,
        }),
      );
    } finally {
      otherManager.destroy();
    }

    expect(mockEditor.view.dispatch).not.toHaveBeenCalled();
    expect(otherEditor.view.dispatch).toHaveBeenCalledWith(otherEditor.state.tr);
    expect(mockNodeSelectionCreate).toHaveBeenCalledWith(otherEditor.state.doc, 10);
  });
});
