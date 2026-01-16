import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { PresentationEditor } from '../PresentationEditor.js';
import type { Editor as EditorInstance } from '../../Editor.js';

type MockedEditor = Mock<(...args: unknown[]) => EditorInstance> & {
  mock: {
    calls: unknown[][];
    results: Array<{ value: EditorInstance }>;
  };
};

const {
  createDefaultConverter,
  mockIncrementalLayout,
  mockToFlowBlocks,
  mockSelectionToRects,
  mockCreateDomPainter,
  mockMeasureBlock,
  mockEditorConverterStore,
  mockCreateHeaderFooterEditor,
  mockOnHeaderFooterDataUpdate,
  mockUpdateYdocDocxData,
  mockEditorOverlayManager,
} = vi.hoisted(() => {
  const createDefaultConverter = () => ({
    headers: {
      'rId-header-default': { type: 'doc', content: [{ type: 'paragraph' }] },
    },
    footers: {
      'rId-footer-default': { type: 'doc', content: [{ type: 'paragraph' }] },
    },
    headerIds: {
      default: 'rId-header-default',
      first: null,
      even: null,
      odd: null,
      ids: ['rId-header-default'],
    },
    footerIds: {
      default: 'rId-footer-default',
      first: null,
      even: null,
      odd: null,
      ids: ['rId-footer-default'],
    },
  });

  const converterStore = {
    current: createDefaultConverter() as ReturnType<typeof createDefaultConverter> & Record<string, unknown>,
    mediaFiles: {} as Record<string, string>,
  };

  return {
    createDefaultConverter,
    mockIncrementalLayout: vi.fn(async () => ({ layout: { pages: [] }, measures: [] })),
    mockToFlowBlocks: vi.fn(() => ({ blocks: [], bookmarks: new Map() })),
    mockSelectionToRects: vi.fn(() => []),
    mockCreateDomPainter: vi.fn(() => ({
      paint: vi.fn(),
      destroy: vi.fn(),
      setZoom: vi.fn(),
      setLayoutMode: vi.fn(),
      setProviders: vi.fn(),
      setData: vi.fn(),
    })),
    mockMeasureBlock: vi.fn(() => ({ width: 100, height: 100 })),
    mockEditorConverterStore: converterStore,
    mockCreateHeaderFooterEditor: vi.fn(() => {
      const createEmitter = () => {
        const listeners = new Map<string, Set<(payload?: unknown) => void>>();
        const on = (event: string, handler: (payload?: unknown) => void) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(handler);
        };
        const off = (event: string, handler: (payload?: unknown) => void) => {
          listeners.get(event)?.delete(handler);
        };
        const once = (event: string, handler: (payload?: unknown) => void) => {
          const wrapper = (payload?: unknown) => {
            off(event, wrapper);
            handler(payload);
          };
          on(event, wrapper);
        };
        const emit = (event: string, payload?: unknown) => {
          listeners.get(event)?.forEach((handler) => handler(payload));
        };
        return { on, off, once, emit };
      };

      const emitter = createEmitter();
      const editorStub = {
        on: emitter.on,
        off: emitter.off,
        once: emitter.once,
        emit: emitter.emit,
        destroy: vi.fn(),
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
          dom: document.createElement('div'),
          focus: vi.fn(),
        },
      };
      queueMicrotask(() => editorStub.emit('create'));
      return editorStub;
    }),
    mockOnHeaderFooterDataUpdate: vi.fn(),
    mockUpdateYdocDocxData: vi.fn(() => Promise.resolve()),
    mockEditorOverlayManager: vi.fn().mockImplementation(() => ({
      showEditingOverlay: vi.fn(() => ({
        success: true,
        editorHost: document.createElement('div'),
        reason: null,
      })),
      hideEditingOverlay: vi.fn(),
      showSelectionOverlay: vi.fn(),
      hideSelectionOverlay: vi.fn(),
      setOnDimmingClick: vi.fn(),
      getActiveEditorHost: vi.fn(() => null),
      destroy: vi.fn(),
    })),
  };
});

// Mock Editor class
vi.mock('../../Editor', () => {
  return {
    Editor: vi.fn().mockImplementation(() => ({
      setDocumentMode: vi.fn(),
      setOptions: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      destroy: vi.fn(),
      getJSON: vi.fn(() => ({ type: 'doc', content: [] })),
      isEditable: true,
      state: {
        selection: { from: 0, to: 0 },
        doc: {
          nodeSize: 100,
          content: {
            size: 100,
          },
          // Mock ProseMirror document methods
          descendants: vi.fn(),
          resolve: vi.fn(() => ({
            node: vi.fn(),
            parent: null,
            depth: 0,
          })),
        },
      },
      view: {
        dom: {
          dispatchEvent: vi.fn(() => true),
          focus: vi.fn(),
        },
        focus: vi.fn(),
        dispatch: vi.fn(),
      },
      options: {
        documentId: 'test-doc',
        element: document.createElement('div'),
      },
      converter: mockEditorConverterStore.current,
      storage: {
        image: {
          media: mockEditorConverterStore.mediaFiles,
        },
      },
    })),
  };
});

