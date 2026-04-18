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
  return {
    setEditable: vi.fn(),
    setOptions: vi.fn(),
    commands: {
      setTextSelection: vi.fn(),
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
   * The DOM selection mock returns a single rect at (120, 90) with size 200x32,
   * and the editor host is at (100, 50) with size 600x120. The header region is
   * at localX=40, localY=30 on page 1 with bodyPageHeight=800.
   */
  async function setupWithZoom(zoom: number | undefined): Promise<HeaderFooterSessionManager> {
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

    const overlayManager = {
      showEditingOverlay: vi.fn(() => ({
        success: true,
        editorHost,
        reason: null,
      })),
      hideEditingOverlay: vi.fn(),
      showSelectionOverlay: vi.fn(),
      hideSelectionOverlay: vi.fn(),
      setOnDimmingClick: vi.fn(),
      getActiveEditorHost: vi.fn(() => editorHost),
      destroy: vi.fn(),
    };

    mockInitHeaderFooterRegistry.mockReturnValue({
      overlayManager,
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
    };

    manager.setDependencies(deps);
    manager.initialize();
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
    vi.spyOn(document, 'getSelection').mockReturnValue({
      rangeCount: 1,
      getRangeAt: vi.fn(() => ({
        getClientRects: vi.fn(() => [createRect(120, 90, 200, 32)]),
      })),
    } as unknown as Selection);

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

  it('falls back to zoom=1 when zoom is negative', async () => {
    await setupWithZoom(-1);

    expect(manager.computeSelectionRects(1, 10)).toEqual([{ pageIndex: 1, x: 60, y: 870, width: 200, height: 32 }]);
  });

  it('falls back to zoom=1 when zoom is NaN', async () => {
    await setupWithZoom(NaN);

    expect(manager.computeSelectionRects(1, 10)).toEqual([{ pageIndex: 1, x: 60, y: 870, width: 200, height: 32 }]);
  });
});
