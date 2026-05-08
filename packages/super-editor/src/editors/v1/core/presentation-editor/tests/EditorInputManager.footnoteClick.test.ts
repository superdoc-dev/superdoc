import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { clickToPosition } from '@superdoc/layout-bridge';
import { resolvePointerPositionHit } from '../input/PositionHitResolver.js';
import { TextSelection } from 'prosemirror-state';

const { mockCommentsPluginState } = vi.hoisted(() => ({
  mockCommentsPluginState: { activeThreadId: null as string | null },
}));

import {
  EditorInputManager,
  type EditorInputDependencies,
  type EditorInputCallbacks,
} from '../pointer-events/EditorInputManager.js';

vi.mock('../input/PositionHitResolver.js', () => ({
  resolvePointerPositionHit: vi.fn(() => ({
    pos: 12,
    layoutEpoch: 1,
    pageIndex: 0,
    blockId: 'body-1',
    column: 0,
    lineIndex: -1,
  })),
}));

vi.mock('@superdoc/layout-bridge', () => ({
  clickToPosition: vi.fn(() => ({ pos: 12, layoutEpoch: 1, pageIndex: 0, blockId: 'body-1' })),
  getFragmentAtPosition: vi.fn(() => null),
}));

vi.mock('prosemirror-state', async (importOriginal) => {
  const original = await importOriginal<typeof import('prosemirror-state')>();
  class MockTextSelection {
    empty = true;
    $from = { parent: { inlineContent: true } };
    static create = vi.fn(() => new MockTextSelection());
  }
  return {
    ...original,
    TextSelection: MockTextSelection,
  };
});

vi.mock('@extensions/comment/comments-plugin.js', () => ({
  CommentsPluginKey: {
    getState: vi.fn(() => mockCommentsPluginState),
  },
}));