// Mock pm-adapter functions
vi.mock('@superdoc/pm-adapter', () => ({
  toFlowBlocks: mockToFlowBlocks,
}));

// Mock layout-bridge functions
vi.mock('@superdoc/layout-bridge', () => ({
  incrementalLayout: mockIncrementalLayout,
  selectionToRects: mockSelectionToRects,
  clickToPosition: vi.fn(() => null),
  createDragHandler: vi.fn(() => () => {}),
  getFragmentAtPosition: vi.fn(() => null),
  computeLinePmRange: vi.fn(() => ({ from: 0, to: 0 })),
  measureCharacterX: vi.fn(() => 0),
  extractIdentifierFromConverter: vi.fn((_converter) => ({
    extractHeaderId: vi.fn(() => 'rId-header-default'),
    extractFooterId: vi.fn(() => 'rId-footer-default'),
  })),
  buildMultiSectionIdentifier: vi.fn(() => ({ sections: [] })),
  getHeaderFooterTypeForSection: vi.fn(() => 'default'),
  getHeaderFooterType: vi.fn(() => 'default'),
  layoutHeaderFooterWithCache: vi.fn(async () => ({
    default: {
      layout: { pages: [{ fragments: [], number: 1 }], height: 0 },
      blocks: [],
      measures: [],
    },
  })),
  computeDisplayPageNumber: vi.fn((pages) => pages.map((p) => ({ displayText: String(p.number ?? 1) }))),
  PageGeometryHelper: vi.fn().mockImplementation(({ layout, pageGap }) => ({
    updateLayout: vi.fn(),
    getPageIndexAtY: vi.fn(() => 0),
    getNearestPageIndex: vi.fn(() => 0),
    getPageTop: vi.fn(() => 0),
    getPageGap: vi.fn(() => pageGap ?? 0),
    getLayout: vi.fn(() => layout),
  })),
}));

// Mock painter-dom
vi.mock('@superdoc/painter-dom', () => ({
  createDomPainter: mockCreateDomPainter,
  DOM_CLASS_NAMES: {
    PAGE: 'superdoc-page',
    FRAGMENT: 'superdoc-fragment',
    LINE: 'superdoc-line',
    INLINE_SDT_WRAPPER: 'superdoc-structured-content-inline',
    BLOCK_SDT: 'superdoc-structured-content-block',
    DOCUMENT_SECTION: 'superdoc-document-section',
  },
}));

// Mock measuring-dom
vi.mock('@superdoc/measuring-dom', () => ({
  measureBlock: mockMeasureBlock,
}));

vi.mock('@extensions/pagination/pagination-helpers.js', () => ({
  createHeaderFooterEditor: mockCreateHeaderFooterEditor,
  onHeaderFooterDataUpdate: mockOnHeaderFooterDataUpdate,
}));

vi.mock('@extensions/collaboration/collaboration-helpers.js', () => ({
  updateYdocDocxData: mockUpdateYdocDocxData,
}));

vi.mock('../../header-footer/EditorOverlayManager', () => ({
  EditorOverlayManager: mockEditorOverlayManager,
}));

