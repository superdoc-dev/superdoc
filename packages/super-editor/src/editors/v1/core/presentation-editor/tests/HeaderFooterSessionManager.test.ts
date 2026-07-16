import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInitHeaderFooterRegistry, mockLayoutPerRIdHeaderFooters } = vi.hoisted(() => ({
  mockInitHeaderFooterRegistry: vi.fn(),
  mockLayoutPerRIdHeaderFooters: vi.fn(),
}));

vi.mock('../../header-footer/HeaderFooterRegistryInit.js', () => ({
  initHeaderFooterRegistry: mockInitHeaderFooterRegistry,
}));

vi.mock('../../header-footer/HeaderFooterPerRidLayout.js', () => ({
  layoutPerRIdHeaderFooters: mockLayoutPerRIdHeaderFooters,
}));

import type { Editor } from '../../Editor.js';
import type {
  FlowBlock,
  HeaderFooterLayout,
  Layout,
  Measure,
  ParaFragment,
  ResolvedLayout,
  ResolvedPage,
  TableFragment,
  DrawingFragment,
} from '@superdoc/contracts';
import { buildMultiSectionIdentifier, type HeaderFooterLayoutResult } from '@superdoc/layout-bridge';
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
    mockLayoutPerRIdHeaderFooters.mockReset();

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

  it('preserves display page numbers in active per-rId layout contexts', async () => {
    await setupWithZoom(1);

    manager.headerLayoutResults = null;
    manager.headerLayoutsByRId.set('rId-header-default', {
      kind: 'header',
      type: 'default',
      layout: {
        height: 47,
        pages: [{ number: 10, numberText: '1', displayNumber: 1, fragments: [] }],
      },
      blocks: [],
      measures: [],
    });

    const context = manager.getContext();
    expect(context?.layout.pages[0]).toMatchObject({
      number: 10,
      numberText: '1',
      displayNumber: 1,
    });
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

    const scheduleRerender = vi.fn();
    const setPendingDocChange = vi.fn();
    manager.setDependencies({
      getLayoutOptions: vi.fn(() => ({ zoom: 1 })),
      getPageElement: vi.fn(() => pageElement),
      scrollPageIntoView: vi.fn(),
      waitForPageMount: vi.fn(async () => true),
      convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
      isViewLocked: vi.fn(() => false),
      getBodyPageHeight: vi.fn(() => 800),
      notifyInputBridgeTargetChanged: vi.fn(),
      scheduleRerender,
      setPendingDocChange,
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
      displayPageNumber: 'i',
      displayPageNumberValue: 1,
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
        commitPolicy: 'onExit',
        preferHiddenHost: true,
        hostWidthPx: 480,
        editorContext: expect.objectContaining({
          availableWidth: 480,
          availableHeight: 72,
          currentPageNumber: 1,
          currentPageNumberText: 'i',
          currentPageDisplayNumber: 1,
          totalPageCount: 3,
          surfaceKind: 'header',
        }),
      }),
    );
    expect(setPendingDocChange).toHaveBeenCalledTimes(1);
    expect(scheduleRerender).toHaveBeenCalledTimes(1);
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

  it('renders and clears the active header/footer divider while editing', async () => {
    await setupWithZoom(1, 'suggesting');

    const border = painterHost.querySelector('.superdoc-header-footer-border') as HTMLElement | null;
    expect(border).toBeTruthy();
    expect(border?.style.top).toBe('90px');

    manager.exitMode();
    expect(painterHost.querySelector('.superdoc-header-footer-border')).toBeNull();
  });

  it('reapplies the initial story selection after focus when entering edit mode', async () => {
    await setupWithZoom(1, 'suggesting');

    const activeEditor = manager.activeEditor as unknown as {
      commands: {
        setTextSelection: ReturnType<typeof vi.fn>;
      };
      view: {
        focus: ReturnType<typeof vi.fn>;
      };
    };

    expect(activeEditor.commands.setTextSelection.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(activeEditor.commands.setTextSelection).toHaveBeenNthCalledWith(1, { from: 9, to: 9 });
    expect(activeEditor.commands.setTextSelection).toHaveBeenNthCalledWith(2, { from: 9, to: 9 });
    expect(activeEditor.view.focus.mock.calls.length).toBeGreaterThanOrEqual(2);
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

  it('syncs a provided header/footer editor to the current document mode', () => {
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
    const storyEditor = createHeaderFooterEditorStub(document.createElement('div')) as unknown as {
      commands: {
        disableTrackChangesShowOriginal: ReturnType<typeof vi.fn>;
        enableTrackChanges: ReturnType<typeof vi.fn>;
      };
      setOptions: ReturnType<typeof vi.fn>;
      setEditable: ReturnType<typeof vi.fn>;
      view: { dom: HTMLElement };
    };

    manager.setDocumentMode('suggesting');
    manager.syncEditorDocumentMode(storyEditor as unknown as Editor);

    expect(storyEditor.commands.disableTrackChangesShowOriginal).toHaveBeenCalledTimes(1);
    expect(storyEditor.commands.enableTrackChanges).toHaveBeenCalledTimes(1);
    expect(storyEditor.setOptions).toHaveBeenCalledWith({ documentMode: 'suggesting' });
    expect(storyEditor.setEditable).toHaveBeenCalledWith(true);
    expect(storyEditor.view.dom.getAttribute('documentmode')).toBe('suggesting');
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

  describe('createDecorationProvider — resolved items', () => {
    function buildHeaderResult(options?: {
      y?: number;
      minY?: number;
      blockId?: string;
      pageNumber?: number;
      type?: HeaderFooterLayoutResult['type'];
    }): HeaderFooterLayoutResult {
      const y = options?.y ?? 10;
      const blockId = options?.blockId ?? 'p1';
      const pageNumber = options?.pageNumber ?? 1;
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId,
        fromLine: 0,
        toLine: 1,
        x: 72,
        y,
        width: 468,
      };
      const layout: HeaderFooterLayout = {
        height: 50,
        ...(options?.minY != null ? { minY: options.minY } : {}),
        pages: [{ number: pageNumber, fragments: [paraFragment] }],
      };
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: blockId, runs: [] }];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 100, ascent: 10, descent: 3, lineHeight: 18 }],
          totalHeight: 18,
        },
      ];
      return { kind: 'header', type: options?.type ?? 'default', layout, blocks, measures };
    }

    it('delivers items aligned 1:1 with fragments when variant layout is used', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };
      manager.setLayoutResults([buildHeaderResult()], null);

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 } } as never],
      } as unknown as Layout;
      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      expect(provider).toBeDefined();
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0] as unknown as ResolvedPage);
      expect(payload).not.toBeNull();
      expect(payload!.fragments).toHaveLength(1);
      expect(payload!.items).toBeDefined();
      expect(payload!.items!.length).toBe(payload!.fragments.length);
      expect(payload!.items![0]!.blockId).toBe('p1');
    });

    it('uses legacy converter-backed selection when the multi-section identifier has no sections', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };
      manager.multiSectionIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
        sectionCount: 0,
        sectionHeaderIds: new Map(),
        sectionFooterIds: new Map(),
        sectionTitlePg: new Map(),
        sections: [],
      };
      manager.setLayoutResults([buildHeaderResult()], null);

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 } } as never],
      } as unknown as Layout;
      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      expect(provider).toBeDefined();
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0] as unknown as ResolvedPage);

      expect(payload).not.toBeNull();
      expect(payload!.headerFooterRefId).toBe('rId-header-default');
      expect(payload!.sectionType).toBe('default');
    });

    it('uses legacy header selection when section resolution only has footer refs', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };
      manager.multiSectionIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
        sectionCount: 1,
        sectionHeaderIds: new Map(),
        sectionFooterIds: new Map([[0, { default: 'rId-footer-default', first: null, even: null, odd: null }]]),
        sectionTitlePg: new Map(),
        sections: [
          {
            sectionIndex: 0,
            titlePg: false,
            footerRefs: { default: 'rId-footer-default', first: null, even: null, odd: null },
          },
        ],
      };
      manager.setLayoutResults([buildHeaderResult()], null);

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
          } as never,
        ],
      } as unknown as Layout;
      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      expect(provider).toBeDefined();
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0] as unknown as ResolvedPage);

      expect(payload).not.toBeNull();
      expect(payload!.headerFooterRefId).toBe('rId-header-default');
      expect(payload!.sectionType).toBe('default');
    });

    it('does not use legacy header selection when section resolution has explicit empty header refs', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };
      manager.multiSectionIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
        sectionCount: 1,
        sectionHeaderIds: new Map([[0, { default: null, first: null, even: null, odd: null }]]),
        sectionFooterIds: new Map(),
        sectionTitlePg: new Map(),
        sections: [
          {
            sectionIndex: 0,
            titlePg: false,
            headerRefs: { default: null, first: null, even: null, odd: null },
          },
        ],
      };
      manager.setLayoutResults([buildHeaderResult()], null);

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
          } as never,
        ],
      } as unknown as Layout;
      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      expect(provider).toBeDefined();
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0] as unknown as ResolvedPage);

      expect(payload).toBeNull();
    });

    it('uses the default variant layout when odd ref lookup falls back to default', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: null, first: null, even: null, odd: 'rId-header-odd' },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: true,
      };
      manager.setLayoutResults([buildHeaderResult()], null);

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            sectionRefs: { headerRefs: { default: 'rId-header-default' }, footerRefs: {} },
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
          } as never,
        ],
      } as unknown as Layout;
      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0] as unknown as ResolvedPage);

      expect(payload).not.toBeNull();
      expect(payload!.headerFooterRefId).toBe('rId-header-default');
      expect(payload!.sectionType).toBe('odd');
      expect(payload!.items?.[0]?.blockId).toBe('p1');
    });

    it('uses the effective Word page number for section odd/even selection', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 3),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: null, first: null, even: 'rId-header-even', odd: 'rId-header-odd' },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: true,
      };
      manager.multiSectionIdentifier = {
        headerIds: { default: null, first: null, even: 'rId-header-even', odd: 'rId-header-odd' },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: true,
        sectionCount: 2,
        sectionHeaderIds: new Map([
          [1, { default: null, first: null, even: 'rId-header-even', odd: 'rId-header-odd' }],
        ]),
        sectionFooterIds: new Map(),
        sectionTitlePg: new Map(),
        sections: [
          { sectionIndex: 0, titlePg: false },
          {
            sectionIndex: 1,
            titlePg: false,
            headerRefs: { default: null, first: null, even: 'rId-header-even', odd: 'rId-header-odd' },
          },
        ],
      };
      manager.setLayoutResults([{ ...buildHeaderResult(), type: 'even' }], null);

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [
          { number: 1, sectionIndex: 0 } as never,
          { number: 2, sectionIndex: 0 } as never,
          {
            number: 3,
            effectivePageNumber: 2,
            sectionIndex: 1,
            sectionRefs: { headerRefs: { even: 'rId-header-even', odd: 'rId-header-odd' }, footerRefs: {} },
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
          } as never,
        ],
      } as unknown as Layout;
      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      const payload = provider!(3, layout.pages[2]!.margins, layout.pages[2] as unknown as ResolvedPage);

      expect(payload).not.toBeNull();
      expect(payload!.headerFooterRefId).toBe('rId-header-even');
      expect(payload!.sectionType).toBe('even');
      expect(payload!.items?.[0]?.blockId).toBe('p1');
    });

    it('recomputes variant items when cached resolved items become misaligned', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };

      const result = buildHeaderResult();
      manager.setLayoutResults([result], null);
      result.layout.pages[0]!.fragments.push({
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 32,
        width: 468,
      });

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 } } as never],
      } as unknown as Layout;
      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0] as unknown as ResolvedPage);

      expect(payload).not.toBeNull();
      expect(payload!.fragments).toHaveLength(2);
      expect(payload!.items).toBeDefined();
      expect(payload!.items).toHaveLength(2);
      expect(payload!.items!.every((item) => item.blockId === 'p1')).toBe(true);
    });

    it('normalizes resolved items when variant layout minY is negative', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };
      manager.setLayoutResults([buildHeaderResult({ y: -12, minY: -12 })], null);

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 } } as never],
      } as unknown as Layout;
      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0] as unknown as ResolvedPage);

      expect(payload).not.toBeNull();
      expect(payload!.fragments[0]!.y).toBe(0);
      expect(payload!.items).toBeDefined();
      expect(payload!.items![0]).toMatchObject({ blockId: 'p1', x: 72, y: 0 });
    });

    it('does not shift foreground anchored header drawings for negative minY', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'header-text',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 0,
        width: 468,
      };
      const drawingFragment: DrawingFragment = {
        kind: 'drawing',
        blockId: 'header-foreground-shape',
        drawingKind: 'vectorShape',
        x: 0,
        y: -49,
        width: 612,
        height: 120,
        isAnchored: true,
        behindDoc: false,
        zIndex: 1,
        geometry: { width: 612, height: 120 },
        scale: 1,
        sourceAnchor: { vRelativeFrom: 'paragraph' },
      };
      const headerResult: HeaderFooterLayoutResult = {
        kind: 'header',
        type: 'default',
        layout: {
          height: 50,
          minY: -49,
          pages: [{ number: 1, fragments: [paraFragment, drawingFragment] }],
        },
        blocks: [
          { kind: 'paragraph', id: 'header-text', runs: [] },
          {
            kind: 'drawing',
            id: 'header-foreground-shape',
            drawingKind: 'vectorShape',
            anchor: { isAnchored: true, vRelativeFrom: 'paragraph', behindDoc: false },
            geometry: { width: 612, height: 120 },
          },
        ] as FlowBlock[],
        measures: [
          {
            kind: 'paragraph',
            lines: [
              { fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 100, ascent: 10, descent: 3, lineHeight: 18 },
            ],
            totalHeight: 18,
          },
          { kind: 'drawing', width: 612, height: 120 },
        ] as unknown as Measure[],
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };
      manager.setLayoutResults([headerResult], null);

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 } } as never],
      } as unknown as Layout;
      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0] as unknown as ResolvedPage);

      expect(payload).not.toBeNull();
      expect(payload!.minY).toBe(-49);
      expect(payload!.fragments).toHaveLength(2);
      expect(payload!.fragments[0]).toMatchObject({ kind: 'para', blockId: 'header-text', y: 0 });
      expect(payload!.fragments[1]).toMatchObject({
        kind: 'drawing',
        blockId: 'header-foreground-shape',
        y: -49,
        isAnchored: true,
        behindDoc: false,
      });
      expect(payload!.items).toHaveLength(2);
      expect(payload!.items![0]).toMatchObject({ fragmentKind: 'para', blockId: 'header-text', y: 0 });
      expect(payload!.items![1]).toMatchObject({ fragmentKind: 'drawing', blockId: 'header-foreground-shape', y: -49 });
    });

    it('does not shift normal rId footer fragments for negative minY from page-relative behindDoc drawings', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };
      const tableFragment: TableFragment = {
        kind: 'table',
        blockId: 'footer-table',
        fromRow: 0,
        toRow: 1,
        x: 72,
        y: 0,
        width: 468,
        height: 24,
      };
      const behindDocFragment: DrawingFragment = {
        kind: 'drawing',
        blockId: 'footer-bg',
        drawingKind: 'vectorShape',
        x: 0,
        y: -36,
        width: 612,
        height: 120,
        isAnchored: true,
        behindDoc: true,
        zIndex: 0,
        geometry: { width: 612, height: 120 },
        scale: 1,
        sourceAnchor: { vRelativeFrom: 'page' },
      } as DrawingFragment;
      const footerResult: HeaderFooterLayoutResult = {
        kind: 'footer',
        type: 'default',
        layout: {
          height: 48,
          minY: -36,
          pages: [{ number: 1, fragments: [tableFragment, behindDocFragment] }],
        },
        blocks: [
          { kind: 'table', id: 'footer-table', rows: [{ id: 'row-1', cells: [] }] },
          {
            kind: 'drawing',
            id: 'footer-bg',
            drawingKind: 'vectorShape',
            anchor: { isAnchored: true, vRelativeFrom: 'page', behindDoc: true },
            geometry: { width: 612, height: 120 },
          },
        ] as FlowBlock[],
        measures: [
          { kind: 'table', rowHeights: [24], columnWidths: [468], cells: [], rows: [] },
          { kind: 'drawing', width: 612, height: 120 },
        ] as unknown as Measure[],
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: null, first: null, even: null, odd: null },
        footerIds: { default: 'rId-footer-default', first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };
      manager.footerLayoutsByRId.set('rId-footer-default', footerResult);

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 } } as never],
      } as unknown as Layout;
      const provider = manager.createDecorationProvider('footer', layout as unknown as ResolvedLayout);
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0] as unknown as ResolvedPage);

      expect(payload).not.toBeNull();
      expect(payload!.minY).toBe(-36);
      expect(payload!.fragments).toHaveLength(2);
      expect(payload!.fragments[0]).toMatchObject({ kind: 'table', blockId: 'footer-table', y: 0 });
      expect(payload!.fragments[1]).toMatchObject({ kind: 'drawing', blockId: 'footer-bg', y: -36, behindDoc: true });
      expect(payload!.items).toHaveLength(2);
      expect(payload!.items![0]).toMatchObject({ fragmentKind: 'table', blockId: 'footer-table', y: 0 });
      expect(payload!.items![1]).toMatchObject({ fragmentKind: 'drawing', blockId: 'footer-bg', y: -36 });
    });

    it('uses section titlePg state when selecting decoration-provider variants', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 2),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: {
          ...createMainEditorStub(),
          converter: {
            headerIds: { titlePg: true },
          },
        } as unknown as Editor,
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.setMultiSectionIdentifier(
        buildMultiSectionIdentifier([
          {
            sectionIndex: 0,
            titlePg: true,
            headerRefs: { first: 'rId-section0-first', default: 'rId-section0-default' },
          },
          {
            sectionIndex: 1,
            titlePg: false,
            headerRefs: { first: 'rId-section1-first', default: 'rId-section1-default' },
          },
        ]),
      );
      manager.setLayoutResults(
        [
          buildHeaderResult({ type: 'first', blockId: 'first-block', pageNumber: 2 }),
          buildHeaderResult({ type: 'default', blockId: 'default-block', pageNumber: 2 }),
        ],
        null,
      );

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
          },
          {
            number: 2,
            sectionIndex: 1,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { first: 'rId-section1-first', default: 'rId-section1-default' },
              footerRefs: {},
            },
          },
        ] as never,
      } as unknown as Layout;

      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      const payload = provider!(2, layout.pages[1]!.margins, layout.pages[1] as unknown as ResolvedPage);

      expect(payload).not.toBeNull();
      expect(payload!.sectionType).toBe('default');
      expect(payload!.items![0]!.blockId).toBe('default-block');
    });

    it('does not render default headers on even pages when alternate headers are enabled', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 2),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.setMultiSectionIdentifier(
        buildMultiSectionIdentifier([{ sectionIndex: 0, headerRefs: { default: 'rId-header-default' } }], {
          alternateHeaders: true,
        }),
      );
      manager.setLayoutResults([buildHeaderResult({ type: 'even', blockId: 'even-block', pageNumber: 2 })], null);

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
          },
          {
            number: 2,
            sectionIndex: 0,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { default: 'rId-header-default' },
              footerRefs: {},
            },
          },
        ] as never,
      } as unknown as Layout;

      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      const payload = provider!(2, layout.pages[1]!.margins, layout.pages[1] as unknown as ResolvedPage);

      expect(payload).toBeNull();
    });

    it('normalizes resolved items when per-rId layout minY is negative', async () => {
      mockLayoutPerRIdHeaderFooters.mockImplementation(
        async (
          _input: unknown,
          _layout: unknown,
          _sectionMetadata: unknown,
          deps: { headerLayoutsByRId: Map<string, HeaderFooterLayoutResult> },
        ) => {
          deps.headerLayoutsByRId.set('rId-header-default', buildHeaderResult({ y: -12, minY: -12 }));
        },
      );

      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { default: 'rId-header-default', first: undefined, even: undefined },
              footerRefs: {},
            },
          } as never,
        ],
      } as unknown as Layout;

      await manager.layoutPerRId(
        {
          headerBlocksByRId: new Map(),
          footerBlocksByRId: new Map(),
          constraints: {
            width: 468,
            height: 648,
            pageWidth: 612,
            pageHeight: 792,
            margins: { left: 72, right: 72, top: 72, bottom: 72, header: 36 },
            overflowBaseHeight: 36,
          },
        },
        layout,
        [{ sectionIndex: 0 } as never],
      );

      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0] as unknown as ResolvedPage);

      expect(mockLayoutPerRIdHeaderFooters).toHaveBeenCalledTimes(1);
      expect(payload).not.toBeNull();
      expect(payload!.fragments[0]!.y).toBe(0);
      expect(payload!.items).toBeDefined();
      expect(payload!.items![0]).toMatchObject({ blockId: 'p1', x: 72, y: 0 });
    });

    it('recomputes per-rId items when cached resolved items become misaligned', async () => {
      mockLayoutPerRIdHeaderFooters.mockImplementation(
        async (
          _input: unknown,
          _layout: unknown,
          _sectionMetadata: unknown,
          deps: { headerLayoutsByRId: Map<string, HeaderFooterLayoutResult> },
        ) => {
          deps.headerLayoutsByRId.set('rId-header-default', buildHeaderResult());
        },
      );

      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.headerFooterIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { default: 'rId-header-default', first: undefined, even: undefined },
              footerRefs: {},
            },
          } as never,
        ],
      } as unknown as Layout;

      await manager.layoutPerRId(
        {
          headerBlocksByRId: new Map(),
          footerBlocksByRId: new Map(),
          constraints: {
            width: 468,
            height: 648,
            pageWidth: 612,
            pageHeight: 792,
            margins: { left: 72, right: 72, top: 72, bottom: 72, header: 36 },
            overflowBaseHeight: 36,
          },
        },
        layout,
        [{ sectionIndex: 0 } as never],
      );

      const rIdResult = manager.headerLayoutsByRId.get('rId-header-default');
      expect(rIdResult).toBeDefined();
      rIdResult!.layout.pages[0]!.fragments.push({
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 32,
        width: 468,
      });

      const provider = manager.createDecorationProvider('header', layout as unknown as ResolvedLayout);
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0] as unknown as ResolvedPage);

      expect(payload).not.toBeNull();
      expect(payload!.fragments).toHaveLength(2);
      expect(payload!.items).toBeDefined();
      expect(payload!.items).toHaveLength(2);
      expect(payload!.items!.every((item) => item.blockId === 'p1')).toBe(true);
    });

    it('uses displayNumber parity when resolving per-rId header layouts', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.setMultiSectionIdentifier(
        buildMultiSectionIdentifier([{ sectionIndex: 0, headerRefs: { default: 'rId-default', even: 'rId-even' } }], {
          alternateHeaders: true,
        }),
      );

      const evenFragment: ParaFragment = {
        kind: 'para',
        blockId: 'even-header',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 10,
        width: 468,
      };
      manager.headerLayoutsByRId.set('rId-default', buildHeaderResult());
      manager.headerLayoutsByRId.set('rId-even', {
        kind: 'header',
        type: 'even',
        layout: { height: 50, pages: [{ number: 1, fragments: [evenFragment] }] },
        blocks: [{ kind: 'paragraph', id: 'even-header', runs: [] }],
        measures: [
          {
            kind: 'paragraph',
            lines: [
              { fromRun: 0, fromChar: 0, toRun: 0, toChar: 0, width: 100, ascent: 10, descent: 3, lineHeight: 18 },
            ],
            totalHeight: 18,
          },
        ],
      });

      const page = {
        number: 1,
        displayNumber: 2,
        sectionIndex: 0,
        height: 792,
        margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
        sectionRefs: { headerRefs: { default: 'rId-default', even: 'rId-even' }, footerRefs: {} },
      } as unknown as ResolvedPage;
      const layout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [page],
      };

      const provider = manager.createDecorationProvider('header', layout);
      const payload = provider!(1, page.margins, page);

      expect(payload).not.toBeNull();
      expect(payload!.sectionType).toBe('even');
      expect(payload!.headerFooterRefId).toBe('rId-even');
      expect(payload!.fragments[0]!.blockId).toBe('even-header');
    });
    it('inherits first-page header refs through intermediate sections that omit first refs', () => {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 3),
      };

      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: createMainEditorStub(),
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies(deps);
      manager.setMultiSectionIdentifier(
        buildMultiSectionIdentifier([
          { sectionIndex: 0, titlePg: true, headerRefs: { first: 'rId-s0-first', default: 'rId-s0-default' } },
          { sectionIndex: 1, titlePg: true, headerRefs: { default: 'rId-s1-default' } },
          { sectionIndex: 2, titlePg: true, headerRefs: { default: 'rId-s2-default' } },
        ]),
      );
      manager.headerLayoutsByRId.set('rId-s0-first', buildHeaderResult({ blockId: 's0-first-header' }));
      manager.headerLayoutsByRId.set('rId-s2-default', buildHeaderResult({ blockId: 's2-default-header' }));

      const layout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            height: 792,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs: { headerRefs: { first: 'rId-s0-first', default: 'rId-s0-default' }, footerRefs: {} },
          } as unknown as ResolvedPage,
          {
            number: 2,
            sectionIndex: 1,
            height: 792,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs: { headerRefs: { default: 'rId-s1-default' }, footerRefs: {} },
          } as unknown as ResolvedPage,
          {
            number: 3,
            sectionIndex: 2,
            height: 792,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs: { headerRefs: { default: 'rId-s2-default' }, footerRefs: {} },
          } as unknown as ResolvedPage,
        ],
      };

      const provider = manager.createDecorationProvider('header', layout);
      const page = layout.pages[2]!;
      const payload = provider!(page.number, page.margins, page);

      expect(payload).not.toBeNull();
      expect(payload!.sectionType).toBe('first');
      expect(payload!.headerFooterRefId).toBe('rId-s0-first');
      expect(payload!.fragments[0]!.blockId).toBe('s0-first-header');
    });
  });

  describe('rebuildRegions — ResolvedLayout entry', () => {
    function buildManager(editor: Editor = createMainEditorStub()): HeaderFooterSessionManager {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };

      const m = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor,
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      m.setDependencies(deps);
      return m;
    }

    function makePage(overrides: Partial<ResolvedPage> & { number: number; height: number }): ResolvedPage {
      return {
        id: `page-${overrides.number - 1}`,
        index: overrides.number - 1,
        width: 612,
        items: [],
        margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
        ...overrides,
      } as ResolvedPage;
    }

    it('shrinks footer height by footnoteReserved and shifts its offset upward', () => {
      manager = buildManager();
      const layout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [makePage({ number: 1, height: 792 }), makePage({ number: 2, height: 792, footnoteReserved: 24 })],
      };

      manager.rebuildRegions(layout);

      // Page 1: untouched. height = bottom - footer = 72 - 36 = 36; offset = 792 - 72 = 720.
      const baseline = manager.footerRegions.get(0)!;
      expect(baseline.height).toBe(36);
      expect(baseline.localY).toBe(720);

      // Page 2: bottom shrinks to 72 - 24 = 48. height = 48 - 36 = 12; offset = 792 - 48 = 744.
      const reserved = manager.footerRegions.get(1)!;
      expect(reserved.height).toBe(12);
      expect(reserved.localY).toBe(744);
    });

    it('honors per-page height variation when computing footer offsets', () => {
      manager = buildManager();
      const layout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [
          makePage({ number: 1, height: 792 }),
          makePage({ number: 2, height: 1000 }),
          makePage({ number: 3, height: 1400 }),
        ],
      };

      manager.rebuildRegions(layout);

      // offset = pageHeight - bottom margin (72)
      expect(manager.footerRegions.get(0)!.localY).toBe(792 - 72);
      expect(manager.footerRegions.get(1)!.localY).toBe(1000 - 72);
      expect(manager.footerRegions.get(2)!.localY).toBe(1400 - 72);
    });

    it('propagates sectionIndex from ResolvedPage onto built regions', () => {
      manager = buildManager();
      const layout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [
          makePage({ number: 1, height: 792, sectionIndex: 0 }),
          makePage({ number: 2, height: 792, sectionIndex: 1 }),
          makePage({ number: 3, height: 792, sectionIndex: 1 }),
        ],
      };

      manager.rebuildRegions(layout);

      expect(manager.headerRegions.get(0)!.sectionIndex).toBe(0);
      expect(manager.headerRegions.get(1)!.sectionIndex).toBe(1);
      expect(manager.headerRegions.get(2)!.sectionIndex).toBe(1);
      expect(manager.footerRegions.get(2)!.sectionIndex).toBe(1);
    });

    it('uses displayNumber parity when inferring header/footer region variants', () => {
      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: {
          ...createMainEditorStub(),
          converter: { pageStyles: { alternateHeaders: true } },
        } as unknown as Editor,
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies({
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      });

      manager.rebuildRegions({
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [makePage({ number: 1, displayNumber: 2, height: 792 })],
      });

      expect(manager.headerRegions.get(0)!.sectionType).toBe('even');
      expect(manager.footerRegions.get(0)!.sectionType).toBe('even');
    });
    it('uses multi-section alternateHeaders state when inferring fallback region variants', () => {
      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: {
          ...createMainEditorStub(),
          converter: { pageStyles: { alternateHeaders: false } },
        } as unknown as Editor,
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies({
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      });
      manager.setMultiSectionIdentifier(
        buildMultiSectionIdentifier(
          [
            {
              sectionIndex: 0,
              titlePg: false,
              headerRefs: { default: 'rId-default', even: 'rId-even' },
              footerRefs: { default: 'rId-default-footer', even: 'rId-even-footer' },
            },
          ],
          { alternateHeaders: true },
        ),
      );

      manager.rebuildRegions({
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [makePage({ number: 1, displayNumber: 2, height: 792 })],
      });

      expect(manager.headerRegions.get(0)!.sectionType).toBe('even');
      expect(manager.footerRegions.get(0)!.sectionType).toBe('even');
    });

    it('uses section titlePg state when inferring fallback region variants', () => {
      manager = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor: {
          ...createMainEditorStub(),
          converter: {
            headerIds: { titlePg: true },
            footerIds: { titlePg: true },
            pageStyles: { alternateHeaders: false },
          },
        } as unknown as Editor,
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      manager.setDependencies({
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 2),
      });
      manager.setMultiSectionIdentifier(
        buildMultiSectionIdentifier(
          [
            {
              sectionIndex: 0,
              titlePg: true,
              headerRefs: { first: 'rId-section0-first', default: 'rId-section0-default' },
              footerRefs: { first: 'rId-section0-first-footer', default: 'rId-section0-default-footer' },
            },
            {
              sectionIndex: 1,
              titlePg: false,
              headerRefs: { first: 'rId-section1-first', default: 'rId-section1-default' },
              footerRefs: { first: 'rId-section1-first-footer', default: 'rId-section1-default-footer' },
            },
          ],
          { alternateHeaders: false },
        ),
      );

      manager.rebuildRegions({
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [
          makePage({ number: 1, height: 792, sectionIndex: 0 }),
          makePage({ number: 2, height: 792, sectionIndex: 1 }),
        ],
      });

      expect(manager.headerRegions.get(0)!.sectionType).toBe('first');
      expect(manager.footerRegions.get(0)!.sectionType).toBe('first');
      expect(manager.headerRegions.get(1)!.sectionType).toBe('default');
      expect(manager.footerRegions.get(1)!.sectionType).toBe('default');
    });
    it('uses effective Word page number for fallback odd/even region type', () => {
      manager = buildManager({
        ...createMainEditorStub(),
        converter: { pageStyles: { alternateHeaders: true } },
      } as unknown as Editor);
      const layout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [
          makePage({ number: 1, height: 792, sectionIndex: 0 }),
          makePage({ number: 2, height: 792, sectionIndex: 0 }),
          makePage({ number: 3, effectivePageNumber: 2, height: 792, sectionIndex: 1 }),
        ],
      };

      manager.rebuildRegions(layout);

      expect(manager.headerRegions.get(2)!.sectionType).toBe('even');
      expect(manager.footerRegions.get(2)!.sectionType).toBe('even');
    });

    it('propagates section-aware page display values onto built regions', () => {
      manager = buildManager();
      const layout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [
          makePage({
            number: 7,
            height: 792,
            numberText: 'iii',
            displayNumber: 3,
          }),
        ],
      };

      manager.rebuildRegions(layout);

      expect(manager.headerRegions.get(0)!.displayPageNumber).toBe('iii');
      expect(manager.headerRegions.get(0)!.displayPageNumberValue).toBe(3);
      expect(manager.footerRegions.get(0)!.displayPageNumber).toBe('iii');
      expect(manager.footerRegions.get(0)!.displayPageNumberValue).toBe(3);
    });
  });

  describe('getHeaderFooterLayoutSnapshot — read-only story-part snapshot', () => {
    function buildSnapshotManager(editor: Editor = createMainEditorStub()): HeaderFooterSessionManager {
      const deps: SessionManagerDependencies = {
        getLayoutOptions: vi.fn(() => ({})),
        getPageElement: vi.fn(() => null),
        scrollPageIntoView: vi.fn(),
        waitForPageMount: vi.fn(async () => true),
        convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
        isViewLocked: vi.fn(() => false),
        getBodyPageHeight: vi.fn(() => 800),
        notifyInputBridgeTargetChanged: vi.fn(),
        scheduleRerender: vi.fn(),
        setPendingDocChange: vi.fn(),
        getBodyPageCount: vi.fn(() => 1),
      };
      const m = new HeaderFooterSessionManager({
        painterHost,
        visibleHost,
        selectionOverlay,
        editor,
        defaultPageSize: { w: 612, h: 792 },
        defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
      });
      m.setDependencies(deps);
      return m;
    }

    function makeResult(
      kind: 'header' | 'footer',
      blockId: string,
      options?: { y?: number; pageNumber?: number },
    ): HeaderFooterLayoutResult {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId,
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: options?.y ?? 10,
        width: 468,
      };
      return {
        kind,
        type: 'default',
        layout: { height: 50, pages: [{ number: options?.pageNumber ?? 1, fragments: [paraFragment] }] },
        blocks: [{ kind: 'paragraph', id: blockId, runs: [] }] as FlowBlock[],
        measures: [
          {
            kind: 'paragraph',
            lines: [
              { fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 100, ascent: 10, descent: 3, lineHeight: 18 },
            ],
            totalHeight: 18,
          },
        ] as unknown as Measure[],
      };
    }

    const PER_RID_INPUT = {
      headerBlocksByRId: new Map(),
      footerBlocksByRId: new Map(),
      constraints: {
        width: 468,
        height: 648,
        pageWidth: 612,
        pageHeight: 792,
        margins: { left: 72, right: 72, top: 72, bottom: 72, header: 36 },
        overflowBaseHeight: 36,
      },
    } as const;

    it('returns an empty but well-formed snapshot when there are no headers/footers', () => {
      manager = buildSnapshotManager();

      const snapshot = manager.getHeaderFooterLayoutSnapshot();

      expect(snapshot).toEqual({
        pageBindings: [],
        storyLayouts: { headers: [], footers: [] },
      });
      // Plain, JSON-safe data round-trips without loss.
      expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    });

    it('omits fallback margin-box page bindings when no header/footer story is bound', () => {
      manager = buildSnapshotManager();

      const layout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            height: 792,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: {},
              footerRefs: {},
            },
          } as unknown as ResolvedPage,
        ],
      };

      manager.updateDecorationProviders(layout);

      expect(manager.headerRegions.size).toBe(1);
      expect(manager.footerRegions.size).toBe(1);
      expect(manager.getHeaderFooterLayoutSnapshot()).toEqual({
        pageBindings: [],
        storyLayouts: { headers: [], footers: [] },
      });
    });

    it('preserves header contentHeight from the decoration payload in page bindings', () => {
      manager = buildSnapshotManager();
      manager.headerFooterIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };
      manager.setLayoutResults([makeResult('header', 'header-block')], null);

      const layout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            height: 792,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { default: 'rId-header-default' },
              footerRefs: {},
            },
          } as unknown as ResolvedPage,
        ],
      };

      manager.updateDecorationProviders(layout);

      expect(manager.headerRegions.get(0)!.contentHeight).toBe(50);
      expect(manager.getHeaderFooterLayoutSnapshot().pageBindings[0]!.header!.region!.contentHeight).toBe(50);
    });

    it('exposes per-page bindings and per-story raw/resolved summaries from the real maps', async () => {
      manager = buildSnapshotManager();

      mockLayoutPerRIdHeaderFooters.mockImplementation(
        async (
          _input: unknown,
          _layout: unknown,
          _sectionMetadata: unknown,
          deps: {
            headerLayoutsByRId: Map<string, HeaderFooterLayoutResult>;
            footerLayoutsByRId: Map<string, HeaderFooterLayoutResult>;
          },
        ) => {
          deps.headerLayoutsByRId.set('rId-header-default', makeResult('header', 'header-block'));
          deps.footerLayoutsByRId.set('rId-footer-default', makeResult('footer', 'footer-block'));
        },
      );

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, sectionIndex: 0 } as never],
      } as unknown as Layout;
      await manager.layoutPerRId(PER_RID_INPUT, layout, [{ sectionIndex: 0 } as never]);

      manager.headerRegions.set(0, {
        kind: 'header',
        headerFooterRefId: 'rId-header-default',
        sectionType: 'default',
        sectionId: 'section-0',
        sectionIndex: 0,
        pageIndex: 0,
        pageNumber: 1,
        localX: 72.0001,
        localY: 36,
        width: 468,
        height: 36,
      });
      manager.footerRegions.set(0, {
        kind: 'footer',
        headerFooterRefId: 'rId-footer-default',
        sectionType: 'default',
        sectionId: 'section-0',
        sectionIndex: 0,
        pageIndex: 0,
        pageNumber: 1,
        localX: 72,
        localY: 720,
        width: 468,
        height: 36,
        contentHeight: 20,
      });

      const snapshot = manager.getHeaderFooterLayoutSnapshot();

      expect(snapshot.pageBindings).toHaveLength(1);
      const binding = snapshot.pageBindings[0]!;
      expect(binding).toMatchObject({ pageIndex: 0, pageNumber: 1, sectionIndex: 0 });
      expect(binding.header).toMatchObject({
        storyKey: 'header::rId-header-default',
        refId: 'rId-header-default',
        variant: 'default',
      });
      // Geometry is rounded to 3 decimals.
      expect(binding.header!.region).toEqual({ localX: 72, localY: 36, width: 468, height: 36, contentHeight: null });
      expect(binding.footer).toMatchObject({ storyKey: 'footer::rId-footer-default', refId: 'rId-footer-default' });
      expect(binding.footer!.region!.contentHeight).toBe(20);

      expect(snapshot.storyLayouts.headers).toHaveLength(1);
      const headerStory = snapshot.storyLayouts.headers[0]!;
      expect(headerStory.storyKey).toBe('header::rId-header-default');
      expect(headerStory.kind).toBe('header');
      expect(headerStory.refId).toBe('rId-header-default');
      expect(headerStory.sectionIndices).toEqual([0]);
      expect(headerStory.rawLayout).not.toBeNull();
      expect(headerStory.rawLayout!.pages[0]!.fragments[0]).toEqual({
        kind: 'para',
        blockId: 'header-block',
        x: 72,
        y: 10,
        width: 468,
        height: null,
      });
      // Resolved summary is populated from the manager's resolved-by-rId map.
      expect(headerStory.resolvedLayout).not.toBeNull();
      expect(headerStory.resolvedLayout!.pages[0]!.items.length).toBeGreaterThan(0);
      expect(headerStory.resolvedLayout!.pages[0]!.items[0]!.blockId).toBe('header-block');

      expect(snapshot.storyLayouts.footers).toHaveLength(1);
      expect(snapshot.storyLayouts.footers[0]!.refId).toBe('rId-footer-default');

      // No Maps, class instances, or undefined leak into serialized output.
      expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    });

    it('produces distinct, section-aware story keys when the same refId is reused across sections', async () => {
      manager = buildSnapshotManager();

      mockLayoutPerRIdHeaderFooters.mockImplementation(
        async (
          _input: unknown,
          _layout: unknown,
          _sectionMetadata: unknown,
          deps: { headerLayoutsByRId: Map<string, HeaderFooterLayoutResult> },
        ) => {
          deps.headerLayoutsByRId.set('rId-shared::s0', makeResult('header', 'block-s0'));
          deps.headerLayoutsByRId.set('rId-shared::s1', makeResult('header', 'block-s1'));
        },
      );

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, sectionIndex: 0 } as never, { number: 2, sectionIndex: 1 } as never],
      } as unknown as Layout;
      await manager.layoutPerRId(PER_RID_INPUT, layout, [{ sectionIndex: 0 } as never, { sectionIndex: 1 } as never]);

      manager.headerRegions.set(0, {
        kind: 'header',
        headerFooterRefId: 'rId-shared',
        sectionType: 'default',
        sectionId: 'section-0',
        sectionIndex: 0,
        pageIndex: 0,
        pageNumber: 1,
        localX: 72,
        localY: 36,
        width: 468,
        height: 36,
      });
      manager.headerRegions.set(1, {
        kind: 'header',
        headerFooterRefId: 'rId-shared',
        sectionType: 'default',
        sectionId: 'section-1',
        sectionIndex: 1,
        pageIndex: 1,
        pageNumber: 2,
        localX: 72,
        localY: 36,
        width: 468,
        height: 36,
      });

      const snapshot = manager.getHeaderFooterLayoutSnapshot();

      // Page bindings resolve to section-aware keys, not a bare refId.
      expect(snapshot.pageBindings.map((b) => b.header!.storyKey)).toEqual([
        'header::rId-shared::s0',
        'header::rId-shared::s1',
      ]);

      const storyKeys = snapshot.storyLayouts.headers.map((s) => s.storyKey);
      expect(storyKeys).toEqual(['header::rId-shared::s0', 'header::rId-shared::s1']);
      // Same underlying part, distinct section-aware identities.
      expect(snapshot.storyLayouts.headers.every((s) => s.refId === 'rId-shared')).toBe(true);
      expect(snapshot.storyLayouts.headers[0]!.sectionIndices).toEqual([0]);
      expect(snapshot.storyLayouts.headers[1]!.sectionIndices).toEqual([1]);
    });

    it('per-page bindings match the resolved first/even/default variant selection', () => {
      manager = buildSnapshotManager();
      manager.setMultiSectionIdentifier(
        buildMultiSectionIdentifier(
          [
            {
              sectionIndex: 0,
              titlePg: true,
              headerRefs: { first: 'rId-first', even: 'rId-even', default: 'rId-default' },
            },
          ],
          { alternateHeaders: true },
        ),
      );
      manager.headerLayoutsByRId.set('rId-first', makeResult('header', 'first-block', { pageNumber: 1 }));
      manager.headerLayoutsByRId.set('rId-even', makeResult('header', 'even-block', { pageNumber: 2 }));
      manager.headerLayoutsByRId.set('rId-default', makeResult('header', 'default-block', { pageNumber: 3 }));

      const sectionRefs = {
        headerRefs: { first: 'rId-first', even: 'rId-even', default: 'rId-default' },
        footerRefs: {},
      };
      const layout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            height: 792,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs,
          } as unknown as ResolvedPage,
          {
            number: 2,
            sectionIndex: 0,
            effectivePageNumber: 2,
            height: 792,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs,
          } as unknown as ResolvedPage,
          {
            number: 3,
            sectionIndex: 0,
            effectivePageNumber: 3,
            height: 792,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs,
          } as unknown as ResolvedPage,
        ],
      };

      // Real decoration-provider path resolves the active variant per page and
      // stamps the concrete refId onto each region.
      manager.updateDecorationProviders(layout);

      const snapshot = manager.getHeaderFooterLayoutSnapshot();

      expect(snapshot.pageBindings).toHaveLength(3);
      expect(snapshot.pageBindings[0]!.header).toMatchObject({ variant: 'first', refId: 'rId-first' });
      expect(snapshot.pageBindings[1]!.header).toMatchObject({ variant: 'even', refId: 'rId-even' });
      // Odd page with no odd ref resolves to the default header part.
      expect(snapshot.pageBindings[2]!.header).toMatchObject({ variant: 'default', refId: 'rId-default' });

      // The first/even/default stories are all surfaced and distinct.
      expect(snapshot.storyLayouts.headers.map((s) => s.refId).sort()).toEqual([
        'rId-default',
        'rId-even',
        'rId-first',
      ]);
    });

    it('keeps page-binding story keys joinable when only variant-based layouts are available', () => {
      manager = buildSnapshotManager();
      manager.headerFooterIdentifier = {
        headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
        footerIds: { default: null, first: null, even: null, odd: null },
        titlePg: false,
        alternateHeaders: false,
      };
      manager.setLayoutResults([makeResult('header', 'default-block')], null);

      const layout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            height: 792,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { default: 'rId-header-default' },
              footerRefs: {},
            },
          } as unknown as ResolvedPage,
        ],
      };

      manager.updateDecorationProviders(layout);

      const snapshot = manager.getHeaderFooterLayoutSnapshot();

      expect(snapshot.pageBindings).toHaveLength(1);
      expect(snapshot.pageBindings[0]!.header).toMatchObject({
        storyKey: 'header::rId-header-default::s0',
        refId: 'rId-header-default',
        variant: 'default',
      });
      expect(snapshot.storyLayouts.headers).toHaveLength(1);
      expect(snapshot.storyLayouts.headers[0]).toMatchObject({
        storyKey: 'header::rId-header-default::s0',
        refId: 'rId-header-default',
        sectionIndices: [0],
      });
    });

    it('returns deterministic snapshots across repeated calls', async () => {
      manager = buildSnapshotManager();
      mockLayoutPerRIdHeaderFooters.mockImplementation(
        async (
          _input: unknown,
          _layout: unknown,
          _sectionMetadata: unknown,
          deps: { headerLayoutsByRId: Map<string, HeaderFooterLayoutResult> },
        ) => {
          // Insert out of natural order to prove the builder sorts deterministically.
          deps.headerLayoutsByRId.set('rId-10', makeResult('header', 'block-10'));
          deps.headerLayoutsByRId.set('rId-2', makeResult('header', 'block-2'));
        },
      );

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, sectionIndex: 0 } as never],
      } as unknown as Layout;
      await manager.layoutPerRId(PER_RID_INPUT, layout, [{ sectionIndex: 0 } as never]);

      const first = manager.getHeaderFooterLayoutSnapshot();
      const second = manager.getHeaderFooterLayoutSnapshot();

      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      // Natural ordering: rId-2 before rId-10.
      expect(first.storyLayouts.headers.map((s) => s.storyKey)).toEqual(['header::rId-2', 'header::rId-10']);
    });

    it('returns the last published snapshot while a new header/footer snapshot is still pending publication', async () => {
      manager = buildSnapshotManager();

      mockLayoutPerRIdHeaderFooters.mockImplementation(
        async (
          _input: unknown,
          _layout: unknown,
          _sectionMetadata: unknown,
          deps: { headerLayoutsByRId: Map<string, HeaderFooterLayoutResult> },
        ) => {
          deps.headerLayoutsByRId.set('rId-header-default', makeResult('header', 'old-block'));
        },
      );

      const layout: Layout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, sectionIndex: 0 } as never],
      } as unknown as Layout;
      await manager.layoutPerRId(PER_RID_INPUT, layout, [{ sectionIndex: 0 } as never]);

      const resolvedLayout: ResolvedLayout = {
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: [
          {
            number: 1,
            sectionIndex: 0,
            height: 792,
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { default: 'rId-header-default' },
              footerRefs: {},
            },
          } as unknown as ResolvedPage,
        ],
      };
      manager.updateDecorationProviders(resolvedLayout);

      const published = manager.getHeaderFooterLayoutSnapshot();
      expect(published.storyLayouts.headers[0]!.rawLayout!.pages[0]!.fragments[0]!.blockId).toBe('old-block');
      expect(published.storyLayouts.headers[0]!.resolvedLayout!.pages[0]!.items[0]!.blockId).toBe('old-block');

      // Simulate the presentation rerender sequence after the new variant layouts
      // have been published but before the per-rId resolved maps + regions are
      // committed as one new snapshot.
      manager.headerLayoutResults = [makeResult('header', 'new-block')];
      manager.headerLayoutsByRId.clear();
      manager.headerLayoutsByRId.set('rId-header-default', makeResult('header', 'new-block'));

      const duringUpdate = manager.getHeaderFooterLayoutSnapshot();

      expect(duringUpdate).toEqual(published);
      expect(duringUpdate.storyLayouts.headers[0]!.rawLayout!.pages[0]!.fragments[0]!.blockId).toBe('old-block');
      expect(duringUpdate.storyLayouts.headers[0]!.resolvedLayout!.pages[0]!.items[0]!.blockId).toBe('old-block');
    });
  });
});
