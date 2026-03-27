import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { comments_module_events } from '@superdoc/common';
import { clickToPosition } from '@superdoc/layout-bridge';
import { TextSelection } from 'prosemirror-state';

import {
  EditorInputManager,
  type EditorInputDependencies,
  type EditorInputCallbacks,
} from '../pointer-events/EditorInputManager.js';

vi.mock('@superdoc/layout-bridge', () => ({
  clickToPosition: vi.fn(() => ({ pos: 24, layoutEpoch: 1, pageIndex: 0, blockId: 'body-1' })),
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

describe('EditorInputManager - repeated active comment clicks', () => {
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
      comments$: { activeThreadId: string | null };
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
    viewportHost.setPointerCapture = vi.fn();
    viewportHost.releasePointerCapture = vi.fn();
    viewportHost.hasPointerCapture = vi.fn(() => true);

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
          resolve: vi.fn(() => ({ depth: 0 })),
          nodesBetween: vi.fn((from, to, callback) => {
            callback({ isTextblock: true }, 0);
          }),
        },
        tr: {
          setSelection: vi.fn().mockReturnThis(),
          setStoredMarks: vi.fn().mockReturnThis(),
        },
        selection: { $anchor: null },
        storedMarks: null,
        comments$: { activeThreadId: 'comment-1' },
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

  function dispatchPointerDown(target: HTMLElement): void {
    const PointerEventImpl = getPointerEventImpl();
    target.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 10,
        clientY: 10,
      } as PointerEventInit),
    );
  }

  it('treats a click on the already-active single-thread highlight as a no-op', () => {
    const highlight = document.createElement('span');
    highlight.className = 'superdoc-comment-highlight';
    highlight.setAttribute('data-comment-ids', 'comment-1');
    viewportHost.appendChild(highlight);

    dispatchPointerDown(highlight);

    expect(mockEditor.emit).toHaveBeenCalledWith('commentsUpdate', {
      type: comments_module_events.SELECTED,
      activeCommentId: 'comment-1',
    });
    expect(clickToPosition).not.toHaveBeenCalled();
    expect(TextSelection.create as unknown as Mock).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
    expect(mockEditor.view.dispatch).not.toHaveBeenCalled();
    expect(viewportHost.setPointerCapture).not.toHaveBeenCalled();
  });

  it('does not suppress clicks on overlapping highlights that contain multiple thread ids', () => {
    const highlight = document.createElement('span');
    highlight.className = 'superdoc-comment-highlight';
    highlight.setAttribute('data-comment-ids', 'comment-1,comment-2');
    viewportHost.appendChild(highlight);

    dispatchPointerDown(highlight);

    expect(mockEditor.emit).not.toHaveBeenCalledWith(
      'commentsUpdate',
      expect.objectContaining({ activeCommentId: 'comment-1' }),
    );
    expect(clickToPosition).toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).toHaveBeenCalled();
    expect(viewportHost.setPointerCapture).toHaveBeenCalled();
  });
});
