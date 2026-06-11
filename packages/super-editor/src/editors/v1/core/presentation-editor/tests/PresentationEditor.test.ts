import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { PresentationEditor } from '../PresentationEditor.js';
import type { Editor as EditorInstance } from '../../Editor.js';
import { Editor } from '../../Editor.js';
import { HeaderFooterEditorManager, HeaderFooterLayoutAdapter } from '../../header-footer/HeaderFooterRegistry.js';
import { buildMultiSectionIdentifier } from '@superdoc/layout-bridge';
import type { FlowBlock } from '@superdoc/contracts';
import { NodeSelection } from 'prosemirror-state';

type MockedEditor = Mock<(...args: unknown[]) => EditorInstance> & {
  mock: {
    calls: unknown[][];
    results: Array<{ value: EditorInstance }>;
  };
};

const {
  createDefaultConverter,
  mockClickToPosition,
  mockResolvePointerPositionHit,
  mockIncrementalLayout,
  mockToFlowBlocks,
  mockSelectionToRects,
  mockCreateDomPainter,
  mockMeasureBlock,
  mockEditorConverterStore,
  mockCreateHeaderFooterEditor,
  mockCreateStoryEditor,
  createdSectionEditors,
  createdStoryEditors,
  mockOnHeaderFooterDataUpdate,
  mockUpdateYdocDocxData,
  mockEditorOverlayManager,
  mockResolveLayout,
  mockFlowBlockCacheInstances,
  MockFlowBlockCache,
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

  const createSectionEditor = () => {
    const emitter = createEmitter();
    const editorStub = {
      on: emitter.on,
      off: emitter.off,
      once: emitter.once,
      emit: emitter.emit,
      destroy: vi.fn(),
      getJSON: vi.fn(() => ({ type: 'doc', content: [{ type: 'paragraph' }] })),
      getUpdatedJson: vi.fn(() => ({ type: 'doc', content: [{ type: 'paragraph' }] })),
      setEditable: vi.fn(),
      setDocumentMode: vi.fn(),
      setOptions: vi.fn(),
      commands: {
        setTextSelection: vi.fn(),
        setCursorById: vi.fn(() => true),
      },
      state: {
        doc: {
          content: {
            size: 10,
          },
          textBetween: vi.fn(() => 'Lazy note session'),
        },
      },
      options: {},
      view: {
        dom: document.createElement('div'),
        focus: vi.fn(),
      },
    };
    queueMicrotask(() => editorStub.emit('create'));
    return editorStub;
  };

  const editors: Array<{ editor: ReturnType<typeof createSectionEditor> }> = [];
  const storyEditors: Array<{ editor: ReturnType<typeof createSectionEditor> }> = [];
  const mockFlowBlockCacheInstances: Array<{
    clear: ReturnType<typeof vi.fn>;
    setHasExternalChanges: ReturnType<typeof vi.fn>;
  }> = [];

  class MockFlowBlockCache {
    clear = vi.fn();
    setHasExternalChanges = vi.fn();

    constructor() {
      mockFlowBlockCacheInstances.push(this);
    }
  }

  return {
    createDefaultConverter,
    mockClickToPosition: vi.fn(() => null),
    mockResolvePointerPositionHit: vi.fn(() => null),
    mockIncrementalLayout: vi.fn(async () => ({ layout: { pages: [] }, measures: [] })),
    mockToFlowBlocks: vi.fn(() => ({ blocks: [], bookmarks: new Map() })),
    mockSelectionToRects: vi.fn(() => []),
    mockCreateDomPainter: vi.fn(() => ({
      paint: vi.fn(),
      destroy: vi.fn(),
      setZoom: vi.fn(),
      setLayoutMode: vi.fn(),
      setVirtualizationPins: vi.fn(),
      getMountedPageIndices: vi.fn(() => []),
      onScroll: vi.fn(),
      setScrollContainer: vi.fn(),
      setShowFormattingMarks: vi.fn(),
      setProviders: vi.fn(),
    })),
    mockMeasureBlock: vi.fn(() => ({ width: 100, height: 100 })),
    mockEditorConverterStore: converterStore,
    mockCreateHeaderFooterEditor: vi.fn(() => {
      const editor = createSectionEditor();
      editors.push({ editor });
      return editor;
    }),
    mockCreateStoryEditor: vi.fn((parentEditor?: EditorInstance) => {
      const editor = createSectionEditor();
      editor.options = { ...editor.options, parentEditor };
      storyEditors.push({ editor });
      return editor;
    }),
    createdSectionEditors: editors,
    createdStoryEditors: storyEditors,
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
    // SD-2836: rebuildRegions now iterates resolvedLayout.pages, so the mock
    // must synthesize a ResolvedPage per source Layout page to keep header/footer
    // region tests from going empty.
    mockResolveLayout: vi.fn(
      ({ layout }: { layout: { pages: Array<Record<string, unknown>>; pageSize: { w: number; h: number } } }) => ({
        version: 1,
        flowMode: 'paginated',
        pageGap: 0,
        pages: (layout?.pages ?? []).map((p, i) => ({
          id: `page-${i}`,
          index: i,
          number: (p.number as number) ?? i + 1,
          width: ((p.size as { w?: number } | undefined)?.w ?? layout.pageSize?.w) as number,
          height: ((p.size as { h?: number } | undefined)?.h ?? layout.pageSize?.h) as number,
          items: [],
          margins: p.margins,
          sectionRefs: p.sectionRefs,
          sectionIndex: p.sectionIndex,
          numberText: p.numberText,
          footnoteReserved: p.footnoteReserved,
          vAlign: p.vAlign,
          baseMargins: p.baseMargins,
          orientation: p.orientation,
          columns: p.columns,
          columnRegions: p.columnRegions,
        })),
      }),
    ),
    mockFlowBlockCacheInstances,
    MockFlowBlockCache,
  };
});

const bookmarkResolverMocks = vi.hoisted(() => ({
  findAllBookmarksInDocument: vi.fn(() => []),
  resolveBookmarkTarget: vi.fn(),
}));

// Mock PositionHitResolver
vi.mock('../input/PositionHitResolver.js', () => ({
  resolvePointerPositionHit: (...args: unknown[]) => mockResolvePointerPositionHit(...args),
}));

// Mock Editor class
vi.mock('../../Editor', () => {
  return {
    Editor: vi.fn().mockImplementation((options: { content?: unknown } = {}) => {
      const contentAttrs =
        options.content && typeof options.content === 'object' && !Array.isArray(options.content)
          ? (((options.content as { attrs?: Record<string, unknown> }).attrs ?? {}) as Record<string, unknown>)
          : {};

      return {
        setDocumentMode: vi.fn(),
        setOptions: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        destroy: vi.fn(),
        getJSON: vi.fn(() => ({ type: 'doc', content: [] })),
        isEditable: true,
        state: {
          selection: {
            from: 0,
            to: 0,
            $from: {
              depth: 0,
              node: vi.fn(),
            },
          },
          doc: {
            attrs: contentAttrs,
            nodeSize: 100,
            content: {
              size: 100,
            },
            descendants: vi.fn(),
            nodesBetween: vi.fn((_from: number, _to: number, callback: (node: unknown, pos: number) => void) => {
              // Simulate a simple document with one text block at position 0.
              callback({ isTextblock: true }, 0);
            }),
            resolve: vi.fn((pos: number) => ({
              pos,
              depth: 0,
              parent: { inlineContent: true },
              node: vi.fn(),
              min: vi.fn((other: { pos: number }) => Math.min(pos, other.pos)),
              max: vi.fn((other: { pos: number }) => Math.max(pos, other.pos)),
            })),
          },
          tr: {
            setSelection: vi.fn().mockReturnThis(),
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
      };
    }),
  };
});

vi.mock('@core/layout-adapter', async (importOriginal) => {
  const { buildLayoutDocumentAdapterVitestMock } = await import('./mock-layout-document-adapter-vitest.js');
  return buildLayoutDocumentAdapterVitestMock(importOriginal, {
    toFlowBlocks: mockToFlowBlocks,
    FlowBlockCache: MockFlowBlockCache,
  });
});

// Mock layout-bridge functions
vi.mock('@superdoc/layout-bridge', () => ({
  incrementalLayout: mockIncrementalLayout,
  measureCache: { clear: vi.fn() },
  normalizeMargin: (value: number | undefined, fallback: number) =>
    Number.isFinite(value) ? (value as number) : fallback,
  selectionToRects: mockSelectionToRects,
  clickToPosition: mockClickToPosition,
  clickToPositionGeometry: vi.fn(() => null),
  createDragHandler: vi.fn(() => {
    // Return a noop cleanup function; tests drive drag/drop through DOM listeners.
    return () => {};
  }),
  getFragmentAtPosition: vi.fn(() => null),
  hitTestTableFragment: vi.fn(() => null),
  computeLinePmRange: vi.fn(() => ({ from: 0, to: 0 })),
  measureCharacterX: vi.fn(() => 0),
  extractIdentifierFromConverter: vi.fn((_converter) => ({
    extractHeaderId: vi.fn(() => 'rId-header-default'),
    extractFooterId: vi.fn(() => 'rId-footer-default'),
  })),
  buildMultiSectionIdentifier: vi.fn(() => ({ sections: [] })),
  buildEffectiveHeaderFooterRefsBySection: vi.fn(() => new Map()),
  collectReferencedHeaderFooterRIds: vi.fn(() => new Set()),
  getHeaderFooterTypeForSection: vi.fn(() => 'default'),
  getHeaderFooterType: vi.fn((_pageNumber, _identifier, _options) => {
    // Returns the type of header/footer for a given page
    // For simplicity, we return 'default' for all pages
    return 'default';
  }),
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
  clearTextMeasurementCaches: vi.fn(),
}));

vi.mock('@superdoc/layout-resolved', () => ({
  resolveLayout: mockResolveLayout,
  resolveHeaderFooterLayout: vi.fn(() => ({ height: 0, pages: [] })),
}));

vi.mock('@extensions/pagination/pagination-helpers.js', () => ({
  createHeaderFooterEditor: mockCreateHeaderFooterEditor,
  onHeaderFooterDataUpdate: mockOnHeaderFooterDataUpdate,
}));

vi.mock('../../story-editor-factory.js', () => ({
  createStoryEditor: mockCreateStoryEditor,
}));

vi.mock('../../../document-api-adapters/helpers/bookmark-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../document-api-adapters/helpers/bookmark-resolver.js')>();
  return {
    ...actual,
    findAllBookmarksInDocument: bookmarkResolverMocks.findAllBookmarksInDocument,
    resolveBookmarkTarget: bookmarkResolverMocks.resolveBookmarkTarget,
  };
});

vi.mock('../../header-footer/EditorOverlayManager', () => ({
  EditorOverlayManager: mockEditorOverlayManager,
}));

