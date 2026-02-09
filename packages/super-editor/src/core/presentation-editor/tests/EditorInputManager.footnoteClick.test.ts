import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { clickToPosition } from '@superdoc/layout-bridge';
import { TextSelection } from 'prosemirror-state';

import {
  EditorInputManager,
  type EditorInputDependencies,
  type EditorInputCallbacks,
} from '../pointer-events/EditorInputManager.js';

vi.mock('@superdoc/layout-bridge', () => ({
  clickToPosition: vi.fn(() => ({ pos: 12, layoutEpoch: 1, pageIndex: 0, blockId: 'body-1' })),
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

describe('EditorInputManager - Footnote click selection behavior', () => {
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
          nodesBetween: vi.fn((from, to, cb) => {
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
      getLayoutState: vi.fn(() => ({ layout: {} as any, blocks: [], measures: [] })),
      getEpochMapper: vi.fn(() => ({
        mapPosFromLayoutToCurrentDetailed: vi.fn(() => ({ ok: true, pos: 12, toEpoch: 1 })),
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
      scheduleSelectionUpdate: vi.fn(),
      updateSelectionDebugHud: vi.fn(),
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

  it('does not change editor selection on direct footnote fragment click', () => {
    const fragmentEl = document.createElement('span');
    fragmentEl.setAttribute('data-block-id', 'footnote-1-0');
    const nestedEl = document.createElement('span');
    fragmentEl.appendChild(nestedEl);
    viewportHost.appendChild(fragmentEl);

    const PointerEventImpl = getPointerEventImpl();
    nestedEl.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 10,
        clientY: 10,
      } as PointerEventInit),
    );

    // Expected behavior: footnote click should not relocate caret to start of the document.
    expect(TextSelection.create as unknown as Mock).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
  });

  it('does not change editor selection when hit-test resolves to a footnote block', () => {
    (clickToPosition as unknown as Mock).mockReturnValue({
      pos: 22,
      layoutEpoch: 1,
      pageIndex: 0,
      blockId: 'footnote-1-1',
    });

    const target = document.createElement('span');
    viewportHost.appendChild(target);

    const PointerEventImpl = getPointerEventImpl();
    target.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 12,
        clientY: 14,
      } as PointerEventInit),
    );

    // Expected behavior: block edits in footnotes without resetting user selection.
    expect(TextSelection.create as unknown as Mock).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
  });
});