describe('PresentationEditor - goToAnchor', () => {
  let container: HTMLElement;
  let editor: PresentationEditor;
  let mockActiveEditor: {
    commands: {
      setTextSelection: Mock;
    };
  };

  beforeEach(() => {
    // Create a container element for the presentation editor
    container = document.createElement('div');
    document.body.appendChild(container);

    // Clear all mocks before each test
    vi.clearAllMocks();
    mockEditorConverterStore.current = {
      ...createDefaultConverter(),
      headerEditors: [],
      footerEditors: [],
    };
    mockEditorConverterStore.mediaFiles = {};

    // Create mock active editor with setTextSelection command
    mockActiveEditor = {
      commands: {
        setTextSelection: vi.fn(),
      },
    };

    // Setup default layout with bookmarks
    const layoutResult = {
      layout: {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            numberText: '1',
            size: { w: 612, h: 792 },
            fragments: [
              {
                kind: 'para',
                pmStart: 0,
                pmEnd: 100,
              },
            ],
            margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { default: 'rId-header-default' },
              footerRefs: { default: 'rId-footer-default' },
            },
          },
          {
            number: 2,
            numberText: '2',
            size: { w: 612, h: 792 },
            fragments: [
              {
                kind: 'para',
                pmStart: 100,
                pmEnd: 200,
              },
            ],
            margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { default: 'rId-header-default' },
              footerRefs: { default: 'rId-footer-default' },
            },
          },
        ],
      },
      measures: [],
    };

    mockIncrementalLayout.mockResolvedValue(layoutResult);

    // Setup bookmarks in toFlowBlocks
    const bookmarks = new Map<string, number>();
    bookmarks.set('bookmark1', 50);
    bookmarks.set('bookmark2', 150);
    bookmarks.set('heading-1', 10);
    mockToFlowBlocks.mockReturnValue({ blocks: [], bookmarks });
  });

  afterEach(() => {
    if (editor) {
      editor.destroy();
    }
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('should return false for empty anchor', async () => {
    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });

    // Wait for layout to complete
    await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

    const result = await editor.goToAnchor('');
    expect(result).toBe(false);
  });

  it('should return false when layout is missing', async () => {
    // Suppress expected console.error from layout error handler
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock layout as null
    mockIncrementalLayout.mockResolvedValueOnce({ layout: null, measures: [] });

    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });

    // Wait for layout attempt
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await editor.goToAnchor('bookmark1');
    expect(result).toBe(false);

    consoleSpy.mockRestore();
  });

  it('should return false for non-existent bookmark', async () => {
    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });

    // Wait for layout to complete
    await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await editor.goToAnchor('nonexistent');
    expect(result).toBe(false);
  });

  it('should normalize anchor with leading "#"', async () => {
    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });

    // Mock getActiveEditor to return our mock
    editor.getActiveEditor = vi.fn(() => mockActiveEditor as never);

    // Wait for layout to complete
    await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Mock page element in DOM
    const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
    if (pagesHost) {
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      mockPage.scrollIntoView = vi.fn(); // Mock scrollIntoView
      pagesHost.appendChild(mockPage);
    }

    const result = await editor.goToAnchor('#bookmark1');
    expect(result).toBe(true);
    expect(mockActiveEditor.commands.setTextSelection).toHaveBeenCalledWith({ from: 50, to: 50 });
  });

  it('should work without leading "#"', async () => {
    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });

    // Mock getActiveEditor to return our mock
    editor.getActiveEditor = vi.fn(() => mockActiveEditor as never);

    // Wait for layout to complete
    await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Mock page element in DOM
    const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
    if (pagesHost) {
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      mockPage.scrollIntoView = vi.fn(); // Mock scrollIntoView
      pagesHost.appendChild(mockPage);
    }

    const result = await editor.goToAnchor('bookmark1');
    expect(result).toBe(true);
    expect(mockActiveEditor.commands.setTextSelection).toHaveBeenCalledWith({ from: 50, to: 50 });
  });

  it('should scroll page into view', async () => {
    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });

    // Mock getActiveEditor to return our mock
    editor.getActiveEditor = vi.fn(() => mockActiveEditor as never);

    // Wait for layout to complete
    await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Mock page element in DOM with scrollIntoView
    const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
    const mockPage = document.createElement('div');
    mockPage.setAttribute('data-page-index', '1');
    mockPage.scrollIntoView = vi.fn();
    if (pagesHost) {
      pagesHost.appendChild(mockPage);
    }

    const result = await editor.goToAnchor('bookmark2');
    expect(result).toBe(true);
    expect(mockPage.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
  });

  it('should move caret to bookmark position', async () => {
    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });

    // Mock getActiveEditor to return our mock
    editor.getActiveEditor = vi.fn(() => mockActiveEditor as never);

    // Wait for layout to complete
    await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Mock page element in DOM
    const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
    if (pagesHost) {
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      mockPage.scrollIntoView = vi.fn(); // Mock scrollIntoView
      pagesHost.appendChild(mockPage);
    }

    const result = await editor.goToAnchor('heading-1');
    expect(result).toBe(true);
    expect(mockActiveEditor.commands.setTextSelection).toHaveBeenCalledWith({ from: 10, to: 10 });
  });

  it('should warn when setTextSelection is unavailable but still succeed', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });

    // Mock getActiveEditor to return editor without setTextSelection
    const mockEditorWithoutCommands = {};
    editor.getActiveEditor = vi.fn(() => mockEditorWithoutCommands as never);

    // Wait for layout to complete
    await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Mock page element in DOM
    const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
    if (pagesHost) {
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      mockPage.scrollIntoView = vi.fn(); // Mock scrollIntoView
      pagesHost.appendChild(mockPage);
    }

    const result = await editor.goToAnchor('bookmark1');
    expect(result).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Navigation succeeded but could not move caret'),
    );

    consoleWarnSpy.mockRestore();
  });

  it('should handle errors gracefully and emit error event', async () => {
    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorListener = vi.fn();
    editor.on('error', errorListener);

    // Wait for layout to complete
    await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Force an error by making selectionToRects throw
    mockSelectionToRects.mockImplementationOnce(() => {
      throw new Error('Test error');
    });

    const result = await editor.goToAnchor('bookmark1');
    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('goToAnchor failed'), expect.any(Error));
    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
        context: 'goToAnchor',
      }),
    );

    consoleErrorSpy.mockRestore();
  });

  it('should return false when anchor becomes empty after normalization', async () => {
    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });

    // Wait for layout to complete
    await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Test with anchor that is just "#"
    const result = await editor.goToAnchor('#');
    expect(result).toBe(false);
  });
});
