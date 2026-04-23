import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInitHeaderFooterRegistry } = vi.hoisted(() => ({
  mockInitHeaderFooterRegistry: vi.fn(),
}));

vi.mock('../../header-footer/HeaderFooterRegistryInit.js', () => ({
  initHeaderFooterRegistry: mockInitHeaderFooterRegistry,
}));

import type { Editor } from '../../Editor.js';
import {
  HeaderFooterSessionManager,
  type SessionManagerDependencies,
} from '../header-footer/HeaderFooterSessionManager.js';

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function createMainEditorStub(): Editor {
  return {
    isEditable: true,
    view: {
      focus: vi.fn(),
    },
  } as unknown as Editor;
}

function createHeaderFooterEditorStub(editorDom: HTMLElement): Editor {
  const textNode = editorDom.ownerDocument.createTextNode('abcdefghij');
  editorDom.appendChild(textNode);

  return {
    setEditable: vi.fn(),
    setOptions: vi.fn(),
    commands: {
      setTextSelection: vi.fn(),
      enableTrackChanges: vi.fn(),
      disableTrackChanges: vi.fn(),
      enableTrackChangesShowOriginal: vi.fn(),
      disableTrackChangesShowOriginal: vi.fn(),
    },
    state: {
      doc: {
        content: {
          size: 10,
        },
      },
    },
    view: {
      dom: editorDom,
      focus: vi.fn(),
      state: {
        doc: {
          content: {
            size: 10,
          },
        },
      },
      domAtPos: vi.fn((pos: number) => ({
        node: textNode,
        offset: Math.max(0, Math.min(textNode.length, pos - 1)),
      })),
    },
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as Editor;
}

describe('HeaderFooterSessionManager', () => {
  let manager: HeaderFooterSessionManager;
  let painterHost: HTMLElement;
  let visibleHost: HTMLElement;
  let selectionOverlay: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();

    painterHost = document.createElement('div');
    visibleHost = document.createElement('div');
    selectionOverlay = document.createElement('div');

    document.body.appendChild(painterHost);
    document.body.appendChild(visibleHost);
    document.body.appendChild(selectionOverlay);
  });

  afterEach(() => {
    manager?.destroy();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * Sets up a full manager with an active header region and returns the manager
   * ready for `computeSelectionRects` assertions.
   *
   * The DOM range mock returns a single rect at (120, 90) with size 200x32,
   * and the editor host is at (100, 50) with size 600x120. The header region is
   * at localX=40, localY=30 on page 1 with bodyPageHeight=800.
   */
  async function setupWithZoom(
    zoom: number | undefined,
    documentMode: 'editing' | 'viewing' | 'suggesting' = 'editing',
  ): Promise<HeaderFooterSessionManager> {
    const pageElement = document.createElement('div');
    pageElement.dataset.pageIndex = '1';
    painterHost.appendChild(pageElement);

    const editorHost = document.createElement('div');
    const editorDom = document.createElement('div');
    editorHost.appendChild(editorDom);

    const headerFooterEditor = createHeaderFooterEditorStub(editorDom);
    const descriptor = { id: 'rId-header-default', variant: 'default' };

    const headerFooterManager = {
      getDescriptorById: vi.fn(() => descriptor),
      getDescriptors: vi.fn(() => [descriptor]),
      ensureEditor: vi.fn(async () => headerFooterEditor),
      refresh: vi.fn(),
      destroy: vi.fn(),
    };

    mockInitHeaderFooterRegistry.mockReturnValue({
      headerFooterIdentifier: null,
      headerFooterManager,
      headerFooterAdapter: null,
      cleanups: [],
    });

    manager = new HeaderFooterSessionManager({
      painterHost,
      visibleHost,
      selectionOverlay,
      editor: createMainEditorStub(),
      defaultPageSize: { w: 612, h: 792 },
      defaultMargins: {
        top: 72,
        right: 72,
        bottom: 72,
        left: 72,
        header: 36,
        footer: 36,
      },
    });

    const layoutOptions: Record<string, unknown> = {};
    if (zoom !== undefined) {
      layoutOptions.zoom = zoom;
    }

    const deps: SessionManagerDependencies = {
      getLayoutOptions: vi.fn(() => layoutOptions),
      getPageElement: vi.fn((pageIndex: number) => (pageIndex === 1 ? pageElement : null)),
      scrollPageIntoView: vi.fn(),
      waitForPageMount: vi.fn(async () => true),
      convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
      isViewLocked: vi.fn(() => false),
      getBodyPageHeight: vi.fn(() => 800),
      notifyInputBridgeTargetChanged: vi.fn(),
      scheduleRerender: vi.fn(),
      setPendingDocChange: vi.fn(),
      getBodyPageCount: vi.fn(() => 2),
      getStorySessionManager: vi.fn(() => ({
        activate: vi.fn(() => ({ editor: headerFooterEditor })),
        exit: vi.fn(),
      })),
    };

    manager.setDependencies(deps);
    manager.initialize();
    manager.setDocumentMode(documentMode);
    manager.setLayoutResults(
      [
        {
          kind: 'header',
          type: 'default',
          layout: {
            height: 60,
            pages: [{ number: 2, fragments: [] }],
          },
          blocks: [],
          measures: [],
        },
      ],
      null,
    );

    const headerRegion = {
      kind: 'header' as const,
      headerFooterRefId: 'rId-header-default',
      sectionType: 'default',
      sectionId: 'section-0',
      sectionIndex: 0,
      pageIndex: 1,
      pageNumber: 2,
      localX: 40,
      localY: 30,
      width: 500,
      height: 60,
    };
    manager.headerRegions.set(headerRegion.pageIndex, headerRegion);

    vi.spyOn(editorDom, 'getBoundingClientRect').mockReturnValue(createRect(100, 50, 600, 120));
    vi.spyOn(document, 'createRange').mockReturnValue({
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: vi.fn(() => [createRect(120, 90, 200, 32)]),
    } as unknown as Range);

    manager.activateRegion(headerRegion);
    await vi.waitFor(() => expect(manager.activeEditor).toBe(headerFooterEditor));

    return manager;
  }

  // DOM selection rect: left=120, top=90, w=200, h=32
  // Editor host rect:   left=100, top=50
  // Region: localX=40, localY=30, pageIndex=1, bodyPageHeight=800
  //
  // At zoom Z the expected layout rect is:
  //   x      = 40 + (120 - 100) / Z
  //   y      = 1*800 + 30 + (90 - 50) / Z
  //   width  = 200 / Z
  //   height = 32 / Z

  it('converts DOM selection rects to layout coordinates at zoom=2', async () => {
    await setupWithZoom(2);

    expect(manager.computeSelectionRects(1, 10)).toEqual([{ pageIndex: 1, x: 50, y: 850, width: 100, height: 16 }]);
  });

  it('applies no conversion at zoom=1', async () => {
    await setupWithZoom(1);

    expect(manager.computeSelectionRects(1, 10)).toEqual([{ pageIndex: 1, x: 60, y: 870, width: 200, height: 32 }]);
  });

  it('falls back to zoom=1 when zoom is undefined', async () => {
    await setupWithZoom(undefined);

    expect(manager.computeSelectionRects(1, 10)).toEqual([{ pageIndex: 1, x: 60, y: 870, width: 200, height: 32 }]);
  });

  it('falls back to zoom=1 when zoom is 0', async () => {
    await setupWithZoom(0);

    expect(manager.computeSelectionRects(1, 10)).toEqual([{ pageIndex: 1, x: 60, y: 870, width: 200, height: 32 }]);
  });

  it('falls back to concrete per-rId layouts when variant layout results are unavailable', async () => {
    await setupWithZoom(1);

    manager.headerLayoutResults = null;
    manager.headerLayoutsByRId.set('rId-header-default', {
      kind: 'header',
      type: 'default',
      layout: {
        height: 47,
        pages: [{ number: 2, fragments: [] }],
      },
      blocks: [{ id: 'blank-header-block' }] as never[],
      measures: [{ id: 'blank-header-measure' }] as never[],
    });

    const context = manager.getContext();
    expect(context).toBeTruthy();
    expect(context?.layout.pageSize?.h).toBe(47);
    expect(context?.blocks).toEqual([{ id: 'blank-header-block' }]);
    expect(context?.measures).toEqual([{ id: 'blank-header-measure' }]);
  });

  it('falls back to zoom=1 when zoom is negative', async () => {
    await setupWithZoom(-1);

    expect(manager.computeSelectionRects(1, 10)).toEqual([{ pageIndex: 1, x: 60, y: 870, width: 200, height: 32 }]);
  });

  it('falls back to zoom=1 when zoom is NaN', async () => {
    await setupWithZoom(NaN);

    expect(manager.computeSelectionRects(1, 10)).toEqual([{ pageIndex: 1, x: 60, y: 870, width: 200, height: 32 }]);
  });

  it('uses the requested PM range instead of the live DOM selection', async () => {
    await setupWithZoom(1);

    vi.spyOn(document, 'getSelection').mockReturnValue(null);

    expect(manager.computeSelectionRects(3, 7)).toEqual([{ pageIndex: 1, x: 60, y: 870, width: 200, height: 32 }]);
  });

  it('activates header editing through the story-session manager without creating an overlay host', async () => {
    const pageElement = document.createElement('div');
    pageElement.dataset.pageIndex = '0';
    painterHost.appendChild(pageElement);

    const storyEditor = createHeaderFooterEditorStub(document.createElement('div'));
    const activate = vi.fn(() => ({ editor: storyEditor }));
    const exit = vi.fn();
    const descriptor = { id: 'rId-header-default', variant: 'default' };

    mockInitHeaderFooterRegistry.mockReturnValue({
      headerFooterIdentifier: null,
      headerFooterManager: {
        getDescriptorById: vi.fn(() => descriptor),
        getDescriptors: vi.fn(() => [descriptor]),
        ensureEditor: vi.fn(),
        refresh: vi.fn(),
        destroy: vi.fn(),
      },
      headerFooterAdapter: null,
      cleanups: [],
    });

    manager = new HeaderFooterSessionManager({
      painterHost,
      visibleHost,
      selectionOverlay,
      editor: createMainEditorStub(),
      defaultPageSize: { w: 612, h: 792 },
      defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
    });

    manager.setDependencies({
      getLayoutOptions: vi.fn(() => ({ zoom: 1 })),
      getPageElement: vi.fn(() => pageElement),
      scrollPageIntoView: vi.fn(),
      waitForPageMount: vi.fn(async () => true),
      convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
      isViewLocked: vi.fn(() => false),
      getBodyPageHeight: vi.fn(() => 800),
      notifyInputBridgeTargetChanged: vi.fn(),
      scheduleRerender: vi.fn(),
      setPendingDocChange: vi.fn(),
      getBodyPageCount: vi.fn(() => 3),
      getStorySessionManager: vi.fn(() => ({ activate, exit })),
    });

    manager.initialize();
    manager.setDocumentMode('suggesting');

    const region = {
      kind: 'header' as const,
      headerFooterRefId: 'rId-header-default',
      sectionType: 'default',
      sectionId: 'section-0',
      sectionIndex: 0,
      pageIndex: 0,
      pageNumber: 1,
      localX: 36,
      localY: 24,
      width: 480,
      height: 72,
    };
    manager.headerRegions.set(region.pageIndex, region);

    manager.activateRegion(region);
    await vi.waitFor(() => expect(manager.activeEditor).toBe(storyEditor));

    expect(storyEditor.commands.disableTrackChangesShowOriginal).toHaveBeenCalledTimes(1);
    expect(storyEditor.commands.enableTrackChanges).toHaveBeenCalledTimes(1);
    expect(storyEditor.setOptions).toHaveBeenCalledWith({ documentMode: 'suggesting' });
    expect(activate).toHaveBeenCalledWith(
      {
        kind: 'story',
        storyType: 'headerFooterPart',
        refId: 'rId-header-default',
      },
      expect.objectContaining({
        commitPolicy: 'continuous',
        preferHiddenHost: true,
        hostWidthPx: 480,
        editorContext: expect.objectContaining({
          availableWidth: 480,
          availableHeight: 72,
          currentPageNumber: 1,
          totalPageCount: 3,
          surfaceKind: 'header',
        }),
      }),
    );
  });

  it('enters header edit mode in suggesting mode and enables tracked changes', async () => {
    await setupWithZoom(1, 'suggesting');

    const activeEditor = manager.activeEditor as unknown as {
      commands: {
        disableTrackChangesShowOriginal: ReturnType<typeof vi.fn>;
        enableTrackChanges: ReturnType<typeof vi.fn>;
      };
      setOptions: ReturnType<typeof vi.fn>;
      setEditable: ReturnType<typeof vi.fn>;
      view: { dom: HTMLElement };
    };

    expect(activeEditor.commands.disableTrackChangesShowOriginal).toHaveBeenCalledTimes(1);
    expect(activeEditor.commands.enableTrackChanges).toHaveBeenCalledTimes(1);
    expect(activeEditor.setOptions).toHaveBeenCalledWith({ documentMode: 'suggesting' });
    expect(activeEditor.setEditable).toHaveBeenCalledWith(true);
    expect(activeEditor.view.dom.getAttribute('documentmode')).toBe('suggesting');
    expect(activeEditor.view.dom.getAttribute('aria-readonly')).toBe('false');
  });

  it('updates the active header editor when the document mode changes to suggesting', async () => {
    await setupWithZoom(1);

    const activeEditor = manager.activeEditor as unknown as {
      commands: {
        disableTrackChangesShowOriginal: ReturnType<typeof vi.fn>;
        enableTrackChanges: ReturnType<typeof vi.fn>;
      };
      setOptions: ReturnType<typeof vi.fn>;
      setEditable: ReturnType<typeof vi.fn>;
      view: { dom: HTMLElement };
    };

    activeEditor.commands.disableTrackChangesShowOriginal.mockClear();
    activeEditor.commands.enableTrackChanges.mockClear();
    activeEditor.setOptions.mockClear();
    activeEditor.setEditable.mockClear();

    manager.setDocumentMode('suggesting');

    expect(activeEditor.commands.disableTrackChangesShowOriginal).toHaveBeenCalledTimes(1);
    expect(activeEditor.commands.enableTrackChanges).toHaveBeenCalledTimes(1);
    expect(activeEditor.setOptions).toHaveBeenCalledWith({ documentMode: 'suggesting' });
    expect(activeEditor.setEditable).toHaveBeenCalledWith(true);
    expect(activeEditor.view.dom.getAttribute('documentmode')).toBe('suggesting');
  });

  it('exits the active story session when leaving header/footer mode', async () => {
    const pageElement = document.createElement('div');
    pageElement.dataset.pageIndex = '0';
    painterHost.appendChild(pageElement);

    const storyEditor = createHeaderFooterEditorStub(document.createElement('div'));
    const activate = vi.fn(() => ({ editor: storyEditor }));
    const exit = vi.fn();
    const descriptor = { id: 'rId-header-default', variant: 'default' };

    mockInitHeaderFooterRegistry.mockReturnValue({
      headerFooterIdentifier: null,
      headerFooterManager: {
        getDescriptorById: vi.fn(() => descriptor),
        getDescriptors: vi.fn(() => [descriptor]),
        ensureEditor: vi.fn(),
        refresh: vi.fn(),
        destroy: vi.fn(),
      },
      headerFooterAdapter: null,
      cleanups: [],
    });

    manager = new HeaderFooterSessionManager({
      painterHost,
      visibleHost,
      selectionOverlay,
      editor: createMainEditorStub(),
      defaultPageSize: { w: 612, h: 792 },
      defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
    });

    manager.setDependencies({
      getLayoutOptions: vi.fn(() => ({ zoom: 1 })),
      getPageElement: vi.fn(() => pageElement),
      scrollPageIntoView: vi.fn(),
      waitForPageMount: vi.fn(async () => true),
      convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
      isViewLocked: vi.fn(() => false),
      getBodyPageHeight: vi.fn(() => 800),
      notifyInputBridgeTargetChanged: vi.fn(),
      scheduleRerender: vi.fn(),
      setPendingDocChange: vi.fn(),
      getBodyPageCount: vi.fn(() => 1),
      getStorySessionManager: vi.fn(() => ({ activate, exit })),
    });

    manager.initialize();

    const region = {
      kind: 'header' as const,
      headerFooterRefId: 'rId-header-default',
      sectionType: 'default',
      sectionId: 'section-0',
      sectionIndex: 0,
      pageIndex: 0,
      pageNumber: 1,
      localX: 36,
      localY: 24,
      width: 480,
      height: 72,
    };
    manager.headerRegions.set(region.pageIndex, region);

    manager.activateRegion(region);
    await vi.waitFor(() => expect(manager.activeEditor).toBe(storyEditor));

    manager.exitMode();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(manager.session.mode).toBe('body');
  });
});
