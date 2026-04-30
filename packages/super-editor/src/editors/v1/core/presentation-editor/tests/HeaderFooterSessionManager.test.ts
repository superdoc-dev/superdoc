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
import type { FlowBlock, HeaderFooterLayout, Layout, Measure, ParaFragment } from '@superdoc/contracts';
import type { HeaderFooterLayoutResult } from '@superdoc/layout-bridge';
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
        commitPolicy: 'onExit',
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
    function buildHeaderResult(options?: { y?: number; minY?: number }): HeaderFooterLayoutResult {
      const y = options?.y ?? 10;
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y,
        width: 468,
      };
      const layout: HeaderFooterLayout = {
        height: 50,
        ...(options?.minY != null ? { minY: options.minY } : {}),
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [] }];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 100, ascent: 10, descent: 3, lineHeight: 18 }],
          totalHeight: 18,
        },
      ];
      return { kind: 'header', type: 'default', layout, blocks, measures };
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
      const provider = manager.createDecorationProvider('header', layout);
      expect(provider).toBeDefined();
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0]);
      expect(payload).not.toBeNull();
      expect(payload!.fragments).toHaveLength(1);
      expect(payload!.items).toBeDefined();
      expect(payload!.items!.length).toBe(payload!.fragments.length);
      expect(payload!.items![0]!.blockId).toBe('p1');
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
      const provider = manager.createDecorationProvider('header', layout);
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0]);

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
      const provider = manager.createDecorationProvider('header', layout);
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0]);

      expect(payload).not.toBeNull();
      expect(payload!.fragments[0]!.y).toBe(0);
      expect(payload!.items).toBeDefined();
      expect(payload!.items![0]).toMatchObject({ blockId: 'p1', x: 72, y: 0 });
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

      const provider = manager.createDecorationProvider('header', layout);
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0]);

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

      const provider = manager.createDecorationProvider('header', layout);
      const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0]);

      expect(payload).not.toBeNull();
      expect(payload!.fragments).toHaveLength(2);
      expect(payload!.items).toBeDefined();
      expect(payload!.items).toHaveLength(2);
      expect(payload!.items!.every((item) => item.blockId === 'p1')).toBe(true);
    });
  });
});
