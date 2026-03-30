import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { comments_module_events } from '@superdoc/common';
import { clickToPosition } from '@superdoc/layout-bridge';
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
    blockId: 'body-1',
    column: 0,
    lineIndex: -1,
  })),
}));

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

describe('EditorInputManager - single-thread comment highlight clicks', () => {
  let manager: EditorInputManager;
  let viewportHost: HTMLElement;
  let visibleHost: HTMLElement;
  let editorDom: HTMLDivElement & { focus: Mock };
  let mockEditor: {
    isEditable: boolean;
    commands: {
      setCursorById: Mock;
    };
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
  let originalElementsFromPoint: typeof document.elementsFromPoint | undefined;

  beforeEach(() => {
    originalElementsFromPoint = document.elementsFromPoint?.bind(document);
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

    editorDom = Object.assign(document.createElement('div'), {
      focus: vi.fn(),
    });

    mockEditor = {
      isEditable: true,
      commands: {
        setCursorById: vi.fn(() => true),
      },
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
        dom: editorDom,
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
    if (originalElementsFromPoint) {
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: originalElementsFromPoint,
      });
    } else {
      Reflect.deleteProperty(document, 'elementsFromPoint');
    }
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

  function stubElementsFromPoint(elements: Element[]): Mock {
    const elementsFromPoint = vi.fn(() => elements);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: elementsFromPoint,
    });
    return elementsFromPoint;
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
    expect(resolvePointerPositionHit).not.toHaveBeenCalled();
    expect(TextSelection.create as unknown as Mock).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
    expect(mockEditor.view.dispatch).not.toHaveBeenCalled();
    expect(mockEditor.view.focus).not.toHaveBeenCalled();
    expect(editorDom.focus).not.toHaveBeenCalled();
    expect(viewportHost.setPointerCapture).not.toHaveBeenCalled();
  });

  it('activates an inactive single-thread highlight without falling back to generic selection handling', () => {
    mockEditor.state.comments$.activeThreadId = 'comment-2';

    const highlight = document.createElement('span');
    highlight.className = 'superdoc-comment-highlight';
    highlight.setAttribute('data-comment-ids', 'comment-1');
    viewportHost.appendChild(highlight);

    dispatchPointerDown(highlight);

    expect(mockEditor.commands.setCursorById).toHaveBeenCalledWith('comment-1', {
      activeCommentId: 'comment-1',
    });
    expect(resolvePointerPositionHit).not.toHaveBeenCalled();
    expect(TextSelection.create as unknown as Mock).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
    expect(mockEditor.view.dispatch).not.toHaveBeenCalled();
    expect(mockEditor.view.focus).not.toHaveBeenCalled();
    expect(editorDom.focus).not.toHaveBeenCalled();
    expect(viewportHost.setPointerCapture).not.toHaveBeenCalled();
  });

  it('activates a tracked-change decoration when it owns the clicked visual surface', () => {
    mockEditor.state.comments$.activeThreadId = 'comment-2';

    const trackedChange = document.createElement('span');
    trackedChange.className = 'track-delete-dec highlighted';
    trackedChange.setAttribute('data-track-change-id', 'change-1');
    viewportHost.appendChild(trackedChange);

    dispatchPointerDown(trackedChange);

    expect(mockEditor.commands.setCursorById).toHaveBeenCalledWith('change-1', {
      activeCommentId: 'change-1',
    });
    expect(resolvePointerPositionHit).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
    expect(viewportHost.setPointerCapture).not.toHaveBeenCalled();
  });

  it('activates a nearby single-thread highlight when a split-run gap receives the pointer event', () => {
    mockEditor.state.comments$.activeThreadId = 'comment-2';

    const gap = document.createElement('span');
    gap.className = 'track-delete-dec highlighted';
    viewportHost.appendChild(gap);

    const highlight = document.createElement('span');
    highlight.className = 'superdoc-comment-highlight';
    highlight.setAttribute('data-comment-ids', 'comment-1');
    viewportHost.appendChild(highlight);

    const elementsFromPoint = stubElementsFromPoint([gap, highlight]);

    dispatchPointerDown(gap, { clientX: 24, clientY: 12 });

    expect(elementsFromPoint).toHaveBeenCalled();
    expect(mockEditor.commands.setCursorById).toHaveBeenCalledWith('comment-1', {
      activeCommentId: 'comment-1',
    });
    expect(resolvePointerPositionHit).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
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
    expect(resolvePointerPositionHit).toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).toHaveBeenCalled();
    expect(viewportHost.setPointerCapture).toHaveBeenCalled();
  });

  it('does not guess a thread when the nearby hit surface is an overlapping highlight', () => {
    const gap = document.createElement('span');
    gap.className = 'track-delete-dec highlighted';
    viewportHost.appendChild(gap);

    const overlappingHighlight = document.createElement('span');
    overlappingHighlight.className = 'superdoc-comment-highlight';
    overlappingHighlight.setAttribute('data-comment-ids', 'comment-1,comment-2');
    viewportHost.appendChild(overlappingHighlight);

    const elementsFromPoint = stubElementsFromPoint([gap, overlappingHighlight]);

    dispatchPointerDown(gap, { clientX: 24, clientY: 12 });

    expect(elementsFromPoint).toHaveBeenCalled();
    expect(mockEditor.commands.setCursorById).not.toHaveBeenCalled();
    expect(resolvePointerPositionHit).toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).toHaveBeenCalled();
    expect(viewportHost.setPointerCapture).toHaveBeenCalled();
  });
});