describe('EditorInputManager - Footnote click selection behavior', () => {
  let manager: EditorInputManager;
  let viewportHost: HTMLElement;
  let visibleHost: HTMLElement;
  let originalElementFromPoint: typeof document.elementFromPoint | undefined;
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
  let activateRenderedNoteSession: Mock;

  beforeEach(() => {
    originalElementFromPoint = document.elementFromPoint?.bind(document);
    mockCommentsPluginState.activeThreadId = null;
    (resolvePointerPositionHit as unknown as Mock).mockReturnValue({
      pos: 12,
      layoutEpoch: 1,
      pageIndex: 0,
      blockId: 'body-1',
      column: 0,
      lineIndex: -1,
    });
    (clickToPosition as unknown as Mock).mockReturnValue({ pos: 12, layoutEpoch: 1, pageIndex: 0, blockId: 'body-1' });
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
        comments$: { activeThreadId: null },
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
      getActiveStorySession: vi.fn(() => null),
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
      activateRenderedNoteSession: vi.fn(() => true),
      normalizeClientPoint: vi.fn((clientX: number, clientY: number) => ({
        x: clientX,
        y: clientY,
        pageIndex: 0,
        pageLocalY: clientY,
      })),
      scheduleSelectionUpdate: vi.fn(),
      updateSelectionDebugHud: vi.fn(),
    };
    activateRenderedNoteSession = mockCallbacks.activateRenderedNoteSession as Mock;

    manager = new EditorInputManager();
    manager.setDependencies(mockDeps);
    manager.setCallbacks(mockCallbacks);
    manager.bind();
  });

  afterEach(() => {
    manager.destroy();
    document.body.innerHTML = '';
    if (originalElementFromPoint) {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    } else {
      Reflect.deleteProperty(document, 'elementFromPoint');
    }
    vi.clearAllMocks();
  });

  function getPointerEventImpl(): typeof PointerEvent | typeof MouseEvent {
    return (
      (globalThis as unknown as { PointerEvent?: typeof PointerEvent; MouseEvent: typeof MouseEvent }).PointerEvent ??
      globalThis.MouseEvent
    );
  }

  function createActiveSessionEditor(docSize = 50) {
    return {
      ...mockEditor,
      state: {
        ...mockEditor.state,
        doc: { ...mockEditor.state.doc, content: { size: docSize } },
        tr: {
          setSelection: vi.fn().mockReturnThis(),
          setStoredMarks: vi.fn().mockReturnThis(),
        },
      },
      view: {
        ...mockEditor.view,
        dispatch: vi.fn(),
      },
    };
  }

  function stubElementFromPoint(element: Element | null): Mock {
    const elementFromPoint = vi.fn(() => element);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });
    return elementFromPoint;
  }

  function stubElementsFromPoint(elements: Array<Element | null>): Mock {
    const elementsFromPoint = vi.fn(() => elements.filter((element): element is Element => !!element));
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: elementsFromPoint,
    });
    return elementsFromPoint;
  }

  function stubBoundingRect(
    element: Element,
    {
      left,
      top,
      width,
      height,
    }: {
      left: number;
      top: number;
      width: number;
      height: number;
    },
  ) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({}),
    } as DOMRect);
  }

  it('activates a note session on direct footnote fragment click', () => {
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

    expect(activateRenderedNoteSession).toHaveBeenCalledWith(
      { storyType: 'footnote', noteId: '1' },
      expect.objectContaining({ clientX: 10, clientY: 10 }),
    );
    expect(TextSelection.create as unknown as Mock).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
  });

  it('activates a note session on direct endnote fragment click', () => {
    const fragmentEl = document.createElement('span');
    fragmentEl.setAttribute('data-block-id', 'endnote-1-0');
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
        clientX: 16,
        clientY: 12,
      } as PointerEventInit),
    );

    expect(activateRenderedNoteSession).toHaveBeenCalledWith(
      { storyType: 'endnote', noteId: '1' },
      expect.objectContaining({ clientX: 16, clientY: 12 }),
    );
    expect(TextSelection.create as unknown as Mock).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
  });

  it('activates the note session and syncs the tracked-change bubble on footnote clicks', () => {
    const fragmentEl = document.createElement('span');
    fragmentEl.setAttribute('data-block-id', 'footnote-1-0');

    const trackedChangeEl = document.createElement('span');
    trackedChangeEl.setAttribute('data-track-change-id', 'tc-1');
    fragmentEl.appendChild(trackedChangeEl);
    viewportHost.appendChild(fragmentEl);

    const PointerEventImpl = getPointerEventImpl();
    trackedChangeEl.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 12,
        clientY: 10,
      } as PointerEventInit),
    );

    expect(activateRenderedNoteSession).toHaveBeenCalledWith(
      { storyType: 'footnote', noteId: '1' },
      expect.objectContaining({ clientX: 12, clientY: 10 }),
    );
    expect(mockEditor.emit).toHaveBeenCalledWith(
      'commentsUpdate',
      expect.objectContaining({
        activeCommentId: 'tc-1',
      }),
    );
  });

  it('keeps legacy read-only behavior for stale footnote hits without a rendered footnote target', () => {
    (resolvePointerPositionHit as unknown as Mock).mockReturnValue({
      pos: 22,
      layoutEpoch: 1,
      pageIndex: 0,
      blockId: 'footnote-1-1',
      column: 0,
      lineIndex: -1,
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

    expect(activateRenderedNoteSession).not.toHaveBeenCalled();
    expect(TextSelection.create as unknown as Mock).not.toHaveBeenCalled();
    expect(mockEditor.state.tr.setSelection).not.toHaveBeenCalled();
  });

  it('does not reactivate the same note session when clicking inside the active note', () => {
    (resolvePointerPositionHit as unknown as Mock).mockReturnValue({
      pos: 22,
      layoutEpoch: 1,
      pageIndex: 0,
      blockId: 'footnote-1-1',
      column: 0,
      lineIndex: -1,
    });

    const activeNoteEditor = {
      ...mockEditor,
      state: {
        ...mockEditor.state,
        doc: { ...mockEditor.state.doc, content: { size: 50 } },
      },
      view: {
        ...mockEditor.view,
        dispatch: vi.fn(),
      },
    };
    (mockDeps.getActiveStorySession as Mock).mockReturnValue({
      kind: 'note',
      locator: { kind: 'story', storyType: 'footnote', noteId: '1' },
      editor: activeNoteEditor,
    });
    (mockDeps.getActiveEditor as Mock).mockReturnValue(activeNoteEditor);

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
        clientX: 12,
        clientY: 14,
      } as PointerEventInit),
    );

    expect(activateRenderedNoteSession).not.toHaveBeenCalled();
    expect(mockEditor.view.focus).toHaveBeenCalled();
  });

  it('does not reactivate the same note session on double-click inside the active note', () => {
    (mockDeps.getActiveStorySession as Mock).mockReturnValue({
      kind: 'note',
      locator: { kind: 'story', storyType: 'footnote', noteId: '1' },
      editor: createActiveSessionEditor(),
    });

    const fragmentEl = document.createElement('span');
    fragmentEl.setAttribute('data-block-id', 'footnote-1-0');
    const nestedEl = document.createElement('span');
    fragmentEl.appendChild(nestedEl);
    viewportHost.appendChild(fragmentEl);

    nestedEl.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 12,
        clientY: 14,
      }),
    );

    expect(activateRenderedNoteSession).not.toHaveBeenCalled();
  });

  it('does not activate a note session on semantic footnotes heading click', () => {
    (resolvePointerPositionHit as unknown as Mock).mockReturnValue(null);

    const headingEl = document.createElement('div');
    headingEl.setAttribute('data-block-id', '__sd_semantic_footnotes_heading');
    const nestedEl = document.createElement('span');
    headingEl.appendChild(nestedEl);
    viewportHost.appendChild(headingEl);

    const PointerEventImpl = getPointerEventImpl();
    nestedEl.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 12,
        clientY: 14,
      } as PointerEventInit),
    );

    expect(activateRenderedNoteSession).not.toHaveBeenCalled();
    expect(mockEditor.view.focus).toHaveBeenCalled();
  });

  it('uses story-surface hit testing for active note clicks', () => {
    const activeNoteEditor = createActiveSessionEditor();
    (mockDeps.getActiveStorySession as Mock).mockReturnValue({
      kind: 'note',
      locator: { kind: 'story', storyType: 'footnote', noteId: '1' },
      editor: activeNoteEditor,
    });
    (mockDeps.getActiveEditor as Mock).mockReturnValue(activeNoteEditor);
    mockCallbacks.hitTest = vi.fn(() => ({
      pos: 41,
      layoutEpoch: 7,
      pageIndex: 0,
      blockId: 'footnote-1-0',
      column: 0,
      lineIndex: -1,
    }));

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
        clientX: 18,
        clientY: 16,
      } as PointerEventInit),
    );

    expect(mockCallbacks.hitTest as Mock).toHaveBeenCalledWith(18, 16);
    expect(resolvePointerPositionHit).not.toHaveBeenCalled();
    expect(mockCallbacks.scheduleSelectionUpdate as Mock).toHaveBeenCalled();
    expect(activeNoteEditor.view.focus).toHaveBeenCalled();
  });

  it('keeps note hit testing while syncing the tracked-change bubble during active note editing', () => {
    const activeNoteEditor = createActiveSessionEditor();
    (mockDeps.getActiveStorySession as Mock).mockReturnValue({
      kind: 'note',
      locator: { kind: 'story', storyType: 'footnote', noteId: '1' },
      editor: activeNoteEditor,
    });
    (mockDeps.getActiveEditor as Mock).mockReturnValue(activeNoteEditor);
    mockCallbacks.hitTest = vi.fn(() => ({
      pos: 21,
      layoutEpoch: 7,
      pageIndex: 0,
      blockId: 'footnote-1-0',
      column: 0,
      lineIndex: -1,
    }));

    const fragmentEl = document.createElement('span');
    fragmentEl.setAttribute('data-block-id', 'footnote-1-0');
    const trackedChangeEl = document.createElement('span');
    trackedChangeEl.setAttribute('data-track-change-id', 'tc-1');
    fragmentEl.appendChild(trackedChangeEl);
    viewportHost.appendChild(fragmentEl);

    const PointerEventImpl = getPointerEventImpl();
    trackedChangeEl.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 18,
        clientY: 16,
      } as PointerEventInit),
    );

    expect(mockCallbacks.hitTest as Mock).toHaveBeenCalledWith(18, 16);
    expect(mockCallbacks.scheduleSelectionUpdate as Mock).toHaveBeenCalled();
    expect(mockEditor.emit).toHaveBeenCalledWith(
      'commentsUpdate',
      expect.objectContaining({
        activeCommentId: 'tc-1',
      }),
    );
  });

  it('uses story-surface hit testing for active header clicks', () => {
    const activeHeaderEditor = createActiveSessionEditor();
    const pageContainer = document.createElement('div');
    pageContainer.className = 'superdoc-page';
    viewportHost.appendChild(pageContainer);

    (mockDeps.getActiveEditor as Mock).mockReturnValue(activeHeaderEditor);
    (mockDeps.getHeaderFooterSession as Mock).mockReturnValue({
      session: { mode: 'header' },
    });
    mockCallbacks.hitTest = vi.fn(() => ({
      pos: 18,
      layoutEpoch: 3,
      pageIndex: 0,
      blockId: 'header-1',
      column: 0,
      lineIndex: -1,
    }));
    mockCallbacks.hitTestHeaderFooterRegion = vi.fn(() => ({
      kind: 'header',
      pageIndex: 0,
      pageNumber: 1,
      sectionType: 'default',
      localX: 0,
      localY: 0,
      width: 200,
      height: 40,
    }));
    stubElementsFromPoint([pageContainer]);

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
        clientY: 12,
      } as PointerEventInit),
    );

    expect(mockCallbacks.hitTest as Mock).toHaveBeenCalledWith(24, 12);
    expect(resolvePointerPositionHit).not.toHaveBeenCalled();
    expect(mockCallbacks.scheduleSelectionUpdate as Mock).toHaveBeenCalled();
    expect(activeHeaderEditor.view.focus).toHaveBeenCalled();
  });

  it('replays active header editor focus when native focus is already inside the hidden editor', () => {
    const activeHeaderEditor = createActiveSessionEditor();
    const pageContainer = document.createElement('div');
    pageContainer.className = 'superdoc-page';
    viewportHost.appendChild(pageContainer);

    activeHeaderEditor.view.dom.tabIndex = -1;
    document.body.appendChild(activeHeaderEditor.view.dom);
    activeHeaderEditor.view.dom.focus();

    (mockDeps.getActiveEditor as Mock).mockReturnValue(activeHeaderEditor);
    (mockDeps.getHeaderFooterSession as Mock).mockReturnValue({
      session: { mode: 'header' },
    });
    mockCallbacks.hitTest = vi.fn(() => ({
      pos: 18,
      layoutEpoch: 3,
      pageIndex: 0,
      blockId: 'header-1',
      column: 0,
      lineIndex: -1,
    }));
    mockCallbacks.hitTestHeaderFooterRegion = vi.fn(() => ({
      kind: 'header',
      pageIndex: 0,
      pageNumber: 1,
      sectionType: 'default',
      localX: 0,
      localY: 0,
      width: 200,
      height: 40,
    }));
    stubElementsFromPoint([pageContainer]);

    expect(document.activeElement).toBe(activeHeaderEditor.view.dom);

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
        clientY: 12,
      } as PointerEventInit),
    );

    expect(activeHeaderEditor.view.focus).toHaveBeenCalled();
  });

  it('keeps active header editing when the pointer stack only exposes the page container', () => {
    const activeHeaderEditor = createActiveSessionEditor();
    const exitHeaderFooterMode = vi.fn();

    const pageContainer = document.createElement('div');
    pageContainer.className = 'superdoc-page';
    viewportHost.appendChild(pageContainer);

    (mockDeps.getActiveEditor as Mock).mockReturnValue(activeHeaderEditor);
    (mockDeps.getHeaderFooterSession as Mock).mockReturnValue({
      session: { mode: 'header' },
    });
    mockCallbacks.exitHeaderFooterMode = exitHeaderFooterMode;
    mockCallbacks.hitTest = vi.fn(() => ({
      pos: 18,
      layoutEpoch: 3,
      pageIndex: 0,
      blockId: 'header-1',
      column: 0,
      lineIndex: -1,
    }));
    mockCallbacks.hitTestHeaderFooterRegion = vi.fn(() => ({
      kind: 'header',
      pageIndex: 0,
      pageNumber: 1,
      sectionType: 'default',
      localX: 0,
      localY: 0,
      width: 200,
      height: 40,
    }));
    manager.setCallbacks(mockCallbacks);
    stubElementsFromPoint([pageContainer]);

    const PointerEventImpl = getPointerEventImpl();
    pageContainer.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 24,
        clientY: 12,
      } as PointerEventInit),
    );

    expect(exitHeaderFooterMode).not.toHaveBeenCalled();
    expect(mockCallbacks.hitTest as Mock).toHaveBeenCalledWith(24, 12);
    expect(mockCallbacks.scheduleSelectionUpdate as Mock).toHaveBeenCalled();
  });

  it('exits active header editing when the topmost visible target is body content even if region hit-testing still says header', () => {
    const activeHeaderEditor = createActiveSessionEditor();
    const exitHeaderFooterMode = vi.fn();

    const visibleHeader = document.createElement('div');
    visibleHeader.className = 'superdoc-page-header';
    viewportHost.appendChild(visibleHeader);

    const bodyLine = document.createElement('div');
    bodyLine.className = 'superdoc-line';
    const bodyText = document.createElement('span');
    bodyText.textContent = 'Visible body text';
    bodyLine.appendChild(bodyText);
    viewportHost.appendChild(bodyLine);
    stubElementFromPoint(bodyText);
    stubElementsFromPoint([bodyText, bodyLine, visibleHeader]);

    (mockDeps.getActiveEditor as Mock).mockReturnValue(activeHeaderEditor);
    (mockDeps.getHeaderFooterSession as Mock).mockReturnValue({
      session: { mode: 'header' },
    });
    mockCallbacks.exitHeaderFooterMode = exitHeaderFooterMode;
    mockCallbacks.hitTest = vi.fn(() => ({
      pos: 24,
      layoutEpoch: 3,
      pageIndex: 0,
      blockId: 'body-1',
      column: 0,
      lineIndex: -1,
    }));
    mockCallbacks.hitTestHeaderFooterRegion = vi.fn(() => ({
      kind: 'header',
      pageIndex: 0,
      pageNumber: 1,
      sectionType: 'default',
      localX: 0,
      localY: 0,
      width: 300,
      height: 220,
    }));
    manager.setCallbacks(mockCallbacks);

    const PointerEventImpl = getPointerEventImpl();
    bodyText.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 30,
        clientY: 220,
      } as PointerEventInit),
    );

    expect(exitHeaderFooterMode).toHaveBeenCalledTimes(1);
    expect(mockCallbacks.hitTest as Mock).toHaveBeenCalledWith(30, 220);
    expect(mockCallbacks.scheduleSelectionUpdate as Mock).toHaveBeenCalled();
  });

  it('keeps the current session alive on the first click into a different header/footer surface', () => {
    const activeHeaderEditor = createActiveSessionEditor();
    const exitHeaderFooterMode = vi.fn();

    const pageEl = document.createElement('div');
    pageEl.className = 'superdoc-page';
    const footerSurface = document.createElement('div');
    footerSurface.className = 'superdoc-page-footer';
    const footerText = document.createElement('span');
    footerText.textContent = 'Footer';
    footerSurface.appendChild(footerText);
    pageEl.appendChild(footerSurface);
    viewportHost.appendChild(pageEl);

    (mockDeps.getActiveEditor as Mock).mockReturnValue(activeHeaderEditor);
    (mockDeps.getHeaderFooterSession as Mock).mockReturnValue({
      session: {
        mode: 'header',
        headerFooterRefId: 'rId6',
        sectionType: 'default',
        pageIndex: 0,
      },
    });
    mockCallbacks.exitHeaderFooterMode = exitHeaderFooterMode;
    mockCallbacks.hitTestHeaderFooterRegion = vi.fn(() => ({
      kind: 'footer',
      headerFooterRefId: 'rId7',
      pageIndex: 0,
      pageNumber: 1,
      sectionType: 'default',
      sectionId: 'section-0',
      sectionIndex: 0,
      localX: 0,
      localY: 180,
      width: 300,
      height: 40,
    }));
    manager.setCallbacks(mockCallbacks);
    stubElementFromPoint(footerText);
    stubElementsFromPoint([footerText, footerSurface, pageEl]);

    const PointerEventImpl = getPointerEventImpl();
    footerText.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 30,
        clientY: 210,
      } as PointerEventInit),
    );

    expect(exitHeaderFooterMode).not.toHaveBeenCalled();
  });

  it('activates a different header/footer region on double-click without requiring a body round-trip', () => {
    const activateHeaderFooterRegion = vi.fn();
    const footerSurface = document.createElement('div');
    footerSurface.className = 'superdoc-page-footer';
    viewportHost.appendChild(footerSurface);

    (mockDeps.getHeaderFooterSession as Mock).mockReturnValue({
      session: {
        mode: 'header',
        headerFooterRefId: 'rId6',
        sectionType: 'default',
        pageIndex: 0,
      },
    });
    mockCallbacks.normalizeClientPoint = vi.fn((clientX: number, clientY: number) => ({
      x: clientX,
      y: clientY,
      pageIndex: 0,
      pageLocalY: clientY,
    }));
    mockCallbacks.activateHeaderFooterRegion = activateHeaderFooterRegion;
    mockCallbacks.hitTestHeaderFooterRegion = vi.fn(() => ({
      kind: 'footer',
      headerFooterRefId: 'rId7',
      pageIndex: 0,
      pageNumber: 1,
      sectionType: 'default',
      sectionId: 'section-0',
      sectionIndex: 0,
      localX: 0,
      localY: 180,
      width: 300,
      height: 40,
    }));
    manager.setCallbacks(mockCallbacks);
    stubElementFromPoint(footerSurface);
    stubElementsFromPoint([footerSurface]);

    footerSurface.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 30,
        clientY: 210,
      }),
    );

    expect(activateHeaderFooterRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'footer',
        headerFooterRefId: 'rId7',
      }),
      expect.objectContaining({
        clientX: 30,
        clientY: 210,
        pageIndex: 0,
        source: 'pointerDoubleClick',
      }),
    );
  });

  it('renders the hover affordance for a different header/footer region while another region is active', () => {
    const renderHover = vi.fn();
    const renderHoverRegion = vi.fn();
    const clearHoverRegion = vi.fn();
    const footerSurface = document.createElement('div');
    footerSurface.className = 'superdoc-page-footer';
    viewportHost.appendChild(footerSurface);

    (mockDeps.getHeaderFooterSession as Mock).mockReturnValue({
      session: {
        mode: 'header',
        headerFooterRefId: 'rId6',
        sectionType: 'default',
        pageIndex: 0,
      },
      hoverRegion: null,
      renderHover,
    });
    mockCallbacks.renderHoverRegion = renderHoverRegion;
    mockCallbacks.clearHoverRegion = clearHoverRegion;
    mockCallbacks.hitTestHeaderFooterRegion = vi.fn(() => ({
      kind: 'footer',
      headerFooterRefId: 'rId7',
      pageIndex: 0,
      pageNumber: 1,
      sectionType: 'default',
      sectionId: 'section-0',
      sectionIndex: 0,
      localX: 0,
      localY: 180,
      width: 300,
      height: 40,
    }));
    manager.setCallbacks(mockCallbacks);

    const PointerEventImpl = getPointerEventImpl();
    footerSurface.dispatchEvent(
      new PointerEventImpl('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: 30,
        clientY: 210,
      } as PointerEventInit),
    );

    expect(renderHover).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'footer',
        headerFooterRefId: 'rId7',
      }),
    );
    expect(renderHoverRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'footer',
        headerFooterRefId: 'rId7',
      }),
    );
    expect(clearHoverRegion).not.toHaveBeenCalled();
  });

  it('keeps the hover affordance hidden for the currently active header/footer region', () => {
    const renderHover = vi.fn();
    const renderHoverRegion = vi.fn();
    const clearHoverRegion = vi.fn();
    const headerSurface = document.createElement('div');
    headerSurface.className = 'superdoc-page-header';
    viewportHost.appendChild(headerSurface);

    (mockDeps.getHeaderFooterSession as Mock).mockReturnValue({
      session: {
        mode: 'header',
        headerFooterRefId: 'rId6',
        sectionType: 'default',
        pageIndex: 0,
      },
      hoverRegion: {
        kind: 'footer',
        headerFooterRefId: 'rId7',
        pageIndex: 0,
        pageNumber: 1,
        sectionType: 'default',
        sectionId: 'section-0',
        sectionIndex: 0,
        localX: 0,
        localY: 180,
        width: 300,
        height: 40,
      },
      renderHover,
    });
    mockCallbacks.renderHoverRegion = renderHoverRegion;
    mockCallbacks.clearHoverRegion = clearHoverRegion;
    mockCallbacks.hitTestHeaderFooterRegion = vi.fn(() => ({
      kind: 'header',
      headerFooterRefId: 'rId6',
      pageIndex: 0,
      pageNumber: 1,
      sectionType: 'default',
      sectionId: 'section-0',
      sectionIndex: 0,
      localX: 0,
      localY: 0,
      width: 300,
      height: 40,
    }));
    manager.setCallbacks(mockCallbacks);

    const PointerEventImpl = getPointerEventImpl();
    headerSurface.dispatchEvent(
      new PointerEventImpl('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: 30,
        clientY: 20,
      } as PointerEventInit),
    );

    expect(clearHoverRegion).toHaveBeenCalledTimes(1);
    expect(renderHover).not.toHaveBeenCalled();
    expect(renderHoverRegion).not.toHaveBeenCalled();
  });

  it('syncs the tracked-change bubble for real clicks inside the active rendered header surface', () => {
    const activeHeaderEditor = createActiveSessionEditor();
    const pageEl = document.createElement('div');
    pageEl.className = 'superdoc-page';
    const activeHeaderSurface = document.createElement('div');
    activeHeaderSurface.className = 'superdoc-page-header';
    const trackedChangeEl = document.createElement('span');
    trackedChangeEl.className = 'track-insert';
    trackedChangeEl.setAttribute('data-id', 'tc-header-1');
    activeHeaderSurface.appendChild(trackedChangeEl);
    pageEl.appendChild(activeHeaderSurface);
    viewportHost.appendChild(pageEl);

    (mockDeps.getActiveEditor as Mock).mockReturnValue(activeHeaderEditor);
    (mockDeps.getHeaderFooterSession as Mock).mockReturnValue({
      session: { mode: 'header' },
    });
    mockCallbacks.hitTestHeaderFooterRegion = vi.fn(() => ({
      kind: 'header',
      pageIndex: 0,
      pageNumber: 1,
      sectionType: 'default',
      localX: 0,
      localY: 0,
      width: 300,
      height: 220,
    }));
    stubElementFromPoint(pageEl);
    stubElementsFromPoint([pageEl]);
    stubBoundingRect(trackedChangeEl, { left: 16, top: 8, width: 52, height: 18 });

    const PointerEventImpl = getPointerEventImpl();
    pageEl.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 20,
        clientY: 12,
      } as PointerEventInit),
    );

    expect(mockEditor.emit).toHaveBeenCalledWith(
      'commentsUpdate',
      expect.objectContaining({
        activeCommentId: 'tc-header-1',
      }),
    );
    expect(resolvePointerPositionHit).toHaveBeenCalled();
  });

  it('clears the active tracked-change bubble for plain clicks inside the active rendered header surface', () => {
    const activeHeaderEditor = createActiveSessionEditor();
    const activeHeaderSurface = document.createElement('div');
    activeHeaderSurface.className = 'superdoc-page-header';
    const plainTextEl = document.createElement('span');
    plainTextEl.textContent = 'Generic content header';
    activeHeaderSurface.appendChild(plainTextEl);
    viewportHost.appendChild(activeHeaderSurface);

    mockCommentsPluginState.activeThreadId = 'tc-header-1';

    (mockDeps.getActiveEditor as Mock).mockReturnValue(activeHeaderEditor);
    (mockDeps.getHeaderFooterSession as Mock).mockReturnValue({
      session: { mode: 'header' },
    });
    mockCallbacks.hitTestHeaderFooterRegion = vi.fn(() => ({
      kind: 'header',
      pageIndex: 0,
      pageNumber: 1,
      sectionType: 'default',
      localX: 0,
      localY: 0,
      width: 300,
      height: 220,
    }));
    stubElementFromPoint(plainTextEl);
    stubElementsFromPoint([activeHeaderSurface]);

    const PointerEventImpl = getPointerEventImpl();
    plainTextEl.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 28,
        clientY: 12,
      } as PointerEventInit),
    );

    expect(mockEditor.emit).toHaveBeenCalledWith(
      'commentsUpdate',
      expect.objectContaining({
        activeCommentId: null,
      }),
    );
    expect(resolvePointerPositionHit).toHaveBeenCalled();
  });

  it('resets multi-click state when the active editing target changes', () => {
    const target = document.createElement('span');
    viewportHost.appendChild(target);

    const selectWordAt = vi.fn(() => true);
    mockCallbacks.selectWordAt = selectWordAt;
    manager.setCallbacks(mockCallbacks);

    const PointerEventImpl = getPointerEventImpl();
    target.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 18,
        clientY: 22,
        pointerId: 1,
      } as PointerEventInit),
    );
    viewportHost.dispatchEvent(
      new PointerEventImpl('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 0,
        clientX: 18,
        clientY: 22,
        pointerId: 1,
      } as PointerEventInit),
    );

    manager.notifyTargetChanged();

    target.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 18,
        clientY: 22,
        pointerId: 2,
      } as PointerEventInit),
    );

    expect(selectWordAt).not.toHaveBeenCalled();
    expect(TextSelection.create as unknown as Mock).toHaveBeenCalledTimes(2);
  });

  it('exits the active footnote session when the resolved hit lands in an endnote with the same note id', () => {
    // Bug: the post-hit-test guard at handlePointerDown only compares
    // `noteId`, not `storyType`. A footnote-1 session that receives a
    // resolved hit on endnote-1 should exit, but currently does not.
    const activeNoteEditor = createActiveSessionEditor();
    const exitActiveStorySession = vi.fn();

    (mockDeps.getActiveStorySession as Mock).mockReturnValue({
      kind: 'note',
      locator: { kind: 'story', storyType: 'footnote', noteId: '1' },
      editor: activeNoteEditor,
    });
    (mockDeps.getActiveEditor as Mock).mockReturnValue(activeNoteEditor);

    // Hit-test (active surface) resolves to an endnote with the same noteId
    // as the active footnote — exposes the storyType-only guard.
    mockCallbacks.hitTest = vi.fn(() => ({
      pos: 18,
      layoutEpoch: 3,
      pageIndex: 0,
      blockId: 'endnote-1-0',
      column: 0,
      lineIndex: -1,
    }));
    mockCallbacks.exitActiveStorySession = exitActiveStorySession;
    manager.setCallbacks(mockCallbacks);

    // Target carries the active footnote's block id so the early
    // clickedNoteTarget branch sees "same active note" and falls through
    // to the post-hit-test guard.
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
        clientX: 24,
        clientY: 12,
      } as PointerEventInit),
    );

    expect(exitActiveStorySession).toHaveBeenCalled();
  });

  it('does not suppress caret placement on a direct .track-insert[data-id] click when the same thread is active', () => {
    // Bug: isDirectTrackedChangeHit only matches `[data-track-change-id]`,
    // but resolveTrackChangeThreadId also matches PM-style selectors like
    // `.track-insert[data-id]`. A click directly on a PM-selector element
    // for the active comment thread gets swallowed by the repeat-click
    // suppression instead of placing a caret.
    mockCommentsPluginState.activeThreadId = 'tc-1';

    const trackedChangeEl = document.createElement('span');
    trackedChangeEl.className = 'track-insert';
    trackedChangeEl.setAttribute('data-id', 'tc-1');
    viewportHost.appendChild(trackedChangeEl);
    stubBoundingRect(trackedChangeEl, { left: 8, top: 10, width: 40, height: 20 });
    stubElementsFromPoint([trackedChangeEl]);

    const PointerEventImpl = getPointerEventImpl();
    trackedChangeEl.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 12,
        clientY: 14,
      } as PointerEventInit),
    );

    // With the bug, the early repeat-click short-circuit consumes the
    // event before the hit resolver runs, so caret placement is lost.
    expect(resolvePointerPositionHit).toHaveBeenCalled();
  });
});
