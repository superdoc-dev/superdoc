import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { resolvePointerPositionHit } from '../input/PositionHitResolver.js';
import { TextSelection } from 'prosemirror-state';

import {
  EditorInputManager,
  type EditorInputDependencies,
  type EditorInputCallbacks,
} from '../pointer-events/EditorInputManager.js';

vi.mock('../input/PositionHitResolver.js', () => ({
  resolvePointerPositionHit: vi.fn(() => ({
    pos: 24,
    layoutEpoch: 1,
    pageIndex: 0,
    blockId: 'table-1',
    column: 0,
    lineIndex: -1,
  })),
}));

vi.mock('@superdoc/layout-bridge', () => ({
  clickToPosition: vi.fn(() => ({ pos: 24, layoutEpoch: 1, pageIndex: 0, blockId: 'table-1' })),
  getFragmentAtPosition: vi.fn(() => null),
}));

vi.mock('prosemirror-state', async (importOriginal) => {
  const original = await importOriginal<typeof import('prosemirror-state')>();
  return {
    ...original,
    TextSelection: {
      ...original.TextSelection,
      create: vi.fn(() => ({
        empty: true,
        $from: { parent: { inlineContent: true } },
      })),
    },
  };
});

describe('EditorInputManager - page margin clicks', () => {
  let manager: EditorInputManager;
  let viewportHost: HTMLElement;
  let visibleHost: HTMLElement;
  let mockEditor: {
    isEditable: boolean;
    state: {
      doc: { content: { size: number }; nodesBetween: Mock };
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
  let mockDeps: EditorInputDependencies;
  let mockCallbacks: EditorInputCallbacks;

  beforeEach(() => {
    viewportHost = document.createElement('div');
    viewportHost.className = 'presentation-editor__viewport';
    visibleHost = document.createElement('div');
    visibleHost.className = 'presentation-editor__visible';
    visibleHost.appendChild(viewportHost);

    const container = document.createElement('div');
    container.className = 'presentation-editor';
    container.appendChild(visibleHost);
    document.body.appendChild(container);

    mockEditor = {
      isEditable: true,
      state: {
        doc: {
          content: { size: 100 },
          nodesBetween: vi.fn((_from, _to, cb) => {
            cb({ isTextblock: true }, 0);
          }),
        },
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

    mockDeps = {
      getActiveEditor: vi.fn(() => mockEditor as unknown as ReturnType<EditorInputDependencies['getActiveEditor']>),
      getEditor: vi.fn(() => mockEditor as unknown as ReturnType<EditorInputDependencies['getEditor']>),
      getLayoutState: vi.fn(() => ({
        layout: {
          pageSize: { w: 600, h: 800 },
          pages: [
            {
              number: 1,
              size: { w: 600, h: 800 },
              margins: { top: 72, right: 72, bottom: 72, left: 72 },
              fragments: [],
            },
          ],
        } as any,
        blocks: [],
        measures: [],
      })),
      getEpochMapper: vi.fn(() => ({
        mapPosFromLayoutToCurrentDetailed: vi.fn(() => ({ ok: true, pos: 24, toEpoch: 1 })),
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
      scheduleSelectionUpdate: vi.fn(),
      updateSelectionDebugHud: vi.fn(),
      hitTestHeaderFooterRegion: vi.fn(() => null),
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

  function getPointerEventImpl(): typeof PointerEvent | typeof MouseEvent {
    return (
      (globalThis as unknown as { PointerEvent?: typeof PointerEvent; MouseEvent: typeof MouseEvent }).PointerEvent ??
      globalThis.MouseEvent
    );
  }

  function dispatchPointerDown(
    target: HTMLElement,
    { clientX = 10, clientY = 10 }: { clientX?: number; clientY?: number } = {},
  ): void {
    const PointerEventImpl = getPointerEventImpl();
    target.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY,
      } as PointerEventInit),
    );
  }

  it('does not resolve a position hit for clicks in the top page margin', () => {
    const target = document.createElement('span');
    viewportHost.appendChild(target);

    dispatchPointerDown(target, { clientX: 200, clientY: 15 });

    expect(resolvePointerPositionHit).not.toHaveBeenCalled();
    expect(TextSelection.create as unknown as Mock).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
    expect(mockEditor.view.focus).toHaveBeenCalled();
  });

  it('still resolves a position hit for clicks inside the page body', () => {
    const target = document.createElement('span');
    viewportHost.appendChild(target);

    dispatchPointerDown(target, { clientX: 200, clientY: 120 });

    expect(resolvePointerPositionHit).toHaveBeenCalled();
  });

  // SD-2749: clicking in the inter-page gap caused the viewer to jump to a
  // different page. normalizeClientPoint returns pageIndex undefined when
  // elementsFromPoint finds no .superdoc-page under the cursor (e.g. the gap
  // between two pages). The pointer-down handler must bail out the same way it
  // does for in-page margin clicks (SD-2356) — no selection change, no scroll.
  it('does not resolve a position hit for clicks in the gap between pages', () => {
    (mockCallbacks.normalizeClientPoint as Mock).mockReturnValueOnce({ x: 200, y: 410 });

    const target = document.createElement('span');
    viewportHost.appendChild(target);

    dispatchPointerDown(target, { clientX: 200, clientY: 410 });

    expect(resolvePointerPositionHit).not.toHaveBeenCalled();
    expect(TextSelection.create as unknown as Mock).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
    expect(mockEditor.view.focus).toHaveBeenCalled();
  });
});