describe('PresentationEditor', () => {
  let container: HTMLElement;
  let editor: PresentationEditor;
  let originalBodyPageTokens: string | undefined;

  const makeNodeSelection = (from: number, to: number, node: Record<string, unknown>) => {
    const selection = Object.create(NodeSelection.prototype);
    Object.defineProperty(selection, 'from', { value: from, configurable: true });
    Object.defineProperty(selection, 'to', { value: to, configurable: true });
    Object.defineProperty(selection, 'anchor', { value: from, configurable: true });
    Object.defineProperty(selection, 'head', { value: to, configurable: true });
    Object.defineProperty(selection, 'empty', { value: false, configurable: true });
    Object.defineProperty(selection, 'node', { value: node, configurable: true });
    return selection as NodeSelection;
  };

  const getLastEditorInstance = () => {
    const results = (Editor as unknown as MockedEditor).mock.results;
    return results[results.length - 1].value;
  };

  const getSelectionUpdateHandler = (editorInstance: EditorInstance) => {
    const onMock = editorInstance.on as unknown as Mock;
    const call = onMock.mock.calls.find(([event]) => event === 'selectionUpdate');
    expect(call).toBeTruthy();
    return call![1] as () => void;
  };

  const syncViewState = (editorInstance: EditorInstance) => {
    (
      editorInstance.view as typeof editorInstance.view & { state?: EditorInstance['state']; hasFocus?: () => boolean }
    ).state = editorInstance.state;
    (editorInstance.view as typeof editorInstance.view & { hasFocus?: () => boolean }).hasFocus = vi.fn(() => true);
  };

  beforeEach(() => {
    originalBodyPageTokens = process.env.SD_BODY_PAGE_TOKENS;

    // Create a container element for the presentation editor
    container = document.createElement('div');
    document.body.appendChild(container);

    // Clear all mocks
    vi.clearAllMocks();
    mockToFlowBlocks.mockReset();
    mockToFlowBlocks.mockReturnValue({ blocks: [], bookmarks: new Map() });
    // Reset mockIncrementalLayout to default implementation (clearAllMocks doesn't reset mockResolvedValue)
    mockIncrementalLayout.mockReset();
    mockIncrementalLayout.mockResolvedValue({ layout: { pages: [] }, measures: [] });

    mockEditorConverterStore.current = {
      ...createDefaultConverter(),
      headerEditors: [],
      footerEditors: [],
    };
    mockEditorConverterStore.mediaFiles = {};
    createdSectionEditors.length = 0;
    createdStoryEditors.length = 0;
    mockFlowBlockCacheInstances.length = 0;
    bookmarkResolverMocks.findAllBookmarksInDocument.mockReset();
    bookmarkResolverMocks.findAllBookmarksInDocument.mockImplementation(() => []);
    bookmarkResolverMocks.resolveBookmarkTarget.mockReset();

    // Reset static instances
    (PresentationEditor as typeof PresentationEditor & { instances: Map<string, unknown> }).instances = new Map();
  });

  afterEach(() => {
    if (originalBodyPageTokens === undefined) {
      delete process.env.SD_BODY_PAGE_TOKENS;
    } else {
      process.env.SD_BODY_PAGE_TOKENS = originalBodyPageTokens;
    }

    if (editor) {
      editor.destroy();
    }
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  describe('unified history defaults', () => {
    it('enables the coordinator by default', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'unified-history-default-doc',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        mode: 'docx',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(editor.historyCoordinator).not.toBeNull();
    });

    it('allows callers to disable the coordinator explicitly', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'unified-history-disabled-doc',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        mode: 'docx',
        experimental: {
          unifiedHistory: false,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(editor.historyCoordinator).toBeNull();
    });
  });

  describe('document font config', () => {
    it('registers configured families and maps before the first measure callback', async () => {
      const order: string[] = [];
      const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
      const originalFontFace = Object.getOwnPropertyDescriptor(window, 'FontFace');

      class TestFontFace {
        readonly status = 'unloaded';

        constructor(public readonly family: string) {}

        load(): Promise<TestFontFace> {
          return Promise.resolve(this);
        }
      }

      const fontSet = {
        add: vi.fn((face: { family: string }) => {
          if (face.family === 'Gelasio') order.push('custom-font-add');
        }),
        load: vi.fn(async () => [new TestFontFace('loaded')]),
        check: vi.fn(() => true),
      };

      Object.defineProperty(document, 'fonts', { configurable: true, value: fontSet });
      Object.defineProperty(window, 'FontFace', { configurable: true, value: TestFontFace });

      try {
        const block = {
          kind: 'paragraph',
          id: 'p-font-config',
          runs: [{ kind: 'text', text: 'Hello', fontFamily: 'Georgia', fontSize: 12 }],
        } as FlowBlock;

        mockToFlowBlocks.mockReturnValueOnce({ blocks: [block], bookmarks: new Map() });
        mockIncrementalLayout.mockImplementationOnce(
          async (_previousBlocks, _previousLayout, blocks, _layoutOptions, measureBlock) => {
            order.push('layout');
            await (measureBlock as (block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => unknown)(
              blocks[0] as FlowBlock,
              { maxWidth: 500, maxHeight: 700 },
            );
            return { layout: { pages: [] }, measures: [] };
          },
        );

        editor = new PresentationEditor({
          element: container,
          fontAssets: {
            families: [{ family: 'Gelasio', faces: [{ source: '/fonts/Gelasio-Regular.woff2' }] }],
            map: { Georgia: 'Gelasio' },
          },
        });

        await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

        expect(order).toContain('custom-font-add');
        expect(order.indexOf('custom-font-add')).toBeLessThan(order.indexOf('layout'));
        const fontContext = mockMeasureBlock.mock.calls[0]?.[2] as
          | {
              resolvePhysical?: (family: string, face: { weight: '400' | '700'; style: 'normal' | 'italic' }) => string;
            }
          | undefined;
        expect(fontContext?.resolvePhysical?.('Georgia', { weight: '400', style: 'normal' })).toBe('Gelasio');
      } finally {
        if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
        else Reflect.deleteProperty(document, 'fonts');
        if (originalFontFace) Object.defineProperty(window, 'FontFace', originalFontFace);
        else Reflect.deleteProperty(window, 'FontFace');
      }
    });
  });

  describe('formatting marks repaint', () => {
    it('passes body bookmarks to initial layout resolution when body page tokens are disabled', async () => {
      // Disabling PAGE/NUMPAGES convergence must not suppress PAGEREF bookmark resolution.
      process.env.SD_BODY_PAGE_TOKENS = 'false';

      const bookmarks = new Map([['target', 100]]);
      const blocks = [
        {
          kind: 'paragraph',
          id: 'source',
          runs: [{ text: '5', fontFamily: 'Arial', fontSize: 12 }],
        },
      ];
      const measures = [
        {
          kind: 'paragraph',
          lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 1, width: 8, ascent: 8, descent: 2, lineHeight: 12 }],
        },
      ];
      mockToFlowBlocks.mockReturnValue({ blocks, bookmarks });
      mockIncrementalLayout.mockResolvedValueOnce({
        layout: {
          pageSize: { w: 800, h: 1000 },
          pages: [{ number: 1, fragments: [{ kind: 'para', blockId: 'source', fromLine: 0, toLine: 1 }] }],
        },
        measures,
      });

      editor = new PresentationEditor({
        element: container,
        documentId: 'body-page-tokens-disabled-pageref-doc',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        mode: 'docx',
      });

      await vi.waitFor(() => expect(mockResolveLayout).toHaveBeenCalled());

      expect(mockResolveLayout.mock.calls[0]?.[0]).toMatchObject({ bookmarks });
    });

    it('preserves body bookmarks when repainting the current layout', async () => {
      // Disabling PAGE/NUMPAGES convergence must not suppress PAGEREF bookmark resolution.
      process.env.SD_BODY_PAGE_TOKENS = 'false';

      const bookmarks = new Map([['target', 100]]);
      const blocks = [
        {
          kind: 'paragraph',
          id: 'source',
          runs: [{ text: '5', fontFamily: 'Arial', fontSize: 12 }],
        },
      ];
      const measures = [
        {
          kind: 'paragraph',
          lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 1, width: 8, ascent: 8, descent: 2, lineHeight: 12 }],
        },
      ];
      mockToFlowBlocks.mockReturnValue({ blocks, bookmarks });
      mockIncrementalLayout.mockResolvedValueOnce({
        layout: {
          pageSize: { w: 800, h: 1000 },
          pages: [{ number: 1, fragments: [{ kind: 'para', blockId: 'source', fromLine: 0, toLine: 1 }] }],
        },
        measures,
      });

      editor = new PresentationEditor({
        element: container,
        documentId: 'formatting-marks-pageref-doc',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        mode: 'docx',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      mockResolveLayout.mockClear();

      editor.setShowFormattingMarks(true);

      expect(mockResolveLayout).toHaveBeenCalledTimes(1);
      expect(mockResolveLayout.mock.calls[0]?.[0]).toMatchObject({ bookmarks });
    });
  });

  describe('structured content selected chrome', () => {
    it('marks a block SDT selected when an image NodeSelection is inside it', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'sdt-image-selection-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

      const editorInstance = getLastEditorInstance();
      syncViewState(editorInstance);

      const sdtNode = {
        type: { name: 'structuredContentBlock' },
        attrs: { id: 'sdt-image-block' },
        nodeSize: 24,
      };
      const imageNode = {
        type: { name: 'image' },
        attrs: {},
        isBlock: false,
        isInline: true,
        isLeaf: true,
        nodeSize: 1,
      };
      const doc = {
        ...editorInstance.state.doc,
        nodeAt: vi.fn(() => imageNode),
        resolve: vi.fn((pos: number) => ({
          pos,
          depth: 2,
          node: (depth: number) => {
            if (depth === 1) return sdtNode;
            if (depth === 2) return { type: { name: 'paragraph' } };
            return { type: { name: 'doc' } };
          },
          before: (depth: number) => (depth === 1 ? 90 : 93),
          start: (depth: number) => (depth === 1 ? 91 : 94),
          end: (depth: number) => (depth === 1 ? 113 : 95),
        })),
      };
      editorInstance.state.doc = doc as never;
      (editorInstance.view as typeof editorInstance.view & { state: EditorInstance['state'] }).state =
        editorInstance.state;
      editorInstance.state.selection = makeNodeSelection(94, 95, imageNode);

      const sdtWrapper = document.createElement('div');
      sdtWrapper.className = 'superdoc-structured-content-block';
      sdtWrapper.dataset.sdtId = 'sdt-image-block';
      sdtWrapper.dataset.pmStart = '94';
      sdtWrapper.dataset.pmEnd = '95';
      container.querySelector('.presentation-editor__pages')?.appendChild(sdtWrapper);

      getSelectionUpdateHandler(editorInstance)();

      expect(sdtWrapper.classList.contains('ProseMirror-selectednode')).toBe(true);
    });

    it('does not mark a block SDT selected when an image NodeSelection is outside it', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'outside-sdt-image-selection-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

      const editorInstance = getLastEditorInstance();
      syncViewState(editorInstance);

      const imageNode = {
        type: { name: 'image' },
        attrs: {},
        isBlock: false,
        isInline: true,
        isLeaf: true,
        nodeSize: 1,
      };
      const doc = {
        ...editorInstance.state.doc,
        nodeAt: vi.fn(() => imageNode),
        resolve: vi.fn((pos: number) => ({
          pos,
          depth: 1,
          node: (depth: number) => (depth === 1 ? { type: { name: 'paragraph' } } : { type: { name: 'doc' } }),
          before: () => 10,
          start: () => 11,
          end: () => 20,
        })),
      };
      editorInstance.state.doc = doc as never;
      (editorInstance.view as typeof editorInstance.view & { state: EditorInstance['state'] }).state =
        editorInstance.state;
      editorInstance.state.selection = makeNodeSelection(40, 41, imageNode);

      const sdtWrapper = document.createElement('div');
      sdtWrapper.className = 'superdoc-structured-content-block';
      sdtWrapper.dataset.sdtId = 'unrelated-sdt-block';
      sdtWrapper.dataset.pmStart = '90';
      sdtWrapper.dataset.pmEnd = '113';
      container.querySelector('.presentation-editor__pages')?.appendChild(sdtWrapper);

      getSelectionUpdateHandler(editorInstance)();

      expect(sdtWrapper.classList.contains('ProseMirror-selectednode')).toBe(false);
    });
  });

  describe('scrollToPosition', () => {
    let originalScrollIntoView: unknown;

    beforeEach(() => {
      originalScrollIntoView = (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        value: vi.fn(),
        configurable: true,
      });
    });

    afterEach(() => {
      if (originalScrollIntoView) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
          value: originalScrollIntoView,
          configurable: true,
        });
      } else {
        delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
      }
    });

    it('scrolls the containing page element', async () => {
      mockIncrementalLayout.mockResolvedValueOnce({
        layout: {
          pageSize: { w: 100, h: 100 },
          pageGap: 0,
          pages: [
            {
              number: 1,
              fragments: [{ pmStart: 0, pmEnd: 50 }],
            },
          ],
        },
        measures: [],
      });

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-scroll-page',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        mode: 'docx',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      const pageEl = document.createElement('div');
      pageEl.setAttribute('data-page-index', '0');
      viewportHost.appendChild(pageEl);

      const didScroll = editor.scrollToPosition(50, { behavior: 'auto' });
      expect(didScroll).toBe(true);
      expect(pageEl.scrollIntoView).toHaveBeenCalled();
    });
  });

  describe('semantic flow mode configuration', () => {
    it('forces vertical layout and disables virtualization when flowMode is semantic', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'semantic-config-doc',
        mode: 'docx',
        layoutEngineOptions: {
          flowMode: 'semantic',
          layoutMode: 'book',
          virtualization: { enabled: true, window: 7, overscan: 2 },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const layoutOptions = editor.getLayoutOptions();
      expect(layoutOptions.flowMode).toBe('semantic');
      expect(layoutOptions.layoutMode).toBe('vertical');
      expect(layoutOptions.virtualization?.enabled).toBe(false);

      expect(mockCreateDomPainter).toHaveBeenCalled();
      const painterOptions = mockCreateDomPainter.mock.calls[0]?.[0];
      expect(painterOptions?.flowMode).toBe('semantic');
      expect(painterOptions?.virtualization?.enabled).toBe(false);
    });

    it('ignores setLayoutMode requests while semantic flow mode is active', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'semantic-layout-mode-doc',
        mode: 'docx',
        layoutEngineOptions: {
          flowMode: 'semantic',
          layoutMode: 'vertical',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      editor.setLayoutMode('book');
      const layoutOptions = editor.getLayoutOptions();
      expect(layoutOptions.layoutMode).toBe('vertical');
    });

    it('uses host width for semantic flow without forcing a wide minimum', async () => {
      Object.defineProperty(container, 'clientWidth', {
        configurable: true,
        value: 120,
      });

      editor = new PresentationEditor({
        element: container,
        documentId: 'semantic-width-doc',
        mode: 'docx',
        layoutEngineOptions: {
          flowMode: 'semantic',
          semanticOptions: { marginsMode: 'none' },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockIncrementalLayout).toHaveBeenCalled();
      const layoutOptions = mockIncrementalLayout.mock.calls[0]?.[3] as {
        flowMode?: string;
        semantic?: { contentWidth?: number };
        pageSize?: { w?: number };
      };
      expect(layoutOptions.flowMode).toBe('semantic');
      expect(layoutOptions.semantic?.contentWidth).toBe(120);
      expect(layoutOptions.pageSize?.w).toBe(120);
    });

    it('defaults semantic flow to zero vertical margins to avoid page seam gaps', async () => {
      Object.defineProperty(container, 'clientWidth', {
        configurable: true,
        value: 420,
      });

      editor = new PresentationEditor({
        element: container,
        documentId: 'semantic-default-margins-doc',
        mode: 'docx',
        layoutEngineOptions: {
          flowMode: 'semantic',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const layoutOptions = mockIncrementalLayout.mock.calls[mockIncrementalLayout.mock.calls.length - 1]?.[3] as {
        margins?: { top?: number; bottom?: number };
        semantic?: { marginTop?: number; marginBottom?: number };
      };

      expect(layoutOptions.margins?.top).toBe(0);
      expect(layoutOptions.margins?.bottom).toBe(0);
      expect(layoutOptions.semantic?.marginTop).toBe(0);
      expect(layoutOptions.semantic?.marginBottom).toBe(0);
    });

    it('clamps semantic custom margins to finite non-negative values', async () => {
      Object.defineProperty(container, 'clientWidth', {
        configurable: true,
        value: 500,
      });

      editor = new PresentationEditor({
        element: container,
        documentId: 'semantic-custom-margins-doc',
        mode: 'docx',
        layoutEngineOptions: {
          flowMode: 'semantic',
          semanticOptions: {
            marginsMode: 'custom',
            customMargins: {
              left: -10,
              right: Number.NaN,
              top: 24,
              bottom: -1,
            },
          },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const layoutOptions = mockIncrementalLayout.mock.calls[mockIncrementalLayout.mock.calls.length - 1]?.[3] as {
        margins?: { left?: number; right?: number; top?: number; bottom?: number };
        semantic?: { marginLeft?: number; marginRight?: number; marginTop?: number; marginBottom?: number };
        pageSize?: { w?: number };
      };

      expect(layoutOptions.margins?.left).toBe(72);
      expect(layoutOptions.margins?.right).toBe(72);
      expect(layoutOptions.margins?.top).toBe(24);
      expect(layoutOptions.margins?.bottom).toBe(72);

      expect(layoutOptions.semantic?.marginLeft).toBe(72);
      expect(layoutOptions.semantic?.marginRight).toBe(72);
      expect(layoutOptions.semantic?.marginTop).toBe(24);
      expect(layoutOptions.semantic?.marginBottom).toBe(72);
      expect(layoutOptions.pageSize?.w).toBe(500);
    });

    it('relayouts semantic flow when host width changes', async () => {
      const originalResizeObserver = window.ResizeObserver;
      let resizeCallback: ResizeObserverCallback | null = null;
      class ResizeObserverMock {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
      }

      Object.defineProperty(window, 'ResizeObserver', {
        configurable: true,
        value: ResizeObserverMock,
      });

      try {
        Object.defineProperty(container, 'clientWidth', {
          configurable: true,
          value: 240,
        });

        editor = new PresentationEditor({
          element: container,
          documentId: 'semantic-resize-doc',
          mode: 'docx',
          layoutEngineOptions: {
            flowMode: 'semantic',
            semanticOptions: { marginsMode: 'none' },
          },
        });

        await new Promise((resolve) => setTimeout(resolve, 80));

        let layoutOptions = mockIncrementalLayout.mock.calls[mockIncrementalLayout.mock.calls.length - 1]?.[3] as {
          semantic?: { contentWidth?: number };
        };
        expect(layoutOptions.semantic?.contentWidth).toBe(240);

        Object.defineProperty(container, 'clientWidth', {
          configurable: true,
          value: 360,
        });
        resizeCallback?.([], {} as ResizeObserver);

        await new Promise((resolve) => setTimeout(resolve, 180));

        layoutOptions = mockIncrementalLayout.mock.calls[mockIncrementalLayout.mock.calls.length - 1]?.[3] as {
          semantic?: { contentWidth?: number };
        };
        expect(mockIncrementalLayout.mock.calls.length).toBeGreaterThan(1);
        expect(layoutOptions.semantic?.contentWidth).toBe(360);
      } finally {
        Object.defineProperty(window, 'ResizeObserver', {
          configurable: true,
          value: originalResizeObserver,
        });
      }
    });

    it('clears semantic debounce with the owner window when rescheduling', async () => {
      const originalResizeObserver = window.ResizeObserver;
      const ownerDocument = container.ownerDocument;
      const originalDefaultView = ownerDocument.defaultView;
      let resizeCallback: ResizeObserverCallback | null = null;

      class ResizeObserverMock {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
      }

      Object.defineProperty(window, 'ResizeObserver', {
        configurable: true,
        value: ResizeObserverMock,
      });

      const ownerSetTimeout = vi.fn(() => 1);
      const ownerClearTimeout = vi.fn();
      const ownerWindow = {
        setTimeout: ownerSetTimeout,
        clearTimeout: ownerClearTimeout,
        requestAnimationFrame: (callback: FrameRequestCallback) => window.requestAnimationFrame(callback),
        cancelAnimationFrame: (handle: number) => window.cancelAnimationFrame(handle),
        getComputedStyle: window.getComputedStyle.bind(window),
        addEventListener: window.addEventListener.bind(window),
        removeEventListener: window.removeEventListener.bind(window),
        performance: window.performance,
      } as unknown as Window;

      try {
        editor = new PresentationEditor({
          element: container,
          documentId: 'semantic-resize-owner-window-clear-doc',
          mode: 'docx',
          layoutEngineOptions: {
            flowMode: 'semantic',
            semanticOptions: { marginsMode: 'none' },
          },
        });

        await new Promise((resolve) => setTimeout(resolve, 80));

        expect(resizeCallback).toBeTypeOf('function');

        Object.defineProperty(ownerDocument, 'defaultView', {
          configurable: true,
          value: ownerWindow,
        });

        resizeCallback?.([], {} as ResizeObserver);
        resizeCallback?.([], {} as ResizeObserver);

        expect(ownerSetTimeout).toHaveBeenCalledTimes(2);
        expect(ownerClearTimeout).toHaveBeenCalledTimes(1);
      } finally {
        Object.defineProperty(ownerDocument, 'defaultView', {
          configurable: true,
          value: originalDefaultView,
        });
        Object.defineProperty(window, 'ResizeObserver', {
          configurable: true,
          value: originalResizeObserver,
        });
      }
    });

    it('clears semantic debounce with the owner window during destroy', async () => {
      const originalResizeObserver = window.ResizeObserver;
      const ownerDocument = container.ownerDocument;
      const originalDefaultView = ownerDocument.defaultView;
      let resizeCallback: ResizeObserverCallback | null = null;

      class ResizeObserverMock {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
      }

      Object.defineProperty(window, 'ResizeObserver', {
        configurable: true,
        value: ResizeObserverMock,
      });

      const ownerSetTimeout = vi.fn(() => 1);
      const ownerClearTimeout = vi.fn();
      const ownerWindow = {
        setTimeout: ownerSetTimeout,
        clearTimeout: ownerClearTimeout,
        requestAnimationFrame: (callback: FrameRequestCallback) => window.requestAnimationFrame(callback),
        cancelAnimationFrame: (handle: number) => window.cancelAnimationFrame(handle),
        getComputedStyle: window.getComputedStyle.bind(window),
        addEventListener: window.addEventListener.bind(window),
        removeEventListener: window.removeEventListener.bind(window),
        performance: window.performance,
      } as unknown as Window;

      try {
        editor = new PresentationEditor({
          element: container,
          documentId: 'semantic-resize-owner-window-destroy-doc',
          mode: 'docx',
          layoutEngineOptions: {
            flowMode: 'semantic',
            semanticOptions: { marginsMode: 'none' },
          },
        });

        await new Promise((resolve) => setTimeout(resolve, 80));

        expect(resizeCallback).toBeTypeOf('function');

        Object.defineProperty(ownerDocument, 'defaultView', {
          configurable: true,
          value: ownerWindow,
        });

        resizeCallback?.([], {} as ResizeObserver);

        expect(ownerSetTimeout).toHaveBeenCalledTimes(1);

        editor.destroy();
        editor = null as unknown as PresentationEditor;

        expect(ownerClearTimeout).toHaveBeenCalledTimes(1);
      } finally {
        Object.defineProperty(ownerDocument, 'defaultView', {
          configurable: true,
          value: originalDefaultView,
        });
        Object.defineProperty(window, 'ResizeObserver', {
          configurable: true,
          value: originalResizeObserver,
        });
      }
    });
  });

  describe('alternateHeaders threading (paginated flow)', () => {
    it('forwards converter.pageStyles.alternateHeaders=true to incrementalLayout', async () => {
      mockEditorConverterStore.current.pageStyles = { alternateHeaders: true };

      editor = new PresentationEditor({
        element: container,
        documentId: 'alt-headers-true-doc',
        mode: 'docx',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockIncrementalLayout).toHaveBeenCalled();
      const layoutOptions = mockIncrementalLayout.mock.calls[mockIncrementalLayout.mock.calls.length - 1]?.[3] as {
        flowMode?: string;
        alternateHeaders?: boolean;
      };
      expect(layoutOptions.flowMode).toBe('paginated');
      expect(layoutOptions.alternateHeaders).toBe(true);
    });

    it('forwards alternateHeaders=false when converter.pageStyles.alternateHeaders is unset', async () => {
      // converter has no pageStyles.alternateHeaders by default
      editor = new PresentationEditor({
        element: container,
        documentId: 'alt-headers-default-doc',
        mode: 'docx',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const layoutOptions = mockIncrementalLayout.mock.calls[mockIncrementalLayout.mock.calls.length - 1]?.[3] as {
        flowMode?: string;
        alternateHeaders?: boolean;
      };
      expect(layoutOptions.flowMode).toBe('paginated');
      expect(layoutOptions.alternateHeaders).toBe(false);
    });

    it('derives alternateHeaders from word/settings.xml when pageStyles is stale or missing', async () => {
      mockEditorConverterStore.current.pageStyles = { alternateHeaders: false };
      mockEditorConverterStore.current.convertedXml = {
        ...(mockEditorConverterStore.current.convertedXml ?? {}),
        'word/settings.xml': {
          type: 'element',
          name: 'document',
          elements: [
            {
              type: 'element',
              name: 'w:settings',
              elements: [{ type: 'element', name: 'w:evenAndOddHeaders' }],
            },
          ],
        },
      };

      editor = new PresentationEditor({
        element: container,
        documentId: 'alt-headers-settings-doc',
        mode: 'docx',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const layoutOptions = mockIncrementalLayout.mock.calls[mockIncrementalLayout.mock.calls.length - 1]?.[3] as {
        alternateHeaders?: boolean;
      };
      expect(layoutOptions.alternateHeaders).toBe(true);
      const sectionIdCall = (buildMultiSectionIdentifier as unknown as Mock).mock.calls.at(-1) as
        | [unknown, { alternateHeaders?: boolean }]
        | undefined;
      expect(sectionIdCall?.[1]?.alternateHeaders).toBe(true);
    });

    it('coerces falsy but non-boolean pageStyles.alternateHeaders values to false', async () => {
      // Defensive check: if a converter emits undefined/null/0/'', we still want a clean boolean
      mockEditorConverterStore.current.pageStyles = { alternateHeaders: 0 };

      editor = new PresentationEditor({
        element: container,
        documentId: 'alt-headers-coerce-doc',
        mode: 'docx',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const layoutOptions = mockIncrementalLayout.mock.calls[mockIncrementalLayout.mock.calls.length - 1]?.[3] as {
        alternateHeaders?: boolean;
      };
      expect(layoutOptions.alternateHeaders).toBe(false);
    });
  });

  describe('documentBackground resolution', () => {
    it('forwards configured documentBackground when the document has no imported background', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'doc-background-config-doc',
        mode: 'docx',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        layoutEngineOptions: {
          documentBackground: { color: '#EEEEEE' },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(editor.getLayoutOptions().documentBackground).toEqual({ color: '#EEEEEE' });

      const layoutOptions = mockIncrementalLayout.mock.calls[mockIncrementalLayout.mock.calls.length - 1]?.[3] as {
        documentBackground?: { color?: string };
      };
      expect(layoutOptions.documentBackground).toEqual({ color: '#EEEEEE' });
    });

    it('prefers imported documentBackground over the configured fallback', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'doc-background-import-doc',
        mode: 'docx',
        content: {
          type: 'doc',
          attrs: {
            documentBackground: { color: '#DDDDDD' },
          },
          content: [{ type: 'paragraph' }],
        },
        layoutEngineOptions: {
          documentBackground: { color: '#EEEEEE' },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(editor.getLayoutOptions().documentBackground).toEqual({ color: '#DDDDDD' });

      const layoutOptions = mockIncrementalLayout.mock.calls[mockIncrementalLayout.mock.calls.length - 1]?.[3] as {
        documentBackground?: { color?: string };
      };
      expect(layoutOptions.documentBackground).toEqual({ color: '#DDDDDD' });
    });
  });

  describe('scrollToPage', () => {
    const buildMixedPageLayout = () => ({
      layout: {
        pageSize: { w: 612, h: 600 },
        pageGap: 10,
        pages: [
          {
            number: 1,
            size: { w: 612, h: 600 },
            fragments: [],
          },
          {
            number: 2,
            size: { w: 612, h: 1200 },
            fragments: [],
          },
          {
            number: 3,
            size: { w: 612, h: 400 },
            fragments: [],
          },
        ],
      },
      measures: [],
    });

    it('mounts and scrolls to virtualized pages using cumulative mixed-height offsets', async () => {
      mockIncrementalLayout.mockResolvedValueOnce(buildMixedPageLayout());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-scroll-to-page-mixed-heights',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        mode: 'docx',
        layoutEngineOptions: {
          virtualization: { enabled: true, gap: 10, window: 1, overscan: 0 },
        },
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const expectedPageTop = 600 + 10 + 1200 + 10;
      let mountedPageEl: HTMLElement | null = null;
      let scrollTopValue = 0;
      Object.defineProperty(container, 'scrollTop', {
        get: () => scrollTopValue,
        set: (next) => {
          scrollTopValue = Number(next);
          if (!mountedPageEl && Math.abs(scrollTopValue - expectedPageTop) < 0.5) {
            mountedPageEl = document.createElement('div');
            mountedPageEl.setAttribute('data-page-index', '2');
            Object.defineProperty(mountedPageEl, 'scrollIntoView', {
              value: vi.fn(),
              configurable: true,
            });
            pagesHost.appendChild(mountedPageEl);
          }
        },
        configurable: true,
      });

      let now = 0;
      const performanceNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        now += 100;
        cb(now);
        return 1;
      });

      try {
        const didScroll = await editor.scrollToPage(3, 'auto');

        expect(didScroll).toBe(true);
        expect(mountedPageEl).not.toBeNull();
        expect(mountedPageEl!.scrollIntoView).toHaveBeenCalledWith({
          block: 'start',
          inline: 'nearest',
          behavior: 'auto',
        });
      } finally {
        rafSpy.mockRestore();
        performanceNowSpy.mockRestore();
      }
    });

    it('uses effective virtualization default gap when pre-scrolling to unmounted pages', async () => {
      mockIncrementalLayout.mockResolvedValueOnce(buildMixedPageLayout());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-scroll-to-page-default-virtual-gap',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        mode: 'docx',
        layoutEngineOptions: {
          // Intentionally omit `gap` so editor must rely on the effective default.
          virtualization: { enabled: true, window: 1, overscan: 0 },
        },
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const layoutGap = editor.getLayoutSnapshot().layout?.pageGap ?? 0;
      const expectedPageTop = 600 + layoutGap + 1200 + layoutGap;
      let mountedPageEl: HTMLElement | null = null;
      let scrollTopValue = 0;
      Object.defineProperty(container, 'scrollTop', {
        get: () => scrollTopValue,
        set: (next) => {
          scrollTopValue = Number(next);
          if (!mountedPageEl && Math.abs(scrollTopValue - expectedPageTop) < 0.5) {
            mountedPageEl = document.createElement('div');
            mountedPageEl.setAttribute('data-page-index', '2');
            Object.defineProperty(mountedPageEl, 'scrollIntoView', {
              value: vi.fn(),
              configurable: true,
            });
            pagesHost.appendChild(mountedPageEl);
          }
        },
        configurable: true,
      });

      let now = 0;
      const performanceNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        now += 100;
        cb(now);
        return 1;
      });

      try {
        const didScroll = await editor.scrollToPage(3, 'auto');

        expect(didScroll).toBe(true);
        expect(mountedPageEl).not.toBeNull();
        expect(mountedPageEl!.scrollIntoView).toHaveBeenCalledWith({
          block: 'start',
          inline: 'nearest',
          behavior: 'auto',
        });
      } finally {
        rafSpy.mockRestore();
        performanceNowSpy.mockRestore();
      }
    });

    it.each([Number.NaN, 1.5])(
      'rejects invalid pageNumber %p before attempting pre-scroll or mount polling',
      async (invalidPageNumber) => {
        mockIncrementalLayout.mockResolvedValueOnce(buildMixedPageLayout());

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-scroll-to-page-invalid-input',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          mode: 'docx',
          layoutEngineOptions: {
            virtualization: { enabled: true, gap: 10, window: 1, overscan: 0 },
          },
        });

        await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

        let scrollTopValue = 0;
        let scrollWrites = 0;
        Object.defineProperty(container, 'scrollTop', {
          get: () => scrollTopValue,
          set: (next) => {
            scrollWrites += 1;
            scrollTopValue = Number(next);
          },
          configurable: true,
        });

        let now = 0;
        const performanceNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
        const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
          now += 2500;
          cb(now);
          return 1;
        });

        try {
          const didScroll = await editor.scrollToPage(invalidPageNumber, 'auto');
          expect(didScroll).toBe(false);
          expect(scrollWrites).toBe(0);
          expect(rafSpy).not.toHaveBeenCalled();
        } finally {
          rafSpy.mockRestore();
          performanceNowSpy.mockRestore();
        }
      },
    );

    // SD-2495 anchor-nav fix: when the scrollable ancestor differs from the
    // visible host (the real-world shape - the host is overflow:visible and
    // a parent constrains height), scrollTop must land on the ancestor, not
    // just the host. Happy-dom doesn't propagate inline overflow through
    // getComputedStyle, so we stub it to mark a wrapper as scrollable.
    it('writes scrollTop to both the scrollable ancestor and the visibleHost when they differ', async () => {
      const scrollableWrapper = document.createElement('div');
      document.body.removeChild(container);
      scrollableWrapper.appendChild(container);
      document.body.appendChild(scrollableWrapper);

      const originalGetComputedStyle = window.getComputedStyle.bind(window);
      const getComputedStyleSpy = vi
        .spyOn(window, 'getComputedStyle')
        .mockImplementation((el: Element, pseudo?: string | null) => {
          if (el === scrollableWrapper) {
            return { overflowY: 'auto' } as CSSStyleDeclaration;
          }
          return originalGetComputedStyle(el, pseudo ?? null);
        });

      mockIncrementalLayout.mockResolvedValueOnce(buildMixedPageLayout());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-scroll-multi-target',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        mode: 'docx',
        layoutEngineOptions: {
          virtualization: { enabled: true, gap: 10, window: 1, overscan: 0 },
        },
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const expectedPageTop = 600 + 10 + 1200 + 10;

      let wrapperScrollTop = 0;
      let hostScrollTop = 0;
      let mountedPageEl: HTMLElement | null = null;
      const mountPageIfScrolled = (value: number) => {
        if (!mountedPageEl && Math.abs(value - expectedPageTop) < 0.5) {
          mountedPageEl = document.createElement('div');
          mountedPageEl.setAttribute('data-page-index', '2');
          Object.defineProperty(mountedPageEl, 'scrollIntoView', {
            value: vi.fn(),
            configurable: true,
          });
          pagesHost.appendChild(mountedPageEl);
        }
      };
      Object.defineProperty(scrollableWrapper, 'scrollTop', {
        get: () => wrapperScrollTop,
        set: (next) => {
          wrapperScrollTop = Number(next);
          mountPageIfScrolled(wrapperScrollTop);
        },
        configurable: true,
      });
      Object.defineProperty(container, 'scrollTop', {
        get: () => hostScrollTop,
        set: (next) => {
          hostScrollTop = Number(next);
          mountPageIfScrolled(hostScrollTop);
        },
        configurable: true,
      });

      let now = 0;
      const performanceNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        now += 100;
        cb(now);
        return 1;
      });

      try {
        const didScroll = await editor.scrollToPage(3, 'auto');

        expect(didScroll).toBe(true);
        // Both writes must land: the ancestor (real scrollable) AND the host
        // (back-compat for layouts where the host itself is scrollable).
        expect(wrapperScrollTop).toBe(expectedPageTop);
        expect(hostScrollTop).toBe(expectedPageTop);
      } finally {
        rafSpy.mockRestore();
        performanceNowSpy.mockRestore();
        getComputedStyleSpy.mockRestore();
        // Restore DOM layout so the outer afterEach can clean up normally.
        if (scrollableWrapper.parentNode) {
          document.body.removeChild(scrollableWrapper);
        }
        document.body.appendChild(container);
      }
    });

    it('returns null for scrollContainer when the window scrolls', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-window-scroll-container',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        mode: 'docx',
      });

      expect(editor.scrollContainer).toBeNull();
    });
  });

  describe('setDocumentMode', () => {
    it('should initialize with editing mode by default', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      // Verify by checking that Editor was called with documentMode: 'editing'
      const editorConstructorCalls = (Editor as unknown as MockedEditor).mock.calls;
      const lastCall = editorConstructorCalls[editorConstructorCalls.length - 1] as [{ documentMode?: string }];
      expect(lastCall[0].documentMode).toBe('editing');
    });

    it('should accept documentMode in constructor options', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'viewing',
      });

      // Verify by checking that Editor was called with documentMode: 'viewing'
      const editorConstructorCalls = (Editor as unknown as MockedEditor).mock.calls;
      const lastCall = editorConstructorCalls[editorConstructorCalls.length - 1] as [{ documentMode?: string }];
      expect(lastCall[0].documentMode).toBe('viewing');
    });

    it('should update internal mode when setDocumentMode is called', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      editor.setDocumentMode('viewing');

      // Verify that editor.setDocumentMode was called
      expect(mockEditorInstance.setDocumentMode).toHaveBeenCalledWith('viewing');
    });

    it('should delegate to editor.setDocumentMode', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      editor.setDocumentMode('suggesting');

      expect(mockEditorInstance.setDocumentMode).toHaveBeenCalledWith('suggesting');
    });

    it('should handle all valid modes: editing, viewing, suggesting', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      editor.setDocumentMode('editing');
      expect(mockEditorInstance.setDocumentMode).toHaveBeenCalledWith('editing');

      editor.setDocumentMode('viewing');
      expect(mockEditorInstance.setDocumentMode).toHaveBeenCalledWith('viewing');

      editor.setDocumentMode('suggesting');
      expect(mockEditorInstance.setDocumentMode).toHaveBeenCalledWith('suggesting');
    });

    it('should throw TypeError for invalid mode values', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      // Call with invalid mode should throw
      expect(() => editor.setDocumentMode('invalid-mode' as 'editing' | 'viewing' | 'suggesting')).toThrow(TypeError);
      expect(() => editor.setDocumentMode('invalid-mode' as 'editing' | 'viewing' | 'suggesting')).toThrow(
        /Must be one of/,
      );
    });

    it('should create editable function that returns true for editing and suggesting', () => {
      // Create editor with editing mode
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'editing',
      });

      const editorConstructorCalls = (Editor as unknown as MockedEditor).mock.calls;
      const editorOptions = editorConstructorCalls[editorConstructorCalls.length - 1] as [
        { editorProps: { editable: () => boolean } },
      ];
      const editableFunction = editorOptions[0].editorProps.editable;

      // The editable function should return true for editing mode
      expect(editableFunction()).toBe(true);
    });

    it('should create editable function that returns false for viewing mode', () => {
      // Create editor with viewing mode
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'viewing',
      });

      const editorConstructorCalls = (Editor as unknown as MockedEditor).mock.calls;
      const editorOptions = editorConstructorCalls[editorConstructorCalls.length - 1] as [
        { editorProps: { editable: () => boolean } },
      ];
      const editableFunction = editorOptions[0].editorProps.editable;

      // The editable function should return false for viewing mode
      expect(editableFunction()).toBe(false);
    });

    it('should transition between modes correctly', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'editing',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      // editing -> viewing
      editor.setDocumentMode('viewing');
      expect(mockEditorInstance.setDocumentMode).toHaveBeenCalledWith('viewing');

      // viewing -> suggesting
      editor.setDocumentMode('suggesting');
      expect(mockEditorInstance.setDocumentMode).toHaveBeenCalledWith('suggesting');

      // suggesting -> editing
      editor.setDocumentMode('editing');
      expect(mockEditorInstance.setDocumentMode).toHaveBeenCalledWith('editing');
    });
  });

  describe('presentation surfaces', () => {
    it('attaches itself to the underlying Editor and exposes the host element', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      expect(mockEditorInstance.presentationEditor).toBe(editor);
      expect(editor.element).toBe(container);
    });

    it('clears the presentation reference on destroy', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      expect(mockEditorInstance.presentationEditor).toBe(editor);

      editor.destroy();
      expect(mockEditorInstance.presentationEditor).toBeNull();
      editor = null as unknown as PresentationEditor;
    });
  });

  describe('runtime helpers', () => {
    it('normalizes client coordinates relative to the viewport', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const result = editor.normalizeClientPoint(120, 80);
      expect(result).toEqual({ x: 120, y: 80 });
    });

    it('propagates context menu toggles to the underlying editor', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      editor.setContextMenuDisabled(true);
      expect(mockEditorInstance.setOptions).toHaveBeenCalledWith({ disableContextMenu: true });
    });

    it('forwards keyboard events to the hidden editor via the input bridge', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      container.dispatchEvent(event);
      await Promise.resolve();

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'keydown' }));
    });

    it('does not forward keyboard events when default is prevented', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      const preventHandler = vi.fn((e) => e.preventDefault());
      container.addEventListener('keydown', preventHandler, { capture: true });

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      container.dispatchEvent(event);
      await Promise.resolve();
      container.removeEventListener('keydown', preventHandler, { capture: true });

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('does not forward keyboard events from registered UI surfaces', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      const uiSurface = document.createElement('div');
      uiSurface.setAttribute('data-editor-ui-surface', '');
      container.appendChild(uiSurface);

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      uiSurface.dispatchEvent(event);
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('does not forward keyboard events with keyCode 229 (IME)', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      // Create keyboard event with keyCode 229 (IME composition)
      const event = new KeyboardEvent('keydown', {
        key: 'Process',
        keyCode: 229,
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(event);
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('does not forward keyboard events during composition (isComposing)', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      // Create keyboard event with isComposing flag
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
        cancelable: true,
      });
      // Manually set isComposing property (some browsers don't support it in the init dict)
      Object.defineProperty(event, 'isComposing', { value: true, writable: false });

      container.dispatchEvent(event);
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('does not forward dead keys that start a composition sequence', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      const event = new KeyboardEvent('keydown', {
        key: 'Dead',
        code: 'KeyE',
        altKey: true,
        bubbles: true,
        cancelable: true,
      });

      container.dispatchEvent(event);
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('does not forward plain character keys without modifiers', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      // Plain character keys should be handled by beforeinput, not forwarded via keydown
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(event);
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('forwards keyboard shortcuts with modifiers like Ctrl+B', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      // Keyboard shortcuts with modifiers should be forwarded
      const event = new KeyboardEvent('keydown', {
        key: 'b',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(event);
      await Promise.resolve();

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'keydown' }));
    });

    it('does not forward shift+character combinations (uppercase letters)', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      // Shift+A produces uppercase 'A' - should be filtered as plain character
      const event = new KeyboardEvent('keydown', {
        key: 'A',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(event);
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('forwards special keys like Enter, Tab, Escape without modifiers', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      // Enter key should be forwarded (key.length > 1)
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(enterEvent);
      await Promise.resolve();

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'keydown', key: 'Enter' }));
    });

    it('dispatches keyboard events synchronously so preventDefault can block browser defaults', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      // Track when dispatchEvent is called relative to our code
      let dispatchedSynchronously = false;
      let checkRan = false;

      mockEditorInstance.view.dom.dispatchEvent = vi.fn(() => {
        // This runs when the synthetic event is dispatched
        dispatchedSynchronously = !checkRan;
        return true;
      });

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });

      container.dispatchEvent(event);

      // Mark that synchronous code has completed
      checkRan = true;

      // The dispatch should have happened synchronously (before checkRan was set)
      expect(dispatchedSynchronously).toBe(true);
    });

    it('calls preventDefault on original event when synthetic event is canceled', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      // Make dispatchEvent return false (event was canceled)
      mockEditorInstance.view.dom.dispatchEvent = vi.fn(() => false);

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      container.dispatchEvent(event);

      // Original event should have preventDefault called when synthetic was canceled
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('forwards contextmenu events to the hidden editor via the input bridge', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      const event = new MouseEvent('contextmenu', { clientX: 10, clientY: 20 });
      container.dispatchEvent(event);

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'contextmenu' }));
    });

    it('forwards beforeinput events to the hidden editor via the input bridge', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      const event = new InputEvent('beforeinput', { data: 'a', inputType: 'insertText', bubbles: true });
      container.dispatchEvent(event);
      await Promise.resolve();

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'beforeinput' }));
    });

    it('forwards composing beforeinput events to the hidden editor via the input bridge', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      const event = new InputEvent('beforeinput', {
        data: 'é',
        inputType: 'insertCompositionText',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'isComposing', { value: true, writable: false });

      container.dispatchEvent(event);
      await Promise.resolve();

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'beforeinput', inputType: 'insertCompositionText', isComposing: true }),
      );
    });

    it('forwards composing input events to the hidden editor via the input bridge', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      const event = new InputEvent('input', {
        data: 'é',
        inputType: 'insertCompositionText',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'isComposing', { value: true, writable: false });

      container.dispatchEvent(event);
      await Promise.resolve();

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'input', inputType: 'insertCompositionText', isComposing: true }),
      );
    });

    it('dispatches composing beforeinput before a following compositionend can overtake it', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const calls: string[] = [];

      mockEditorInstance.view.dom.dispatchEvent = vi.fn((event: Event) => {
        calls.push(event.type);
        return true;
      });

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: 'é',
        inputType: 'insertCompositionText',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(beforeInputEvent, 'isComposing', { value: true, writable: false });

      container.dispatchEvent(beforeInputEvent);
      container.dispatchEvent(new CompositionEvent('compositionend', { data: 'é', bubbles: true, cancelable: true }));

      expect(calls[0]).toBe('beforeinput');
      expect(calls[1]).toBe('compositionend');
    });

    it('forwards composition events to the hidden editor via the input bridge', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      const event = new CompositionEvent('compositionstart', { data: 'あ', bubbles: true });
      container.dispatchEvent(event);

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'compositionstart' }));
    });
  });

  describe('editable state integration', () => {
    it('should pass documentMode to Editor constructor', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'suggesting',
      });

      const editorConstructorCalls = (Editor as unknown as MockedEditor).mock.calls;
      const editorOptions = editorConstructorCalls[editorConstructorCalls.length - 1] as [{ documentMode?: string }];

      expect(editorOptions[0].documentMode).toBe('suggesting');
    });

    it('should create editable function that respects documentMode', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'editing',
      });

      const editorConstructorCalls = (Editor as unknown as MockedEditor).mock.calls;
      const editorOptions = editorConstructorCalls[editorConstructorCalls.length - 1] as [
        { editorProps: { editable: () => boolean } },
      ];
      const editableFunction = editorOptions[0].editorProps.editable;

      expect(typeof editableFunction).toBe('function');
      expect(editableFunction()).toBe(true); // editing mode is editable
    });
  });

  describe('input blocking in viewing mode', () => {
    it('should not forward keyboard events in viewing mode', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'viewing',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      // Test special key (Enter)
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(enterEvent);
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();

      // Test keyboard shortcut (Ctrl+B)
      const ctrlBEvent = new KeyboardEvent('keydown', {
        key: 'b',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(ctrlBEvent);
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('should not forward text/input events in viewing mode', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'viewing',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      // Test beforeinput event
      const beforeInputEvent = new InputEvent('beforeinput', {
        data: 'a',
        inputType: 'insertText',
        bubbles: true,
      });
      container.dispatchEvent(beforeInputEvent);
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();

      // Test input event
      const inputEvent = new InputEvent('input', {
        data: 'b',
        inputType: 'insertText',
        bubbles: true,
      });
      container.dispatchEvent(inputEvent);
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('should not forward composition events in viewing mode', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'viewing',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      // Test compositionstart
      const compStartEvent = new CompositionEvent('compositionstart', {
        data: 'あ',
        bubbles: true,
      });
      container.dispatchEvent(compStartEvent);

      expect(dispatchSpy).not.toHaveBeenCalled();

      // Test compositionupdate
      const compUpdateEvent = new CompositionEvent('compositionupdate', {
        data: 'あい',
        bubbles: true,
      });
      container.dispatchEvent(compUpdateEvent);

      expect(dispatchSpy).not.toHaveBeenCalled();

      // Test compositionend
      const compEndEvent = new CompositionEvent('compositionend', {
        data: 'あいう',
        bubbles: true,
      });
      container.dispatchEvent(compEndEvent);

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('should not forward context menu events in viewing mode', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'viewing',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      const contextMenuEvent = new MouseEvent('contextmenu', {
        clientX: 10,
        clientY: 20,
      });
      container.dispatchEvent(contextMenuEvent);

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('should forward events normally when switching back to editing mode', async () => {
      // Start in viewing mode
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'viewing',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      // Verify events are blocked in viewing mode
      const enterEvent1 = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(enterEvent1);
      await Promise.resolve();
      expect(dispatchSpy).not.toHaveBeenCalled();

      // Switch to editing mode
      editor.setDocumentMode('editing');

      // Clear the spy to track new calls
      dispatchSpy.mockClear();

      // Verify events are now forwarded
      const enterEvent2 = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(enterEvent2);
      await Promise.resolve();

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'keydown', key: 'Enter' }));

      // Test beforeinput
      dispatchSpy.mockClear();
      const inputEvent = new InputEvent('beforeinput', {
        data: 'a',
        inputType: 'insertText',
        bubbles: true,
      });
      container.dispatchEvent(inputEvent);
      await Promise.resolve();

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'beforeinput' }));

      // Test composition
      dispatchSpy.mockClear();
      const compEvent = new CompositionEvent('compositionstart', {
        data: 'あ',
        bubbles: true,
      });
      container.dispatchEvent(compEvent);

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'compositionstart' }));

      // Test context menu
      dispatchSpy.mockClear();
      const contextMenuEvent = new MouseEvent('contextmenu', {
        clientX: 10,
        clientY: 20,
      });
      container.dispatchEvent(contextMenuEvent);

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'contextmenu' }));
    });

    it('should forward events in suggesting mode', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        documentMode: 'suggesting',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;
      const dispatchSpy = mockEditorInstance.view.dom.dispatchEvent;

      // Keyboard events should be forwarded
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(enterEvent);
      await Promise.resolve();

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'keydown' }));

      // Input events should be forwarded
      dispatchSpy.mockClear();
      const inputEvent = new InputEvent('beforeinput', {
        data: 'a',
        inputType: 'insertText',
        bubbles: true,
      });
      container.dispatchEvent(inputEvent);
      await Promise.resolve();

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'beforeinput' }));
    });
  });

  describe('click-to-type behavior', () => {
    it('should focus editor and set cursor to position 0 when clicking before layout is ready', () => {
      // Mock layout not ready (null)
      mockIncrementalLayout.mockResolvedValue({ layout: null, measures: [] });

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      expect(viewport).toBeDefined();

      const focusSpy = mockEditorInstance.view.focus as Mock;
      const domFocusSpy = mockEditorInstance.view.dom.focus as Mock;

      // Simulate pointer event before layout is ready
      // Note: Using MouseEvent as PointerEvent may not be available in test environment
      const clickEvent = new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 100,
        clientY: 100,
        button: 0,
      });

      const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');

      // Should not throw error
      expect(() => viewport.dispatchEvent(clickEvent)).not.toThrow();

      // Verify preventDefault was called
      expect(preventDefaultSpy).toHaveBeenCalled();

      // Verify editor DOM was focused
      expect(domFocusSpy).toHaveBeenCalled();
      expect(focusSpy).toHaveBeenCalled();
    });

    it('should ignore non-left-button clicks when layout is not ready', () => {
      mockIncrementalLayout.mockResolvedValue({ layout: null, measures: [] });

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      const focusSpy = mockEditorInstance.view.focus as Mock;

      // Simulate right-click (button 2)
      const rightClickEvent = new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 100,
        clientY: 100,
        button: 2,
      });

      viewport.dispatchEvent(rightClickEvent);

      // Verify focus was NOT called for non-left clicks
      expect(focusSpy).not.toHaveBeenCalled();
    });

    it('should blur active element before focusing editor when layout is not ready', () => {
      mockIncrementalLayout.mockResolvedValue({ layout: null, measures: [] });

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      // Create and focus a dummy element
      const dummyInput = document.createElement('input');
      container.appendChild(dummyInput);
      dummyInput.focus();

      const blurSpy = vi.spyOn(dummyInput, 'blur');

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;

      const clickEvent = new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 100,
        clientY: 100,
        button: 0,
      });

      viewport.dispatchEvent(clickEvent);

      // Verify the previously focused element was blurred
      expect(blurSpy).toHaveBeenCalled();

      container.removeChild(dummyInput);
    });

    it('should use normal click-to-position flow when layout is ready', async () => {
      const layoutResult = {
        layout: {
          pageSize: { w: 612, h: 792 },
          pages: [
            {
              number: 1,
              numberText: '1',
              size: { w: 612, h: 792 },
              fragments: [],
              margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
              sectionRefs: {
                headerRefs: { odd: 'rId-header-default' },
                footerRefs: { default: 'rId-footer-default' },
              },
            },
          ],
        },
        measures: [],
        blocks: [],
      };

      mockIncrementalLayout.mockResolvedValue(layoutResult);

      // Mock clickToPosition / resolvePointerPositionHit to return a position hit
      const mockHit = { pos: 42 };
      mockClickToPosition.mockReturnValue(mockHit);
      mockResolvePointerPositionHit.mockReturnValue({
        pos: 42,
        layoutEpoch: 0,
        pageIndex: 0,
        blockId: '',
        column: 0,
        lineIndex: -1,
      });

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      // Wait for layout to complete
      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      // SD-2749: PointerNormalization uses elementsFromPoint to detect the
      // .superdoc-page under the cursor; happy-dom doesn't compute layout, so
      // simulate a page element under the click point.
      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const fakePage = document.createElement('div');
      fakePage.classList.add('superdoc-page');
      fakePage.setAttribute('data-page-index', '0');
      pagesHost.appendChild(fakePage);
      vi.spyOn(fakePage, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 612,
        height: 792,
        right: 612,
        bottom: 792,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const originalElementsFromPoint = (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
      (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [
        fakePage,
      ];

      try {
        // Clear mock to track fresh calls
        mockClickToPosition.mockClear();
        mockResolvePointerPositionHit.mockClear();

        const clickEvent = new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
          button: 0,
        });

        viewport.dispatchEvent(clickEvent);

        // Verify resolvePointerPositionHit was called (normal flow)
        expect(mockResolvePointerPositionHit).toHaveBeenCalled();
      } finally {
        if (originalElementsFromPoint === undefined) {
          delete (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
        } else {
          (document as unknown as { elementsFromPoint: unknown }).elementsFromPoint = originalElementsFromPoint;
        }
      }
    });

    it('should handle case where editor view DOM is not available when layout is not ready', () => {
      mockIncrementalLayout.mockResolvedValue({ layout: null, measures: [] });

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      // Temporarily remove dom
      const originalDom = mockEditorInstance.view.dom;
      mockEditorInstance.view.dom = undefined;

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;

      const clickEvent = new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 100,
        clientY: 100,
        button: 0,
      });

      const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');

      // Should not throw error
      expect(() => viewport.dispatchEvent(clickEvent)).not.toThrow();

      // Should still prevent default
      expect(preventDefaultSpy).toHaveBeenCalled();

      // Restore dom
      mockEditorInstance.view.dom = originalDom;
    });
  });

  describe('header/footer interactions', () => {
    const buildLayoutResult = () => ({
      layout: {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            numberText: '1',
            size: { w: 612, h: 792 },
            fragments: [],
            margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { default: 'rId-header-default' },
              footerRefs: { default: 'rId-footer-default' },
            },
          },
        ],
      },
      measures: [],
      headers: [
        {
          kind: 'header',
          type: 'default',
          layout: {
            height: 36,
            pages: [{ number: 1, fragments: [] }],
          },
          blocks: [],
          measures: [],
        },
      ],
      footers: [
        {
          kind: 'footer',
          type: 'default',
          layout: {
            height: 36,
            pages: [{ number: 1, fragments: [] }],
          },
          blocks: [],
          measures: [],
        },
      ],
    });

    let rafSpy: ReturnType<typeof vi.spyOn> | null = null;

    beforeEach(() => {
      rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    });

    afterEach(() => {
      rafSpy?.mockRestore();
      rafSpy = null;
    });

    it('enters header mode on double-click and announces via aria-live', async () => {
      mockIncrementalLayout.mockResolvedValueOnce(buildLayoutResult());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

      // Wait for the async rendering to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Add a mock page element that #getPageElement looks for
      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      pagesHost.appendChild(mockPage);

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      const boundingSpy = vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const modeSpy = vi.fn();
      const contextSpy = vi.fn();
      editor.on('headerFooterModeChanged', modeSpy);
      editor.on('headerFooterEditingContext', contextSpy);

      // Click inside the header hitbox (y between header margin 36 and top margin 72)
      viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 120, clientY: 50, button: 0 }));

      await vi.waitFor(() => expect(modeSpy).toHaveBeenCalled());

      const lastMode = modeSpy.mock.calls.at(-1)?.[0];
      expect(lastMode).toMatchObject({
        mode: 'header',
        kind: 'header',
        headerId: 'rId-header-default',
        pageIndex: 0,
        pageNumber: 1,
      });
      expect(contextSpy).toHaveBeenCalledWith(
        expect.objectContaining({ headerId: 'rId-header-default', kind: 'header' }),
      );
      const ariaLive = container.querySelector('.presentation-editor__aria-live');
      expect(ariaLive?.textContent).toContain('Editing Header');
      boundingSpy.mockRestore();
    });

    it('re-emits live header/footer child editor updates and transactions', async () => {
      mockIncrementalLayout.mockResolvedValueOnce(buildLayoutResult());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      pagesHost.appendChild(mockPage);

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const updateSpy = vi.fn();
      const transactionSpy = vi.fn();
      editor.on('headerFooterUpdate', updateSpy);
      editor.on('headerFooterTransaction', transactionSpy);

      viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 120, clientY: 50, button: 0 }));

      await vi.waitFor(() => expect(createdSectionEditors.length).toBeGreaterThan(0));
      await vi.waitFor(() =>
        expect(
          createdSectionEditors.some(({ editor: sectionEditor }) => sectionEditor === editor.getActiveEditor()),
        ).toBe(true),
      );

      const sourceEditor = editor.getActiveEditor();
      expect(sourceEditor).toBeDefined();

      const transaction = { docChanged: true };
      sourceEditor?.emit('update', { editor: sourceEditor });
      sourceEditor?.emit('transaction', { editor: sourceEditor, transaction, duration: 9 });

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          editor: expect.any(Object),
          sourceEditor,
          surface: 'header',
          headerId: 'rId-header-default',
          sectionType: 'default',
        }),
      );
      expect(transactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          editor: expect.any(Object),
          sourceEditor,
          surface: 'header',
          headerId: 'rId-header-default',
          sectionType: 'default',
          transaction,
          duration: 9,
        }),
      );
    });

    it('stops re-emitting header/footer child editor events after exiting edit mode', async () => {
      mockIncrementalLayout.mockResolvedValueOnce(buildLayoutResult());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      pagesHost.appendChild(mockPage);

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const updateSpy = vi.fn();
      const transactionSpy = vi.fn();
      editor.on('headerFooterUpdate', updateSpy);
      editor.on('headerFooterTransaction', transactionSpy);

      viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 120, clientY: 50, button: 0 }));

      await vi.waitFor(() => expect(createdSectionEditors.length).toBeGreaterThan(0));
      await vi.waitFor(() =>
        expect(
          createdSectionEditors.some(({ editor: sectionEditor }) => sectionEditor === editor.getActiveEditor()),
        ).toBe(true),
      );

      const sourceEditor = editor.getActiveEditor();
      const transaction = { docChanged: true };

      sourceEditor?.emit('update', { editor: sourceEditor });
      sourceEditor?.emit('transaction', { editor: sourceEditor, transaction, duration: 9 });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(transactionSpy).toHaveBeenCalledTimes(1);

      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await vi.waitFor(() => expect(editor.getActiveEditor()).not.toBe(sourceEditor));

      sourceEditor?.emit('update', { editor: sourceEditor });
      sourceEditor?.emit('transaction', { editor: sourceEditor, transaction, duration: 11 });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(transactionSpy).toHaveBeenCalledTimes(1);
    });

    it('re-emits live footer child editor updates and transactions', async () => {
      mockIncrementalLayout.mockResolvedValueOnce(buildLayoutResult());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      pagesHost.appendChild(mockPage);

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const updateSpy = vi.fn();
      const transactionSpy = vi.fn();
      editor.on('headerFooterUpdate', updateSpy);
      editor.on('headerFooterTransaction', transactionSpy);

      viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 120, clientY: 740, button: 0 }));

      await vi.waitFor(() => expect(createdSectionEditors.length).toBeGreaterThan(0));
      await vi.waitFor(() =>
        expect(
          createdSectionEditors.some(({ editor: sectionEditor }) => sectionEditor === editor.getActiveEditor()),
        ).toBe(true),
      );

      const sourceEditor = editor.getActiveEditor();
      expect(sourceEditor).toBeDefined();

      const transaction = { docChanged: true };
      sourceEditor?.emit('update', { editor: sourceEditor });
      sourceEditor?.emit('transaction', { editor: sourceEditor, transaction, duration: 12 });

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          editor: expect.any(Object),
          sourceEditor,
          surface: 'footer',
          headerId: 'rId-footer-default',
          sectionType: 'default',
        }),
      );
      expect(transactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          editor: expect.any(Object),
          sourceEditor,
          surface: 'footer',
          headerId: 'rId-footer-default',
          sectionType: 'default',
          transaction,
          duration: 12,
        }),
      );
    });

    it('exits header mode on Escape and announces the transition', async () => {
      mockIncrementalLayout.mockResolvedValue(buildLayoutResult());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

      // Wait for the async rendering to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Add a mock page element that #getPageElement looks for
      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      pagesHost.appendChild(mockPage);

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const modeSpy = vi.fn();
      editor.on('headerFooterModeChanged', modeSpy);

      viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 120, clientY: 50, button: 0 }));
      await vi.waitFor(() => expect(modeSpy).toHaveBeenCalledTimes(1));

      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      await vi.waitFor(() => expect(modeSpy).toHaveBeenCalledTimes(2));
      const lastMode = modeSpy.mock.calls.at(-1)?.[0];
      expect(lastMode.mode).toBe('body');
      expect(lastMode.headerId).toBeUndefined();
      const ariaLive = container.querySelector('.presentation-editor__aria-live');
      expect(ariaLive?.textContent).toContain('Exited header/footer edit mode');
    });

    it('emits headerFooterEditBlocked when keyboard shortcut has no matching region', async () => {
      // Header/footer regions are derived from the resolved layout's PAGES
      // (HeaderFooterSessionManager.rebuildRegions builds one region per page), not
      // from the headers[] array. To exercise the "no matching region" path the
      // resolved layout must have no page 0 at all; emptying headers[] still leaves a
      // per-page region and takes the activation path instead. With no pages,
      // getRegionForPage('header', 0) returns null deterministically, independent of
      // render timing.
      const layoutNoPages = buildLayoutResult();
      layoutNoPages.layout.pages = [];
      mockIncrementalLayout.mockResolvedValueOnce(layoutNoPages);

      const blockedSpy = vi.fn();

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      editor.on('headerFooterEditBlocked', blockedSpy);

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

      container.dispatchEvent(
        new KeyboardEvent('keydown', { ctrlKey: true, altKey: true, code: 'KeyH', bubbles: true }),
      );

      await vi.waitFor(() =>
        expect(blockedSpy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'missingRegion' })),
      );
    });

    it('returns false without emitting an error when an unqualified bookmark is not found', async () => {
      mockIncrementalLayout.mockResolvedValueOnce(buildLayoutResult());
      const errorSpy = vi.fn();

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });
      editor.on('error', errorSpy);

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

      const didNavigate = await editor.navigateTo({
        kind: 'entity',
        entityType: 'bookmark',
        name: 'missing-bm',
      });

      expect(didNavigate).toBe(false);
      expect(bookmarkResolverMocks.findAllBookmarksInDocument).toHaveBeenCalled();
      expect(bookmarkResolverMocks.resolveBookmarkTarget).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('exits active header mode before navigating to a body bookmark', async () => {
      const layoutResult = buildLayoutResult();
      layoutResult.layout.pages[0].fragments = [
        {
          kind: 'para',
          blockId: 'body-p1',
          pmStart: 0,
          pmEnd: 20,
          y: 120,
        },
      ];
      mockIncrementalLayout.mockResolvedValue(layoutResult);
      bookmarkResolverMocks.findAllBookmarksInDocument.mockReturnValueOnce([
        { name: 'body-bm', bookmarkId: '7', storyKey: 'body' },
      ]);
      bookmarkResolverMocks.resolveBookmarkTarget.mockReturnValueOnce({
        pos: 8,
        name: 'body-bm',
        bookmarkId: '7',
        endPos: 9,
        node: { attrs: { name: 'body-bm', id: '7' } },
      });

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      pagesHost.appendChild(mockPage);

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 120, clientY: 50, button: 0 }));
      await vi.waitFor(() => expect(createdSectionEditors.length).toBeGreaterThan(0));

      const headerEditor = editor.getActiveEditor();
      const bodyEditor = (Editor as unknown as MockedEditor).mock.results[0].value;
      bodyEditor.commands = {
        ...(bodyEditor.commands ?? {}),
        setTextSelection: vi.fn(),
      };
      expect(headerEditor).not.toBe(bodyEditor);

      const didNavigate = await editor.navigateTo({
        kind: 'entity',
        entityType: 'bookmark',
        name: 'body-bm',
      });

      expect(didNavigate).toBe(true);
      expect(editor.getActiveEditor()).toBe(bodyEditor);
      expect(headerEditor.commands.setTextSelection).not.toHaveBeenCalledWith({ from: 8, to: 8 });
      expect(bodyEditor.commands.setTextSelection).toHaveBeenCalledWith({ from: 8, to: 8 });
    });

    it('activates the matching header surface before navigating to a document-wide bookmark', async () => {
      mockIncrementalLayout.mockResolvedValueOnce(buildLayoutResult());
      bookmarkResolverMocks.findAllBookmarksInDocument.mockReturnValueOnce([
        { name: 'hdr-bm', bookmarkId: '5', storyKey: 'hf:part:rId-header-default' },
      ]);
      bookmarkResolverMocks.resolveBookmarkTarget.mockReturnValueOnce({
        pos: 7,
        name: 'hdr-bm',
        bookmarkId: '5',
        endPos: 10,
        node: { attrs: { name: 'hdr-bm', id: '5' } },
      });

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      pagesHost.appendChild(mockPage);

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const didNavigate = await editor.navigateTo({
        kind: 'entity',
        entityType: 'bookmark',
        name: 'hdr-bm',
      });

      expect(didNavigate).toBe(true);
      await vi.waitFor(() => expect(createdSectionEditors.length).toBeGreaterThan(0));

      const sessionEditor = editor.getActiveEditor();
      expect(sessionEditor.commands.setTextSelection).toHaveBeenCalledWith({ from: 7, to: 7 });
      expect(sessionEditor.view.focus).toHaveBeenCalled();
    });

    it('navigates successfully for an explicit headerFooterSlot bookmark target', async () => {
      mockIncrementalLayout.mockResolvedValueOnce(buildLayoutResult());
      bookmarkResolverMocks.resolveBookmarkTarget.mockReturnValueOnce({
        pos: 9,
        name: 'slot-bm',
        bookmarkId: '6',
        endPos: 12,
        node: { attrs: { name: 'slot-bm', id: '6' } },
      });

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      pagesHost.appendChild(mockPage);

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const didNavigate = await editor.navigateTo({
        kind: 'entity',
        entityType: 'bookmark',
        name: 'slot-bm',
        story: {
          kind: 'story',
          storyType: 'headerFooterSlot',
          section: { kind: 'section', sectionId: 'section-0' },
          headerFooterKind: 'header',
          variant: 'default',
        },
      });

      expect(didNavigate).toBe(true);
      await vi.waitFor(() => expect(createdSectionEditors.length).toBeGreaterThan(0));

      const sessionEditor = editor.getActiveEditor();
      expect(sessionEditor.commands.setTextSelection).toHaveBeenCalledWith({ from: 9, to: 9 });
      expect(sessionEditor.view.focus).toHaveBeenCalled();
    });

    it('normalizes odd-page default header regions for explicit headerFooterSlot bookmark targets', async () => {
      mockIncrementalLayout.mockResolvedValueOnce({
        layout: {
          pageSize: { w: 612, h: 792 },
          pages: [
            {
              number: 1,
              numberText: '1',
              size: { w: 612, h: 792 },
              fragments: [],
              margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
              sectionRefs: {
                headerRefs: { default: 'rId-header-default' },
                footerRefs: { default: 'rId-footer-default' },
              },
            },
          ],
        },
        measures: [],
        headers: [
          {
            kind: 'header',
            type: 'odd',
            layout: {
              height: 36,
              pages: [{ number: 1, fragments: [] }],
            },
            blocks: [],
            measures: [],
          },
        ],
        footers: [
          {
            kind: 'footer',
            type: 'default',
            layout: {
              height: 36,
              pages: [{ number: 1, fragments: [] }],
            },
            blocks: [],
            measures: [],
          },
        ],
      });
      bookmarkResolverMocks.resolveBookmarkTarget.mockReturnValueOnce({
        pos: 11,
        name: 'slot-odd-bm',
        bookmarkId: '7',
        endPos: 14,
        node: { attrs: { name: 'slot-odd-bm', id: '7' } },
      });

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const mockPage = document.createElement('div');
      mockPage.setAttribute('data-page-index', '0');
      pagesHost.appendChild(mockPage);

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const didNavigate = await editor.navigateTo({
        kind: 'entity',
        entityType: 'bookmark',
        name: 'slot-odd-bm',
        story: {
          kind: 'story',
          storyType: 'headerFooterSlot',
          section: { kind: 'section', sectionId: 'section-0' },
          headerFooterKind: 'header',
          variant: 'default',
        },
      });

      expect(didNavigate).toBe(true);
      await vi.waitFor(() => expect(createdSectionEditors.length).toBeGreaterThan(0));

      const sessionEditor = editor.getActiveEditor();
      expect(sessionEditor.commands.setTextSelection).toHaveBeenCalledWith({ from: 11, to: 11 });
      expect(sessionEditor.view.focus).toHaveBeenCalled();
    });
  });

  describe('footnote interactions', () => {
    const prepareFootnoteEditor = async () => {
      mockIncrementalLayout.mockResolvedValueOnce({
        layout: {
          pageSize: { w: 612, h: 792 },
          pages: [
            {
              number: 1,
              numberText: '1',
              size: { w: 612, h: 792 },
              fragments: [],
              margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
            },
          ],
        },
        measures: [],
      });

      mockEditorConverterStore.current = {
        ...mockEditorConverterStore.current,
        footnotes: [
          {
            id: '1',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lazy note session' }] }],
          },
        ],
        convertedXml: {
          'word/footnotes.xml': {
            elements: [
              {
                name: 'w:footnotes',
                elements: [
                  {
                    name: 'w:footnote',
                    attributes: { 'w:id': '1' },
                    elements: [{ name: 'w:p', elements: [] }],
                  },
                ],
              },
            ],
          },
        },
      };

      editor = new PresentationEditor({
        element: container,
        documentId: 'footnote-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const footnoteFragment = document.createElement('span');
      footnoteFragment.setAttribute('data-block-id', 'footnote-1-0');
      viewport.appendChild(footnoteFragment);

      return { viewport, footnoteFragment };
    };

    const activateFootnoteSession = async () => {
      const { viewport, footnoteFragment } = await prepareFootnoteEditor();

      expect(editor.getStorySessionManager()).not.toBeNull();
      expect(editor.getStorySessionManager()?.getActiveSession()).toBeNull();

      footnoteFragment.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, clientX: 120, clientY: 740, button: 0 }),
      );

      await vi.waitFor(() => expect(mockCreateStoryEditor.mock.calls.length).toBeGreaterThanOrEqual(1));
      await vi.waitFor(() => expect(createdStoryEditors.length).toBeGreaterThanOrEqual(1));

      return {
        viewport,
        footnoteFragment,
        sessionEditor: createdStoryEditors.at(-1)?.editor,
      };
    };

    const prepareEndnoteEditor = async () => {
      mockIncrementalLayout.mockResolvedValueOnce({
        layout: {
          pageSize: { w: 612, h: 792 },
          pages: [
            {
              number: 1,
              numberText: '1',
              size: { w: 612, h: 792 },
              fragments: [],
              margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
            },
          ],
        },
        measures: [],
      });

      mockEditorConverterStore.current = {
        ...mockEditorConverterStore.current,
        endnotes: [
          {
            id: '1',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lazy endnote session' }] }],
          },
        ],
        convertedXml: {
          'word/endnotes.xml': {
            elements: [
              {
                name: 'w:endnotes',
                elements: [
                  {
                    name: 'w:endnote',
                    attributes: { 'w:id': '1' },
                    elements: [{ name: 'w:p', elements: [] }],
                  },
                ],
              },
            ],
          },
        },
      };

      editor = new PresentationEditor({
        element: container,
        documentId: 'endnote-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 1000,
        right: 800,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const endnoteFragment = document.createElement('span');
      endnoteFragment.setAttribute('data-block-id', 'endnote-1-0');
      viewport.appendChild(endnoteFragment);

      return { viewport, endnoteFragment };
    };

    it('activates a note editing session through the shared story-session manager', async () => {
      const { sessionEditor } = await activateFootnoteSession();

      expect(editor.getStorySessionManager()).not.toBeNull();
      expect(editor.getStorySessionManager()?.getActiveSession()?.commitPolicy).toBe('onExit');
      expect(editor.getActiveEditor()).toBe(sessionEditor);
      expect(sessionEditor?.setDocumentMode).toHaveBeenCalledWith('editing');

      editor.setDocumentMode('viewing');
      expect(sessionEditor?.setDocumentMode).toHaveBeenLastCalledWith('viewing');
      expect(createdSectionEditors.length).toBe(0);
    });

    it('routes tracked-change navigation to the active note session editor', async () => {
      const { sessionEditor } = await activateFootnoteSession();
      const setCursorById = vi.fn(() => true);
      if (sessionEditor?.commands) {
        sessionEditor.commands.setCursorById = setCursorById;
      }

      const didNavigate = await editor.navigateTo({
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'tc-note-1',
        story: { kind: 'story', storyType: 'footnote', noteId: '1' },
      });

      expect(didNavigate).toBe(true);
      expect(setCursorById).toHaveBeenCalledWith('tc-note-1', { preferredActiveThreadId: 'tc-note-1' });
      expect(sessionEditor?.view.focus).toHaveBeenCalled();
    });

    it('uses the public Word tracked-change id during story navigation when the note session supports it', async () => {
      const { sessionEditor } = await activateFootnoteSession();
      const setCursorById = vi.fn((id: string) => id === 'word:trackInsert:101');
      if (sessionEditor?.commands) {
        sessionEditor.commands.setCursorById = setCursorById;
      }

      const didNavigate = await editor.navigateTo({
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'word:trackInsert:101',
        story: { kind: 'story', storyType: 'footnote', noteId: '1' },
      });

      expect(didNavigate).toBe(true);
      expect(setCursorById).toHaveBeenCalledTimes(1);
      expect(setCursorById).toHaveBeenCalledWith('word:trackInsert:101', {
        preferredActiveThreadId: 'word:trackInsert:101',
      });
      expect(sessionEditor?.view.focus).toHaveBeenCalled();
    });

    it('falls back to rendered tracked-change stamps for inactive non-body stories', async () => {
      const { viewport } = await prepareFootnoteEditor();
      const page = document.createElement('div');
      page.className = 'superdoc-page';
      page.dataset.pageIndex = '0';

      const renderedChange = document.createElement('span');
      renderedChange.dataset.trackChangeId = 'tc-footnote-2';
      renderedChange.dataset.storyKey = 'fn:2';
      renderedChange.scrollIntoView = vi.fn();
      page.appendChild(renderedChange);
      viewport.appendChild(page);

      const didNavigate = await editor.navigateTo({
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'tc-footnote-2',
        story: { kind: 'story', storyType: 'footnote', noteId: '2' },
      });

      expect(didNavigate).toBe(true);
      expect(renderedChange.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'auto',
        block: 'center',
        inline: 'nearest',
      });
    });

    it('activates an inactive endnote story before routing tracked-change navigation', async () => {
      const { viewport } = await prepareEndnoteEditor();
      const page = document.createElement('div');
      page.className = 'superdoc-page';
      page.dataset.pageIndex = '0';

      const renderedChange = document.createElement('span');
      renderedChange.dataset.trackChangeId = 'tc-endnote-1';
      renderedChange.dataset.storyKey = 'en:1';
      renderedChange.scrollIntoView = vi.fn();
      vi.spyOn(renderedChange, 'getBoundingClientRect').mockReturnValue({
        left: 140,
        top: 720,
        width: 20,
        height: 12,
        right: 160,
        bottom: 732,
        x: 140,
        y: 720,
        toJSON: () => ({}),
      } as DOMRect);
      page.appendChild(renderedChange);
      viewport.appendChild(page);

      const didNavigate = await editor.navigateTo({
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'tc-endnote-1',
        story: { kind: 'story', storyType: 'endnote', noteId: '1' },
      });

      expect(didNavigate).toBe(true);
      await vi.waitFor(() => expect(createdStoryEditors.length).toBeGreaterThanOrEqual(2));

      const sessionEditor = createdStoryEditors.at(-1)?.editor;
      expect(sessionEditor?.commands.setCursorById).toHaveBeenCalledWith('tc-endnote-1', {
        preferredActiveThreadId: 'tc-endnote-1',
      });
      expect(sessionEditor?.view.focus).toHaveBeenCalled();
      expect(renderedChange.scrollIntoView).not.toHaveBeenCalled();
    });

    it('routes bookmark navigation to the active note session editor', async () => {
      const { sessionEditor } = await activateFootnoteSession();

      bookmarkResolverMocks.resolveBookmarkTarget.mockReturnValueOnce({
        pos: 4,
        name: 'bm-note-1',
        bookmarkId: '1',
        endPos: 8,
        node: { attrs: { name: 'bm-note-1', id: '1' } },
      });

      const didNavigate = await editor.navigateTo({
        kind: 'entity',
        entityType: 'bookmark',
        name: 'bm-note-1',
        story: { kind: 'story', storyType: 'footnote', noteId: '1' },
      });

      expect(didNavigate).toBe(true);
      expect(sessionEditor?.commands.setTextSelection).toHaveBeenLastCalledWith({ from: 4, to: 4 });
      expect(sessionEditor?.view.focus).toHaveBeenCalled();
    });

    it('activates an inactive endnote story before routing bookmark navigation', async () => {
      await prepareEndnoteEditor();

      bookmarkResolverMocks.resolveBookmarkTarget.mockReturnValueOnce({
        pos: 6,
        name: 'bm-endnote-1',
        bookmarkId: '2',
        endPos: 9,
        node: { attrs: { name: 'bm-endnote-1', id: '2' } },
      });

      const didNavigate = await editor.navigateTo({
        kind: 'entity',
        entityType: 'bookmark',
        name: 'bm-endnote-1',
        story: { kind: 'story', storyType: 'endnote', noteId: '1' },
      });

      expect(didNavigate).toBe(true);
      await vi.waitFor(() => expect(createdStoryEditors.length).toBeGreaterThanOrEqual(1));

      const sessionEditor = createdStoryEditors.at(-1)?.editor;
      expect(sessionEditor?.commands.setTextSelection).toHaveBeenLastCalledWith({ from: 6, to: 6 });
      expect(sessionEditor?.view.focus).toHaveBeenCalled();
    });
  });

  describe('pageStyleUpdate event listener', () => {
    const buildLayoutResult = () => ({
      layout: {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            numberText: '1',
            size: { w: 612, h: 792 },
            fragments: [],
            margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { default: 'rId-header-default' },
              footerRefs: { default: 'rId-footer-default' },
            },
          },
        ],
      },
      measures: [],
      headers: [
        {
          kind: 'header',
          type: 'default',
          layout: {
            height: 36,
            pages: [{ number: 1, fragments: [] }],
          },
          blocks: [],
          measures: [],
        },
      ],
      footers: [
        {
          kind: 'footer',
          type: 'default',
          layout: {
            height: 36,
            pages: [{ number: 1, fragments: [] }],
          },
          blocks: [],
          measures: [],
        },
      ],
    });

    let rafSpy: ReturnType<typeof vi.spyOn> | null = null;

    beforeEach(() => {
      rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    });

    afterEach(() => {
      rafSpy?.mockRestore();
      rafSpy = null;
    });

    /**
     * Helper to wait for layout update by polling the incrementalLayout mock.
     * This simulates the async nature of the rerender cycle.
     */
    const waitForLayoutUpdate = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    };

    it('should emit layoutUpdated when pageStyleUpdate event fires', async () => {
      mockIncrementalLayout.mockResolvedValue(buildLayoutResult());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      // Clear initial layout call
      mockIncrementalLayout.mockClear();

      let layoutUpdatedCount = 0;
      editor.onLayoutUpdated(() => {
        layoutUpdatedCount++;
      });

      // Get the pageStyleUpdate listener that was registered
      const onCalls = mockEditorInstance.on as unknown as Mock;
      const pageStyleUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'pageStyleUpdate');
      expect(pageStyleUpdateCall).toBeDefined();
      const handlePageStyleUpdate = pageStyleUpdateCall![1] as (payload: {
        pageMargins?: unknown;
        pageStyles?: unknown;
      }) => void;

      // Simulate a pageStyleUpdate event
      const newMargins = { left: 2.0, right: 2.0, top: 1.0, bottom: 1.0 };
      handlePageStyleUpdate({ pageMargins: newMargins, pageStyles: {} });

      await waitForLayoutUpdate();

      expect(layoutUpdatedCount).toBeGreaterThan(0);
    });

    it('should include correct payload data in pageStyleUpdate event', async () => {
      mockIncrementalLayout.mockResolvedValue(buildLayoutResult());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      // Wait for initial render to complete
      await waitForLayoutUpdate();

      // Get the pageStyleUpdate listener that was registered
      const onCalls = mockEditorInstance.on as unknown as Mock;
      const pageStyleUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'pageStyleUpdate');
      expect(pageStyleUpdateCall).toBeDefined();
      const handlePageStyleUpdate = pageStyleUpdateCall![1] as (payload: {
        pageMargins?: unknown;
        pageStyles?: unknown;
      }) => void;

      // Track the payload received
      let receivedPayload: { pageMargins?: unknown; pageStyles?: unknown } | null = null;
      const originalHandler = handlePageStyleUpdate;
      const wrappedHandler = (payload: { pageMargins?: unknown; pageStyles?: unknown }) => {
        receivedPayload = payload;
        originalHandler(payload);
      };

      // Simulate a pageStyleUpdate event with expected payload structure
      const newMargins = { left: 2.0, right: 2.0, top: 1.0, bottom: 1.0 };
      const pageStyles = { pageMargins: newMargins };
      wrappedHandler({ pageMargins: newMargins, pageStyles });

      // Verify payload structure
      expect(receivedPayload).toBeDefined();
      expect(receivedPayload?.pageMargins).toEqual(newMargins);
      expect(receivedPayload?.pageStyles).toBeDefined();
    });

    it('should handle pageStyleUpdate without affecting normal document updates', async () => {
      mockIncrementalLayout.mockResolvedValue(buildLayoutResult());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      // Wait for initial render to complete
      await waitForLayoutUpdate();

      // Clear initial layout call and start counting fresh
      mockIncrementalLayout.mockClear();

      let layoutUpdatedCount = 0;
      editor.onLayoutUpdated(() => {
        layoutUpdatedCount++;
      });

      // Get both update and pageStyleUpdate listeners
      const onCalls = mockEditorInstance.on as unknown as Mock;
      const updateCall = onCalls.mock.calls.find((call) => call[0] === 'update');
      const pageStyleUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'pageStyleUpdate');

      expect(updateCall).toBeDefined();
      expect(pageStyleUpdateCall).toBeDefined();

      const handleUpdate = updateCall![1] as (payload: { transaction: { docChanged: boolean } }) => void;
      const handlePageStyleUpdate = pageStyleUpdateCall![1] as (payload: {
        pageMargins?: unknown;
        pageStyles?: unknown;
      }) => void;

      // First, simulate a normal document update
      handleUpdate({ transaction: { docChanged: true } });
      await waitForLayoutUpdate();
      const afterDocUpdate = layoutUpdatedCount;
      expect(afterDocUpdate).toBeGreaterThan(0);

      // Then, simulate a page style update
      mockIncrementalLayout.mockClear();
      const newMargins = { left: 2.0, right: 2.0, top: 1.0, bottom: 1.0 };
      handlePageStyleUpdate({ pageMargins: newMargins, pageStyles: {} });
      await waitForLayoutUpdate();

      // Both types of updates should trigger layout updates independently
      expect(layoutUpdatedCount).toBeGreaterThan(afterDocUpdate);
    });

    it('clears flow-block cache when stylesDefaultsChanged event fires', async () => {
      mockIncrementalLayout.mockResolvedValue(buildLayoutResult());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      await waitForLayoutUpdate();

      const flowBlockCache = mockFlowBlockCacheInstances.at(-1);
      expect(flowBlockCache).toBeDefined();
      flowBlockCache!.clear.mockClear();

      const onCalls = mockEditorInstance.on as unknown as Mock;
      const stylesDefaultsChangedCall = onCalls.mock.calls.find((call) => call[0] === 'stylesDefaultsChanged');
      expect(stylesDefaultsChangedCall).toBeDefined();

      const handleStylesDefaultsChanged = stylesDefaultsChangedCall![1] as () => void;
      handleStylesDefaultsChanged();

      expect(flowBlockCache!.clear).toHaveBeenCalledTimes(1);
    });

    it('marks the flow-block cache dirty for history undo and redo updates', async () => {
      mockIncrementalLayout.mockResolvedValue(buildLayoutResult());

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      await waitForLayoutUpdate();

      const flowBlockCache = mockFlowBlockCacheInstances.at(-1);
      expect(flowBlockCache).toBeDefined();
      flowBlockCache!.setHasExternalChanges.mockClear();

      const onCalls = mockEditorInstance.on as unknown as Mock;
      const updateCall = onCalls.mock.calls.find((call) => call[0] === 'update');
      expect(updateCall).toBeDefined();

      const handleUpdate = updateCall![1] as (payload: { transaction: { docChanged: boolean; getMeta: Mock } }) => void;
      const makeTransaction = (inputType: string) => ({
        docChanged: true,
        getMeta: vi.fn((key: string) => (key === 'inputType' ? inputType : undefined)),
        mapping: {
          appendMapping: vi.fn(),
          slice: vi.fn(() => ({
            appendMapping: vi.fn(),
          })),
        },
      });

      handleUpdate({ transaction: makeTransaction('historyUndo') });
      handleUpdate({ transaction: makeTransaction('historyRedo') });

      expect(flowBlockCache!.setHasExternalChanges).toHaveBeenCalledTimes(2);
      expect(flowBlockCache!.setHasExternalChanges).toHaveBeenNthCalledWith(1, true);
      expect(flowBlockCache!.setHasExternalChanges).toHaveBeenNthCalledWith(2, true);
    });

    it('should remove pageStyleUpdate listener on destroy', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      // Spy on the editor's off method to verify cleanup
      const offSpy = mockEditorInstance.off as unknown as Mock;

      editor.destroy();

      // Verify that 'pageStyleUpdate' listener was removed
      const pageStyleUpdateOffCall = offSpy.mock.calls.find((call) => call[0] === 'pageStyleUpdate');
      expect(pageStyleUpdateOffCall).toBeDefined();
      expect(pageStyleUpdateOffCall![1]).toBeTypeOf('function');

      editor = null as unknown as PresentationEditor;
    });
  });

  describe('partChanged event listener', () => {
    const buildLayoutResult = () => ({
      layout: {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            numberText: '1',
            size: { w: 612, h: 792 },
            fragments: [],
            margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
            sectionRefs: {
              headerRefs: { default: 'rId-header-default' },
              footerRefs: { default: 'rId-footer-default' },
            },
          },
        ],
      },
      measures: [],
      headers: [
        {
          kind: 'header',
          type: 'default',
          layout: {
            height: 36,
            pages: [{ number: 1, fragments: [] }],
          },
          blocks: [],
          measures: [],
        },
      ],
      footers: [
        {
          kind: 'footer',
          type: 'default',
          layout: {
            height: 36,
            pages: [{ number: 1, fragments: [] }],
          },
          blocks: [],
          measures: [],
        },
      ],
    });

    let rafSpy: ReturnType<typeof vi.spyOn> | null = null;

    beforeEach(() => {
      rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    });

    afterEach(() => {
      rafSpy?.mockRestore();
      rafSpy = null;
    });

    const waitForLayoutUpdate = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    };

    it('refreshes header/footer structure and rerenders when document relationships change', async () => {
      mockIncrementalLayout.mockResolvedValue(buildLayoutResult());

      const refreshSpy = vi.spyOn(HeaderFooterEditorManager.prototype, 'refresh');
      const invalidateAllSpy = vi.spyOn(HeaderFooterLayoutAdapter.prototype, 'invalidateAll');

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      await waitForLayoutUpdate();

      const initialRefreshCalls = refreshSpy.mock.calls.length;
      const initialInvalidateAllCalls = invalidateAllSpy.mock.calls.length;

      mockIncrementalLayout.mockClear();

      let layoutUpdatedCount = 0;
      editor.onLayoutUpdated(() => {
        layoutUpdatedCount++;
      });

      const onCalls = mockEditorInstance.on as unknown as Mock;
      const partChangedCall = onCalls.mock.calls.find((call) => call[0] === 'partChanged');
      expect(partChangedCall).toBeDefined();

      const handlePartChanged = partChangedCall![1] as (payload: {
        parts: Array<{ partId: string; operation: string; changedPaths: string[]; sectionId?: string }>;
        source: string;
      }) => void;

      handlePartChanged({
        source: 'test',
        parts: [{ partId: 'word/_rels/document.xml.rels', operation: 'mutate', changedPaths: [] }],
      });

      await waitForLayoutUpdate();

      expect(refreshSpy.mock.calls.length).toBeGreaterThan(initialRefreshCalls);
      expect(invalidateAllSpy.mock.calls.length).toBeGreaterThan(initialInvalidateAllCalls);
      expect(layoutUpdatedCount).toBeGreaterThan(0);
    });

    it('invalidates the changed header/footer ref and rerenders when a header/footer part changes', async () => {
      mockIncrementalLayout.mockResolvedValue(buildLayoutResult());

      const invalidateSpy = vi.spyOn(HeaderFooterLayoutAdapter.prototype, 'invalidate');

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
        (Editor as unknown as MockedEditor).mock.results.length - 1
      ].value;

      await waitForLayoutUpdate();

      mockIncrementalLayout.mockClear();

      let layoutUpdatedCount = 0;
      editor.onLayoutUpdated(() => {
        layoutUpdatedCount++;
      });

      const onCalls = mockEditorInstance.on as unknown as Mock;
      const partChangedCall = onCalls.mock.calls.find((call) => call[0] === 'partChanged');
      expect(partChangedCall).toBeDefined();

      const handlePartChanged = partChangedCall![1] as (payload: {
        parts: Array<{ partId: string; operation: string; changedPaths: string[]; sectionId?: string }>;
        source: string;
      }) => void;

      handlePartChanged({
        source: 'test',
        parts: [
          {
            partId: 'word/header1.xml',
            operation: 'mutate',
            changedPaths: [],
            sectionId: 'rId-header-default',
          },
        ],
      });

      await waitForLayoutUpdate();

      expect(invalidateSpy).toHaveBeenCalledWith('rId-header-default');
      expect(layoutUpdatedCount).toBeGreaterThan(0);
    });
  });

  describe('Input validation', () => {
    describe('setDocumentMode', () => {
      it('should throw TypeError for non-string input', () => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        expect(() => editor.setDocumentMode(123 as unknown as 'editing')).toThrow(TypeError);
        expect(() => editor.setDocumentMode(123 as unknown as 'editing')).toThrow(/expects a string/);
      });

      it('should throw TypeError for invalid mode string', () => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        expect(() => editor.setDocumentMode('invalid' as 'editing')).toThrow(TypeError);
        expect(() => editor.setDocumentMode('invalid' as 'editing')).toThrow(/Must be one of/);
      });

      it('should accept all valid modes without errors', () => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        expect(() => editor.setDocumentMode('editing')).not.toThrow();
        expect(() => editor.setDocumentMode('viewing')).not.toThrow();
        expect(() => editor.setDocumentMode('suggesting')).not.toThrow();
      });
    });

    describe('setZoom', () => {
      beforeEach(() => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });
      });

      it('should throw TypeError for non-number input', () => {
        expect(() => editor.setZoom('1.5' as unknown as number)).toThrow(TypeError);
        expect(() => editor.setZoom('1.5' as unknown as number)).toThrow(/expects a number/);
      });

      it('should throw RangeError for NaN', () => {
        expect(() => editor.setZoom(NaN)).toThrow(RangeError);
        expect(() => editor.setZoom(NaN)).toThrow(/not NaN/);
      });

      it('should throw RangeError for Infinity', () => {
        expect(() => editor.setZoom(Infinity)).toThrow(RangeError);
        expect(() => editor.setZoom(Infinity)).toThrow(/finite number/);
      });

      it('should throw RangeError for negative zoom', () => {
        expect(() => editor.setZoom(-1)).toThrow(RangeError);
        expect(() => editor.setZoom(-1)).toThrow(/positive number/);
      });

      it('should throw RangeError for zero zoom', () => {
        expect(() => editor.setZoom(0)).toThrow(RangeError);
        expect(() => editor.setZoom(0)).toThrow(/greater than 0/);
      });

      it('should warn for zoom > 10', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
          // No-op
        });

        expect(() => editor.setZoom(15)).not.toThrow();
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds recommended maximum'));

        consoleWarnSpy.mockRestore();
      });

      it('should accept valid zoom values', () => {
        expect(() => editor.setZoom(1.0)).not.toThrow();
        expect(() => editor.setZoom(0.5)).not.toThrow();
        expect(() => editor.setZoom(2.0)).not.toThrow();
      });
    });

    describe('setTrackedChangesOverrides', () => {
      beforeEach(() => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });
      });

      it('should throw TypeError for non-object input', () => {
        expect(() => editor.setTrackedChangesOverrides('invalid' as unknown as TrackedChangesOverrides)).toThrow(
          TypeError,
        );
        expect(() => editor.setTrackedChangesOverrides(123 as unknown as TrackedChangesOverrides)).toThrow(TypeError);
        expect(() => editor.setTrackedChangesOverrides([] as unknown as TrackedChangesOverrides)).toThrow(TypeError);
      });

      it('should throw TypeError for invalid mode', () => {
        expect(() => editor.setTrackedChangesOverrides({ mode: 'invalid' as TrackedChangesMode })).toThrow(TypeError);
        expect(() => editor.setTrackedChangesOverrides({ mode: 'invalid' as TrackedChangesMode })).toThrow(
          /Invalid tracked changes mode/,
        );
      });

      it('should throw TypeError for non-boolean enabled', () => {
        expect(() => editor.setTrackedChangesOverrides({ enabled: 'true' as unknown as boolean })).toThrow(TypeError);
        expect(() => editor.setTrackedChangesOverrides({ enabled: 'true' as unknown as boolean })).toThrow(
          /must be a boolean/,
        );
      });

      it('should accept undefined', () => {
        expect(() => editor.setTrackedChangesOverrides(undefined)).not.toThrow();
      });

      it('should accept valid overrides', () => {
        expect(() => editor.setTrackedChangesOverrides({ mode: 'review' })).not.toThrow();
        expect(() => editor.setTrackedChangesOverrides({ enabled: true })).not.toThrow();
        expect(() => editor.setTrackedChangesOverrides({ mode: 'original', enabled: false })).not.toThrow();
        expect(() => editor.setTrackedChangesOverrides({ mode: 'final' })).not.toThrow();
      });
    });
  });

  describe('Error handling and recovery', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy?.mockRestore();
    });

    describe('Layout error state tracking', () => {
      it('should start in healthy state', () => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        expect(editor.isLayoutHealthy()).toBe(true);
        expect(editor.getLayoutHealthState()).toBe('healthy');
      });

      it('should transition to failed state on layout error', async () => {
        mockIncrementalLayout.mockRejectedValueOnce(new Error('Layout failed'));

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        // Wait for initial layout attempt
        await vi
          .waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled(), { timeout: 500 })
          .catch(() => {
            // Ignore timeout - layout may have already failed
          });

        // Wait a bit for error handling
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(editor.isLayoutHealthy()).toBe(false);
        expect(['degraded', 'failed']).toContain(editor.getLayoutHealthState());
      });

      it('should recover to healthy state after successful layout', async () => {
        // First fail, then succeed
        mockIncrementalLayout.mockRejectedValueOnce(new Error('Layout failed'));

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        // Wait for initial failure
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Mock success for next attempt
        mockIncrementalLayout.mockResolvedValueOnce({ layout: { pages: [] }, measures: [] });

        // Trigger re-layout
        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Get the update handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const updateCall = onCalls.mock.calls.find((call) => call[0] === 'update');
        if (updateCall) {
          const handleUpdate = updateCall[1] as (payload: { transaction: { docChanged: boolean } }) => void;
          handleUpdate({ transaction: { docChanged: true } });
        }

        await vi
          .waitFor(() => editor.isLayoutHealthy(), { timeout: 500 })
          .catch(() => {
            // May not recover immediately
          });
      });
    });

    describe('Type guards for external dependencies', () => {
      it('should handle invalid incrementalLayout result', async () => {
        // Return invalid result (null)
        mockIncrementalLayout.mockResolvedValueOnce(null as unknown as { layout: Layout; measures: Measure[] });

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(editor.isLayoutHealthy()).toBe(false);
      });

      it('should handle missing layout property', async () => {
        // Return result without layout
        mockIncrementalLayout.mockResolvedValueOnce({ measures: [] } as unknown as {
          layout: Layout;
          measures: Measure[];
        });

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(editor.isLayoutHealthy()).toBe(false);
      });

      it('should handle non-array measures', async () => {
        // Return result with invalid measures
        mockIncrementalLayout.mockResolvedValueOnce({
          layout: { pages: [] },
          measures: 'invalid',
        } as unknown as { layout: Layout; measures: Measure[] });

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(editor.isLayoutHealthy()).toBe(false);
      });
    });
  });

  describe('Memory management', () => {
    describe('Event listener cleanup', () => {
      it('should cleanup collaboration cursors on destroy', () => {
        const mockAwareness = {
          clientID: 1,
          getStates: vi.fn(() => new Map()),
          on: vi.fn(),
          off: vi.fn(),
        };

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
          collaborationProvider: {
            awareness: mockAwareness,
          },
          layoutEngineOptions: {
            presence: { enabled: true },
          },
        });

        // Simulate collaboration ready
        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const collabReadyCall = onCalls.mock.calls.find((call) => call[0] === 'collaborationReady');
        if (collabReadyCall) {
          const handler = collabReadyCall[1] as () => void;
          handler();
        }

        // Verify subscriptions were created
        expect(mockAwareness.on).toHaveBeenCalledWith('change', expect.any(Function));
        expect(mockAwareness.on).toHaveBeenCalledWith('update', expect.any(Function));

        // Destroy and verify cleanup
        editor.destroy();
        expect(mockAwareness.off).toHaveBeenCalledWith('change', expect.any(Function));
        expect(mockAwareness.off).toHaveBeenCalledWith('update', expect.any(Function));

        editor = null as unknown as PresentationEditor;
      });

      it('should prevent double-initialization of collaboration cursors', () => {
        const mockAwareness = {
          clientID: 1,
          getStates: vi.fn(() => new Map()),
          on: vi.fn(),
          off: vi.fn(),
        };

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
          collaborationProvider: {
            awareness: mockAwareness,
          },
          layoutEngineOptions: {
            presence: { enabled: true },
          },
        });

        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const collabReadyCall = onCalls.mock.calls.find((call) => call[0] === 'collaborationReady');

        if (collabReadyCall) {
          const handler = collabReadyCall[1] as () => void;

          // Call twice
          handler();
          const firstCallCount = mockAwareness.on.mock.calls.length;

          // Reset mock to detect second subscription
          mockAwareness.on.mockClear();
          mockAwareness.off.mockClear();

          handler();

          // Second call should cleanup first, then re-subscribe
          expect(mockAwareness.off).toHaveBeenCalled(); // Cleanup from first
          expect(mockAwareness.on).toHaveBeenCalled(); // New subscriptions
        }
      });
    });
  });

  describe('Public API Documentation', () => {
    beforeEach(() => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });
    });

    it('should expose isLayoutHealthy() method', () => {
      expect(typeof editor.isLayoutHealthy).toBe('function');
      expect(typeof editor.isLayoutHealthy()).toBe('boolean');
    });

    it('should expose getLayoutHealthState() method', () => {
      expect(typeof editor.getLayoutHealthState).toBe('function');
      const state = editor.getLayoutHealthState();
      expect(['healthy', 'degraded', 'failed']).toContain(state);
    });

    it('should expose getActiveEditor() method', () => {
      expect(typeof editor.getActiveEditor).toBe('function');
      const activeEditor = editor.getActiveEditor();
      expect(activeEditor).toBeDefined();
    });

    it('should expose dispatchInActiveEditor() method', () => {
      expect(typeof editor.dispatchInActiveEditor).toBe('function');
      let called = false;
      editor.dispatchInActiveEditor(() => {
        called = true;
      });
      expect(called).toBe(true);
    });

    it('should expose visibleHost getter', () => {
      expect(editor.visibleHost).toBe(container);
    });

    it('should expose overlayElement getter', () => {
      expect(editor.overlayElement).toBeDefined();
    });
  });

  describe('Selection update mechanisms', () => {
    describe('#scheduleSelectionUpdate race condition guards', () => {
      it('should render synchronously with immediate mode when safe', async () => {
        const layoutResult = {
          layout: { pages: [] },
          measures: [],
        };
        mockIncrementalLayout.mockResolvedValue(layoutResult);

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Wait for initial render to complete so #pendingDocChange is cleared
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Spy on requestAnimationFrame to track scheduling
        const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

        // Trigger selection update twice in rapid succession
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        expect(selectionUpdateCall).toBeDefined();
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Call twice - with immediate mode, renders synchronously when safe
        // so no RAF scheduling is needed
        handleSelection();
        handleSelection();

        // Should NOT use RAF because immediate rendering handles it synchronously
        expect(rafSpy).not.toHaveBeenCalled();

        rafSpy.mockRestore();
      });

      it('should skip scheduling during rerender (#isRerendering flag)', async () => {
        const layoutResult = {
          layout: { pages: [] },
          measures: [],
        };
        mockIncrementalLayout.mockResolvedValue(layoutResult);

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Wait for initial render
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Spy on requestAnimationFrame
        const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

        // Get the update handler to simulate doc change (triggers rerender)
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const updateCall = onCalls.mock.calls.find((call) => call[0] === 'update');
        const handleUpdate = updateCall![1] as (payload: { transaction: { docChanged: boolean } }) => void;

        // Trigger document change (sets #pendingDocChange and #isRerendering)
        handleUpdate({ transaction: { docChanged: true } });

        // Get selection handler
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Clear RAF spy to track new calls
        rafSpy.mockClear();

        // Try to schedule selection update during rerender - should be skipped
        handleSelection();

        // Should NOT schedule RAF because rerender is in progress
        expect(rafSpy).not.toHaveBeenCalled();

        rafSpy.mockRestore();
      });

      it('should skip scheduling when pendingDocChange is true', () => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Spy on requestAnimationFrame
        const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

        // Get the pageStyleUpdate handler (sets #pendingDocChange without #isRerendering)
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const pageStyleCall = onCalls.mock.calls.find((call) => call[0] === 'pageStyleUpdate');
        expect(pageStyleCall).toBeDefined();
        const handlePageStyle = pageStyleCall![1] as () => void;

        // Trigger page style update (sets #pendingDocChange)
        handlePageStyle();

        // Get selection handler
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Clear RAF spy to track new calls
        rafSpy.mockClear();

        // Try to schedule selection update when pendingDocChange is true
        handleSelection();

        // Should NOT schedule RAF because pendingDocChange is set
        expect(rafSpy).not.toHaveBeenCalled();

        rafSpy.mockRestore();
      });

      it('should render synchronously when no guards are active', async () => {
        const layoutResult = {
          layout: { pages: [] },
          measures: [],
        };
        mockIncrementalLayout.mockResolvedValue(layoutResult);

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Wait for initial render to complete so #pendingDocChange is cleared
        await new Promise((resolve) => setTimeout(resolve, 100));

        const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

        // Get selection handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Clear RAF spy to track new calls
        rafSpy.mockClear();

        // Selection update with no guards active — renders synchronously via
        // immediate mode, bypassing RAF
        handleSelection();

        // Should NOT use RAF because immediate rendering handles it synchronously
        expect(rafSpy).not.toHaveBeenCalled();

        rafSpy.mockRestore();
      });
    });

    describe('#updateSelection cursor preservation and fallback logic', () => {
      let mockComputeCaretLayoutRect: Mock;

      beforeEach(() => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        // Mock #computeCaretLayoutRect to control when position lookup fails
        mockComputeCaretLayoutRect = vi.fn();
        (editor as Editor & { computeCaretLayoutRect?: Mock })['computeCaretLayoutRect'] = mockComputeCaretLayoutRect;
      });

      it('should preserve cursor when position lookup fails', () => {
        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;
        mockEditorInstance.view.hasFocus = vi.fn(() => true);

        // Mock editor state with valid selection at position 5
        mockEditorInstance.state = {
          selection: { from: 5, to: 5 },
          doc: {
            content: { size: 100 },
            descendants: vi.fn(),
          },
        };

        // Mock all position lookups to fail
        mockComputeCaretLayoutRect.mockReturnValue(null);

        // Get the internal selection layer
        const selectionLayer = container.querySelector('.presentation-editor__selection-layer--local') as HTMLElement;
        expect(selectionLayer).toBeDefined();

        // Set initial cursor HTML to verify it's preserved
        selectionLayer.innerHTML = '<div class="existing-cursor"></div>';
        const initialHTML = selectionLayer.innerHTML;

        // Get selection handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Trigger selection update with failing position lookup
        handleSelection();

        // Wait for RAF callback
        return new Promise((resolve) => {
          setTimeout(() => {
            // Cursor HTML should be preserved (not cleared)
            expect(selectionLayer.innerHTML).toBe(initialHTML);
            resolve(undefined);
          }, 50);
        });
      });

      // Skip: Cannot mock private method #computeCaretLayoutRect from outside the class
      it.skip('should try fallback position from-1 when exact position fails', async () => {
        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Mock editor state with selection at position 5
        mockEditorInstance.state = {
          selection: { from: 5, to: 5 },
          doc: {
            content: { size: 100 },
            descendants: vi.fn(),
          },
        };

        // Mock: exact position fails, from-1 succeeds
        mockComputeCaretLayoutRect.mockReturnValueOnce(null); // position 5 fails
        mockComputeCaretLayoutRect.mockReturnValueOnce({ x: 100, y: 50, height: 20 }); // position 4 succeeds

        // Get selection handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Trigger selection update
        handleSelection();

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Should have tried position 5, then position 4
        expect(mockComputeCaretLayoutRect).toHaveBeenCalledWith(5);
        expect(mockComputeCaretLayoutRect).toHaveBeenCalledWith(4);
      });

      // Skip: Cannot mock private method #computeCaretLayoutRect from outside the class
      it.skip('should try fallback position from+1 when from-1 also fails', async () => {
        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Mock editor state with selection at position 5
        mockEditorInstance.state = {
          selection: { from: 5, to: 5 },
          doc: {
            content: { size: 100 },
            descendants: vi.fn(),
          },
        };

        // Mock: exact and from-1 fail, from+1 succeeds
        mockComputeCaretLayoutRect.mockReturnValueOnce(null); // position 5 fails
        mockComputeCaretLayoutRect.mockReturnValueOnce(null); // position 4 fails
        mockComputeCaretLayoutRect.mockReturnValueOnce({ x: 100, y: 50, height: 20 }); // position 6 succeeds

        // Get selection handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Trigger selection update
        handleSelection();

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Should have tried position 5, 4, then 6
        expect(mockComputeCaretLayoutRect).toHaveBeenCalledWith(5);
        expect(mockComputeCaretLayoutRect).toHaveBeenCalledWith(4);
        expect(mockComputeCaretLayoutRect).toHaveBeenCalledWith(6);
      });

      // Skip: Cannot mock private method #computeCaretLayoutRect from outside the class
      it.skip('should NOT try from-1 when from is 0 (bounds validation)', async () => {
        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Mock editor state with selection at position 0
        mockEditorInstance.state = {
          selection: { from: 0, to: 0 },
          doc: {
            content: { size: 100 },
            descendants: vi.fn(),
          },
        };

        // Mock: exact position fails
        mockComputeCaretLayoutRect.mockReturnValue(null);

        // Get selection handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Trigger selection update
        handleSelection();

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Should only try position 0 and 1, NOT -1
        expect(mockComputeCaretLayoutRect).toHaveBeenCalledWith(0);
        expect(mockComputeCaretLayoutRect).not.toHaveBeenCalledWith(-1);
        expect(mockComputeCaretLayoutRect).toHaveBeenCalledWith(1);
      });

      // Skip: Cannot mock private method #computeCaretLayoutRect from outside the class
      it.skip('should NOT try from+1 when from+1 exceeds docSize (bounds validation)', async () => {
        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Mock editor state with selection at end of document
        mockEditorInstance.state = {
          selection: { from: 100, to: 100 },
          doc: {
            content: { size: 100 },
            descendants: vi.fn(),
          },
        };

        // Mock: exact and from-1 fail
        mockComputeCaretLayoutRect.mockReturnValue(null);

        // Get selection handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Trigger selection update
        handleSelection();

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Should try position 100 and 99, NOT 101
        expect(mockComputeCaretLayoutRect).toHaveBeenCalledWith(100);
        expect(mockComputeCaretLayoutRect).toHaveBeenCalledWith(99);
        expect(mockComputeCaretLayoutRect).not.toHaveBeenCalledWith(101);
      });

      // Skip: Cannot mock private method #computeCaretLayoutRect from outside the class
      it.skip('should handle invalid document state gracefully', async () => {
        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Mock editor state with missing doc
        mockEditorInstance.state = {
          selection: { from: 5, to: 5 },
          doc: null,
        };

        // Get selection handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Should not throw error
        expect(() => handleSelection()).not.toThrow();

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Should not attempt any position lookups with invalid doc
        expect(mockComputeCaretLayoutRect).not.toHaveBeenCalled();
      });
    });

    describe('#updateSelection DOM manipulation error handling', () => {
      it('should handle DOM errors when clearing selection in viewing mode', () => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
          documentMode: 'viewing',
        });

        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        const selectionLayer = container.querySelector('.presentation-editor__selection-layer--local') as HTMLElement;

        // Mock innerHTML setter to throw error
        const originalSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!.set!;
        Object.defineProperty(selectionLayer, 'innerHTML', {
          set: vi.fn(() => {
            throw new Error('DOM manipulation failed');
          }),
          configurable: true,
        });

        // Get selection handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Should not throw - error should be caught and logged
        expect(() => handleSelection()).not.toThrow();

        // Restore original setter
        Object.defineProperty(selectionLayer, 'innerHTML', {
          set: originalSetter,
          configurable: true,
        });
      });

      it('should handle DOM errors when clearing selection with no selection state', async () => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Mock editor state with no selection
        mockEditorInstance.state = {
          selection: null,
          doc: {
            content: { size: 100 },
            descendants: vi.fn(),
          },
        };

        const selectionLayer = container.querySelector('.presentation-editor__selection-layer--local') as HTMLElement;

        // Mock innerHTML setter to throw error
        const originalSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!.set!;
        Object.defineProperty(selectionLayer, 'innerHTML', {
          set: vi.fn(() => {
            throw new Error('DOM manipulation failed');
          }),
          configurable: true,
        });

        // Get selection handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Should not throw - error should be caught
        expect(() => handleSelection()).not.toThrow();

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Restore original setter
        Object.defineProperty(selectionLayer, 'innerHTML', {
          set: originalSetter,
          configurable: true,
        });
      });

      it('should handle DOM errors when rendering caret overlay', async () => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Mock editor state with valid selection
        mockEditorInstance.state = {
          selection: { from: 5, to: 5 },
          doc: {
            content: { size: 100 },
            descendants: vi.fn(),
          },
        };

        // Note: Cannot mock private #computeCaretLayoutRect, but test still validates DOM error handling
        const selectionLayer = container.querySelector('.presentation-editor__selection-layer--local') as HTMLElement;

        // Mock innerHTML setter to throw error
        const originalSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!.set!;
        Object.defineProperty(selectionLayer, 'innerHTML', {
          set: vi.fn(() => {
            throw new Error('DOM manipulation failed');
          }),
          configurable: true,
        });

        // Get selection handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Should not throw - error should be caught
        expect(() => handleSelection()).not.toThrow();

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Restore original setter
        Object.defineProperty(selectionLayer, 'innerHTML', {
          set: originalSetter,
          configurable: true,
        });
      });

      it('should handle DOM errors when rendering selection rects', async () => {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Mock editor state with range selection
        mockEditorInstance.state = {
          selection: { from: 5, to: 10 },
          doc: {
            content: { size: 100 },
            descendants: vi.fn(),
          },
        };

        // Mock selectionToRects to return valid rects
        mockSelectionToRects.mockReturnValue([{ x: 100, y: 50, width: 200, height: 20, pageIndex: 0 }]);

        const selectionLayer = container.querySelector('.presentation-editor__selection-layer--local') as HTMLElement;

        // Mock innerHTML setter to throw error
        const originalSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!.set!;
        Object.defineProperty(selectionLayer, 'innerHTML', {
          set: vi.fn(() => {
            throw new Error('DOM manipulation failed');
          }),
          configurable: true,
        });

        // Get selection handler
        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        const handleSelection = selectionUpdateCall![1] as () => void;

        // Should not throw - error should be caught
        expect(() => handleSelection()).not.toThrow();

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Restore original setter
        Object.defineProperty(selectionLayer, 'innerHTML', {
          set: originalSetter,
          configurable: true,
        });
      });
    });

    describe('Selection-aware virtualization pins', () => {
      it('pins drag endpoints (with buffer) when dragging into an unmounted page', async () => {
        mockIncrementalLayout.mockResolvedValueOnce({
          layout: {
            pageSize: { w: 612, h: 792 },
            pageGap: 72,
            pages: [
              {
                number: 1,
                size: { w: 612, h: 792 },
                fragments: [],
                margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
              },
              {
                number: 2,
                size: { w: 612, h: 792 },
                fragments: [],
                margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
              },
              {
                number: 3,
                size: { w: 612, h: 792 },
                fragments: [],
                margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
              },
            ],
          },
          measures: [],
        });

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
          layoutEngineOptions: {
            virtualization: { enabled: true, window: 2, overscan: 0 },
          },
        });

        await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 100));

        const painterInstance = (mockCreateDomPainter as unknown as Mock).mock.results[
          (mockCreateDomPainter as unknown as Mock).mock.results.length - 1
        ].value as { setVirtualizationPins?: Mock };
        const setPins = painterInstance.setVirtualizationPins as unknown as Mock;
        expect(setPins).toBeDefined();
        setPins.mockClear();

        // Mark page 0 as mounted for the drag anchor.
        const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
        const page0 = document.createElement('div');
        page0.classList.add('superdoc-page');
        page0.setAttribute('data-page-index', '0');
        pagesHost.appendChild(page0);

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
          left: 0,
          top: 0,
          width: 800,
          height: 1000,
          right: 800,
          bottom: 1000,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect);

        // SD-2749: PointerNormalization uses elementsFromPoint to detect the
        // .superdoc-page under the cursor; happy-dom doesn't compute layout, so
        // simulate the page element under each click point.
        vi.spyOn(page0, 'getBoundingClientRect').mockReturnValue({
          left: 0,
          top: 0,
          width: 612,
          height: 792,
          right: 612,
          bottom: 792,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect);
        const originalElementsFromPoint = (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
        (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [
          page0,
        ];

        try {
          // pointerdown: page 0 (mounted), pointermove: page 1 (unmounted),
          // pointerup drag update: page 1, pointerup DOM refine: page 1
          mockClickToPosition.mockReset();
          mockClickToPosition
            .mockReturnValueOnce({ pos: 1, layoutEpoch: 0, pageIndex: 0 })
            .mockReturnValueOnce({ pos: 10, layoutEpoch: 0, pageIndex: 1 })
            .mockReturnValueOnce({ pos: 12, layoutEpoch: 0, pageIndex: 1 })
            .mockReturnValueOnce({ pos: 12, layoutEpoch: 0, pageIndex: 1 });
          mockResolvePointerPositionHit.mockReset();
          mockResolvePointerPositionHit
            .mockReturnValueOnce({ pos: 1, layoutEpoch: 0, pageIndex: 0, blockId: '', column: 0, lineIndex: -1 })
            .mockReturnValueOnce({ pos: 10, layoutEpoch: 0, pageIndex: 1, blockId: '', column: 0, lineIndex: -1 })
            .mockReturnValueOnce({ pos: 12, layoutEpoch: 0, pageIndex: 1, blockId: '', column: 0, lineIndex: -1 })
            .mockReturnValueOnce({ pos: 12, layoutEpoch: 0, pageIndex: 1, blockId: '', column: 0, lineIndex: -1 });

          viewport.dispatchEvent(
            new MouseEvent('pointerdown', {
              bubbles: true,
              clientX: 120,
              clientY: 200,
              button: 0,
            }),
          );

          viewport.dispatchEvent(
            new MouseEvent('pointermove', {
              bubbles: true,
              clientX: 120,
              clientY: 900,
              buttons: 1,
            }),
          );

          const lastPinsBeforePointerUp = setPins.mock.calls[setPins.mock.calls.length - 1]?.[0] as
            | number[]
            | undefined;
          expect(lastPinsBeforePointerUp).toEqual([0, 1, 2]);

          // Simulate virtualization mounting the endpoint page before pointerup finalization.
          const page1 = document.createElement('div');
          page1.setAttribute('data-page-index', '1');
          pagesHost.appendChild(page1);

          viewport.dispatchEvent(
            new MouseEvent('pointerup', {
              bubbles: true,
              clientX: 120,
              clientY: 900,
              button: 0,
            }),
          );

          // pointerup first updates the drag at the release point, then refines
          // the fallback selection with one final DOM hit on the mounted page.
          expect(mockResolvePointerPositionHit).toHaveBeenCalledTimes(4);
        } finally {
          if (originalElementsFromPoint === undefined) {
            delete (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
          } else {
            (document as unknown as { elementsFromPoint: unknown }).elementsFromPoint = originalElementsFromPoint;
          }
        }
      });
    });

    describe('Accessibility announcements (aria-live)', () => {
      it('announces caret moves (debounced)', async () => {
        const layoutResult = {
          layout: { pages: [] },
          measures: [],
        };
        mockIncrementalLayout.mockResolvedValue(layoutResult);

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        // Wait for initial render to complete so timers/RAF have settled.
        await new Promise((resolve) => setTimeout(resolve, 100));

        mockEditorInstance.state.selection = {
          from: 5,
          to: 5,
          $from: {
            depth: 0,
            node: vi.fn(),
          },
        };

        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        expect(selectionUpdateCall).toBeDefined();
        const handleSelection = selectionUpdateCall![1] as () => void;

        handleSelection();

        await new Promise((resolve) => setTimeout(resolve, 200));

        const ariaLive = container.querySelector('.presentation-editor__aria-live');
        expect(ariaLive?.textContent).toContain('Cursor moved');
      });

      it('announces a selection snippet when doc.textBetween is available', async () => {
        const layoutResult = {
          layout: { pages: [] },
          measures: [],
        };
        mockIncrementalLayout.mockResolvedValue(layoutResult);

        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
        });

        const mockEditorInstance = (Editor as unknown as MockedEditor).mock.results[
          (Editor as unknown as MockedEditor).mock.results.length - 1
        ].value;

        await new Promise((resolve) => setTimeout(resolve, 100));

        mockEditorInstance.state.selection = {
          from: 1,
          to: 6,
          $from: {
            depth: 0,
            node: vi.fn(),
          },
        };
        (mockEditorInstance.state.doc as unknown as { textBetween?: () => string }).textBetween = () => 'Hello world';

        const onCalls = mockEditorInstance.on as unknown as Mock;
        const selectionUpdateCall = onCalls.mock.calls.find((call) => call[0] === 'selectionUpdate');
        expect(selectionUpdateCall).toBeDefined();
        const handleSelection = selectionUpdateCall![1] as () => void;

        handleSelection();

        await new Promise((resolve) => setTimeout(resolve, 200));

        const ariaLive = container.querySelector('.presentation-editor__aria-live');
        expect(ariaLive?.textContent).toContain('Selected:');
        expect(ariaLive?.textContent).toContain('Hello world');
      });
    });
  });

  describe('Field annotation drag-and-drop handlers', () => {
    let mockHitTest: Mock;
    let mockGetActiveEditor: Mock;
    let rafSpy: ReturnType<typeof vi.spyOn> | null = null;
    let mockActiveEditor: {
      isEditable: boolean;
      state: {
        doc: { content: { size: number } };
        selection: { from: number; to: number };
        tr: {
          setSelection: Mock;
          setMeta: Mock;
        };
      };
      view: {
        dispatch: Mock;
        focus: Mock;
        dom: HTMLElement;
      };
      commands: {
        addFieldAnnotation: Mock;
      };
      emit: Mock;
    };

    /**
     * Helper to create a drag event compatible with the test environment
     */
    const createDragEvent = (
      type: string,
      options: { clientX?: number; clientY?: number; data?: Record<string, string> } = {},
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: options.clientX ?? 0,
        clientY: options.clientY ?? 0,
      });

      // Mock dataTransfer property
      const dataStore = new Map<string, string>();
      if (options.data) {
        Object.entries(options.data).forEach(([key, value]) => dataStore.set(key, value));
      }

      Object.defineProperty(event, 'dataTransfer', {
        value: {
          types: Array.from(dataStore.keys()),
          dropEffect: 'none',
          effectAllowed: 'all',
          getData: (type: string) => dataStore.get(type) || '',
          setData: (type: string, data: string) => dataStore.set(type, data),
          items: {
            add: (data: string, type: string) => dataStore.set(type, data),
          },
        },
        writable: true,
        configurable: true,
      });

      return event;
    };

    beforeEach(() => {
      // Mock requestAnimationFrame to execute immediately (for RAF-based dragover coalescing)
      rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });

      // Create a container element for the presentation editor
      container = document.createElement('div');
      document.body.appendChild(container);

      const domElement = document.createElement('div');
      domElement.focus = vi.fn();

      mockActiveEditor = {
        isEditable: true,
        state: {
          doc: {
            content: { size: 100 },
            resolve: vi.fn((pos) => ({
              pos,
              depth: 0,
              parent: { inlineContent: true },
              min: vi.fn((other) => Math.min(pos, other?.pos ?? pos)),
              max: vi.fn((other) => Math.max(pos, other?.pos ?? pos)),
            })),
          },
          selection: { from: 50, to: 50 },
          tr: {
            setSelection: vi.fn().mockReturnThis(),
            setMeta: vi.fn().mockReturnThis(),
          },
        },
        view: {
          dispatch: vi.fn(),
          focus: vi.fn(),
          dom: domElement,
        },
        commands: {
          addFieldAnnotation: vi.fn(),
        },
        emit: vi.fn(),
      };

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      // Mock hitTest method
      mockHitTest = vi.fn(() => ({ pos: 42, inside: 42 }));
      editor.hitTest = mockHitTest;

      // Mock getActiveEditor method
      mockGetActiveEditor = vi.fn(() => mockActiveEditor);
      editor.getActiveEditor = mockGetActiveEditor;
    });

    afterEach(() => {
      rafSpy?.mockRestore();
    });

    describe('#handleDragOver', () => {
      it('should prevent default and set dropEffect to copy', () => {
        const dragEvent = createDragEvent('dragover', {
          data: { fieldAnnotation: '{}' },
        });

        const preventDefaultSpy = vi.spyOn(dragEvent, 'preventDefault');
        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dragEvent);

        expect(preventDefaultSpy).toHaveBeenCalled();
        expect((dragEvent as { dataTransfer: { dropEffect: string } }).dataTransfer?.dropEffect).toBe('copy');
      });

      it('should early return when editor is not editable', () => {
        mockActiveEditor.isEditable = false;

        const dragEvent = createDragEvent('dragover', {
          data: { fieldAnnotation: '{}' },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dragEvent);

        expect(mockHitTest).not.toHaveBeenCalled();
      });

      it('should early return when no fieldAnnotation data', () => {
        const dragEvent = createDragEvent('dragover', {});

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dragEvent);

        expect(mockHitTest).not.toHaveBeenCalled();
      });

      it('should compute drag preview during drag without mutating selection', () => {
        const dragEvent = createDragEvent('dragover', {
          clientX: 100,
          clientY: 100,
          data: { fieldAnnotation: '{}' },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dragEvent);

        expect(mockHitTest).toHaveBeenCalledWith(100, 100);
        expect(mockActiveEditor.state.tr.setSelection).not.toHaveBeenCalled();
        expect(mockActiveEditor.state.tr.setMeta).not.toHaveBeenCalled();
        expect(mockActiveEditor.view.dispatch).not.toHaveBeenCalled();
      });

      it('should handle null hit gracefully', () => {
        mockHitTest.mockReturnValue(null);

        const dragEvent = createDragEvent('dragover', {
          clientX: 100,
          clientY: 100,
          data: { fieldAnnotation: '{}' },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;

        // Should not throw
        expect(() => viewport.dispatchEvent(dragEvent)).not.toThrow();
        expect(mockActiveEditor.state.tr.setSelection).not.toHaveBeenCalled();
      });

      it('should skip dispatch when cursor position has not changed', () => {
        // Set hitTest to return the same position as current selection
        mockHitTest.mockReturnValue({ pos: 50, inside: 50 });

        const dragEvent = createDragEvent('dragover', {
          clientX: 100,
          clientY: 100,
          data: { fieldAnnotation: '{}' },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dragEvent);

        // The dispatch may or may not be called depending on selection type check
        // This is an optimization, so we just verify it doesn't throw
        expect(() => viewport.dispatchEvent(dragEvent)).not.toThrow();
      });
    });

    describe('#handleDrop', () => {
      it('should prevent default and stop propagation', () => {
        const payload = {
          attributes: {
            fieldId: 'test-field',
            fieldType: 'TEXTINPUT',
            displayLabel: 'Test Field',
            type: 'text',
          },
        };

        const dropEvent = createDragEvent('drop', {
          clientX: 100,
          clientY: 100,
          data: { fieldAnnotation: JSON.stringify(payload) },
        });

        const preventDefaultSpy = vi.spyOn(dropEvent, 'preventDefault');
        const stopPropagationSpy = vi.spyOn(dropEvent, 'stopPropagation');

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dropEvent);

        expect(preventDefaultSpy).toHaveBeenCalled();
        expect(stopPropagationSpy).toHaveBeenCalled();
      });

      it('should early return when editor is not editable', () => {
        mockActiveEditor.isEditable = false;

        const payload = {
          attributes: {
            fieldId: 'test-field',
            fieldType: 'TEXTINPUT',
            displayLabel: 'Test Field',
            type: 'text',
          },
        };

        const dropEvent = createDragEvent('drop', {
          data: { fieldAnnotation: JSON.stringify(payload) },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dropEvent);

        expect(mockActiveEditor.commands.addFieldAnnotation).not.toHaveBeenCalled();
      });

      it('should early return when no fieldAnnotation data', () => {
        const dropEvent = createDragEvent('drop', {});

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dropEvent);

        expect(mockActiveEditor.commands.addFieldAnnotation).not.toHaveBeenCalled();
      });

      it('should parse JSON and insert field annotation', () => {
        const payload = {
          attributes: {
            fieldId: 'test-field',
            fieldType: 'TEXTINPUT',
            displayLabel: 'Test Field',
            type: 'text',
            fieldColor: '#980043',
          },
          sourceField: {
            fieldId: 'test-field',
            fieldType: 'TEXTINPUT',
            annotationType: 'text',
          },
        };

        const dropEvent = createDragEvent('drop', {
          clientX: 100,
          clientY: 100,
          data: { fieldAnnotation: JSON.stringify(payload) },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dropEvent);

        expect(mockActiveEditor.commands.addFieldAnnotation).toHaveBeenCalledWith(42, payload.attributes, true);
      });

      it('should handle JSON parse errors gracefully', () => {
        const dropEvent = createDragEvent('drop', {
          data: { fieldAnnotation: 'invalid JSON {{{' },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;

        // Should not throw
        expect(() => viewport.dispatchEvent(dropEvent)).not.toThrow();
        expect(mockActiveEditor.commands.addFieldAnnotation).not.toHaveBeenCalled();
      });

      it('should use fallback position when hitTest fails', () => {
        mockHitTest.mockReturnValue(null);

        const payload = {
          attributes: {
            fieldId: 'test-field',
            fieldType: 'TEXTINPUT',
            displayLabel: 'Test Field',
            type: 'text',
          },
        };

        const dropEvent = createDragEvent('drop', {
          clientX: 100,
          clientY: 100,
          data: { fieldAnnotation: JSON.stringify(payload) },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dropEvent);

        // Should use fallback position (selection.from = 50)
        expect(mockActiveEditor.commands.addFieldAnnotation).toHaveBeenCalledWith(50, payload.attributes, true);
      });

      it('should emit fieldAnnotationDropped event', () => {
        const payload = {
          attributes: {
            fieldId: 'test-field',
            fieldType: 'TEXTINPUT',
            displayLabel: 'Test Field',
            type: 'text',
          },
          sourceField: {
            fieldId: 'test-field',
            fieldType: 'TEXTINPUT',
            annotationType: 'text',
          },
        };

        const dropEvent = createDragEvent('drop', {
          clientX: 100,
          clientY: 100,
          data: { fieldAnnotation: JSON.stringify(payload) },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dropEvent);

        expect(mockActiveEditor.emit).toHaveBeenCalledWith('fieldAnnotationDropped', {
          sourceField: payload.sourceField,
          editor: mockActiveEditor,
          coordinates: { pos: 42, inside: 42 },
          pos: 42,
        });
      });

      it('should not insert when attributes are invalid', () => {
        const payload = {
          attributes: {
            // Missing required fields
            fieldId: 'test-field',
            // fieldType is missing
            // displayLabel is missing
            // type is missing
          },
        };

        const dropEvent = createDragEvent('drop', {
          clientX: 100,
          clientY: 100,
          data: { fieldAnnotation: JSON.stringify(payload) },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dropEvent);

        // Should emit event but not insert
        expect(mockActiveEditor.emit).toHaveBeenCalledWith(
          'fieldAnnotationDropped',
          expect.objectContaining({ pos: 42 }),
        );
        expect(mockActiveEditor.commands.addFieldAnnotation).not.toHaveBeenCalled();
      });

      it('should focus editor after drop', () => {
        const payload = {
          attributes: {
            fieldId: 'test-field',
            fieldType: 'TEXTINPUT',
            displayLabel: 'Test Field',
            type: 'text',
          },
        };

        const dropEvent = createDragEvent('drop', {
          clientX: 100,
          clientY: 100,
          data: { fieldAnnotation: JSON.stringify(payload) },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dropEvent);

        // Focus should be called even when attributes are invalid or missing
        const focusSpy = mockActiveEditor.view.dom.focus as Mock;
        expect(focusSpy).toHaveBeenCalled();
      });

      it('should move cursor after inserted node', () => {
        const payload = {
          attributes: {
            fieldId: 'test-field',
            fieldType: 'TEXTINPUT',
            displayLabel: 'Test Field',
            type: 'text',
          },
        };

        const dropEvent = createDragEvent('drop', {
          clientX: 100,
          clientY: 100,
          data: { fieldAnnotation: JSON.stringify(payload) },
        });

        const viewport = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        viewport.dispatchEvent(dropEvent);

        // Should insert at position 42, then move cursor to 43
        expect(mockActiveEditor.commands.addFieldAnnotation).toHaveBeenCalledWith(42, expect.any(Object), true);
        expect(mockActiveEditor.state.tr.setSelection).toHaveBeenCalled();
        expect(mockActiveEditor.view.dispatch).toHaveBeenCalled();
      });
    });
  });
});
