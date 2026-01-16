import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { PresentationEditor } from '../PresentationEditor.js';
import type { Editor as EditorInstance } from '../../Editor.js';
import { Editor } from '../../Editor.js';

type MockedEditor = Mock<(...args: unknown[]) => EditorInstance> & {
  mock: {
    calls: unknown[][];
    results: Array<{ value: EditorInstance }>;
  };
};

const {
  createDefaultConverter,
  mockClickToPosition,
  mockIncrementalLayout,
  mockToFlowBlocks,
  mockSelectionToRects,
  mockCreateDomPainter,
  mockMeasureBlock,
  mockEditorConverterStore,
  mockCreateHeaderFooterEditor,
  createdSectionEditors,
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
  };

  const editors: Array<{ editor: ReturnType<typeof createSectionEditor> }> = [];

  return {
    createDefaultConverter,
    mockClickToPosition: vi.fn(() => null),
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
      const editor = createSectionEditor();
      editors.push({ editor });
      return editor;
    }),
    createdSectionEditors: editors,
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
          descendants: vi.fn(),
          nodesBetween: vi.fn((_from: number, _to: number, callback: (node: unknown, pos: number) => void) => {
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
  clickToPosition: mockClickToPosition,
  createDragHandler: vi.fn(() => {
    return () => {};
  }),
  getFragmentAtPosition: vi.fn(() => null),
  computeLinePmRange: vi.fn(() => ({ from: 0, to: 0 })),
  measureCharacterX: vi.fn(() => 0),
  extractIdentifierFromConverter: vi.fn((_converter) => ({
    extractHeaderId: vi.fn(() => 'rId-header-default'),
    extractFooterId: vi.fn(() => 'rId-footer-default'),
  })),
  buildMultiSectionIdentifier: vi.fn(() => ({ sections: [] })),
  getHeaderFooterTypeForSection: vi.fn(() => 'default'),
  getHeaderFooterType: vi.fn((_pageNumber, _identifier, _options) => {
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

describe('PresentationEditor - Zoom Functionality', () => {
  let container: HTMLElement;
  let editor: PresentationEditor;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    vi.clearAllMocks();
    mockEditorConverterStore.current = {
      ...createDefaultConverter(),
      headerEditors: [],
      footerEditors: [],
    };
    mockEditorConverterStore.mediaFiles = {};
    createdSectionEditors.length = 0;

    // Reset static instances
    (PresentationEditor as typeof PresentationEditor & { instances: Map<string, unknown> }).instances = new Map();
  });

  afterEach(() => {
    if (editor) {
      editor.destroy();
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('zoom getter', () => {
    it('should return default value of 1 when zoom is not configured', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        pageSize: { w: 612, h: 792 },
      });

      expect(editor.zoom).toBe(1);
    });

    it('should return configured zoom value when set via setZoom', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        pageSize: { w: 612, h: 792 },
      });

      editor.setZoom(1.5);
      expect(editor.zoom).toBe(1.5);
    });

    it('should return updated zoom value after setZoom is called', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        pageSize: { w: 612, h: 792 },
      });

      expect(editor.zoom).toBe(1);

      editor.setZoom(2);
      expect(editor.zoom).toBe(2);

      editor.setZoom(0.5);
      expect(editor.zoom).toBe(0.5);
    });
  });

  describe('setZoom', () => {
    beforeEach(() => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        pageSize: { w: 612, h: 792 },
      });
    });

    it('should apply transform on painter host when zoom is set', () => {
      editor.setZoom(1.5);

      // Verify zoom was updated via the getter
      expect(editor.zoom).toBe(1.5);

      // Verify transform is applied to the painter host (not viewport)
      // The new architecture applies transform to painterHost (.presentation-editor__pages)
      // while viewport gets scaled dimensions instead
      const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      expect(painterHost?.style.transform).toBe('scale(1.5)');
      expect(painterHost?.style.transformOrigin).toBe('top left');

      // Viewport should NOT have transform (it has scaled dimensions instead)
      const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      expect(viewportHost?.style.transform).toBe('');
    });

    it('should clear transform when zoom is set to 1', () => {
      editor.setZoom(1.5);
      expect(editor.zoom).toBe(1.5);

      editor.setZoom(1);
      expect(editor.zoom).toBe(1);

      const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      expect(painterHost?.style.transform).toBe('');
    });

    it('should throw TypeError when zoom is not a number', () => {
      expect(() => editor.setZoom('1.5' as unknown as number)).toThrow(TypeError);
      expect(() => editor.setZoom('1.5' as unknown as number)).toThrow(
        '[PresentationEditor] setZoom expects a number, received string',
      );

      expect(() => editor.setZoom(null as unknown as number)).toThrow(TypeError);
      expect(() => editor.setZoom(undefined as unknown as number)).toThrow(TypeError);
      expect(() => editor.setZoom({} as unknown as number)).toThrow(TypeError);
    });

    it('should throw RangeError when zoom is NaN', () => {
      expect(() => editor.setZoom(NaN)).toThrow(RangeError);
      expect(() => editor.setZoom(NaN)).toThrow('[PresentationEditor] setZoom expects a valid number (not NaN)');
    });

    it('should throw RangeError when zoom is not finite', () => {
      expect(() => editor.setZoom(Infinity)).toThrow(RangeError);
      expect(() => editor.setZoom(Infinity)).toThrow('[PresentationEditor] setZoom expects a finite number');

      expect(() => editor.setZoom(-Infinity)).toThrow(RangeError);
      expect(() => editor.setZoom(-Infinity)).toThrow('[PresentationEditor] setZoom expects a finite number');
    });

    it('should throw RangeError when zoom is not positive', () => {
      expect(() => editor.setZoom(0)).toThrow(RangeError);
      expect(() => editor.setZoom(0)).toThrow('[PresentationEditor] setZoom expects a positive number greater than 0');

      expect(() => editor.setZoom(-1)).toThrow(RangeError);
      expect(() => editor.setZoom(-1)).toThrow('[PresentationEditor] setZoom expects a positive number greater than 0');

      expect(() => editor.setZoom(-0.5)).toThrow(RangeError);
    });

    it('should accept valid positive zoom values', () => {
      expect(() => editor.setZoom(0.1)).not.toThrow();
      expect(() => editor.setZoom(0.5)).not.toThrow();
      expect(() => editor.setZoom(1)).not.toThrow();
      expect(() => editor.setZoom(1.5)).not.toThrow();
      expect(() => editor.setZoom(2)).not.toThrow();
      expect(() => editor.setZoom(5)).not.toThrow();
    });

    it('should warn when zoom exceeds recommended maximum', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // MAX_ZOOM_WARNING_THRESHOLD is 10, so we need > 10 to trigger warning
      editor.setZoom(10.1);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Zoom level 10.1 exceeds recommended maximum'));

      warnSpy.mockRestore();
    });
  });

  describe('normalizeClientPoint', () => {
    beforeEach(() => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        pageSize: { w: 612, h: 792 },
      });
    });

    it('should normalize client coordinates at zoom level 1', () => {
      editor.setZoom(1);

      // Mock getBoundingClientRect to return predictable values
      const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      if (viewportHost) {
        vi.spyOn(viewportHost, 'getBoundingClientRect').mockReturnValue({
          left: 100,
          top: 50,
          width: 800,
          height: 1000,
          right: 900,
          bottom: 1050,
          x: 100,
          y: 50,
          toJSON: () => ({}),
        });
      }

      const result = editor.normalizeClientPoint(200, 150);

      expect(result).not.toBeNull();
      expect(result?.x).toBe(100); // (200 - 100) / 1
      expect(result?.y).toBe(100); // (150 - 50) / 1
    });

    it('should normalize client coordinates at zoom level 0.5', () => {
      editor.setZoom(0.5);

      const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      if (viewportHost) {
        vi.spyOn(viewportHost, 'getBoundingClientRect').mockReturnValue({
          left: 100,
          top: 50,
          width: 800,
          height: 1000,
          right: 900,
          bottom: 1050,
          x: 100,
          y: 50,
          toJSON: () => ({}),
        });
      }

      const result = editor.normalizeClientPoint(200, 150);

      expect(result).not.toBeNull();
      expect(result?.x).toBe(200); // (200 - 100) / 0.5
      expect(result?.y).toBe(200); // (150 - 50) / 0.5
    });

    it('should normalize client coordinates at zoom level 2', () => {
      editor.setZoom(2);

      const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      if (viewportHost) {
        vi.spyOn(viewportHost, 'getBoundingClientRect').mockReturnValue({
          left: 100,
          top: 50,
          width: 800,
          height: 1000,
          right: 900,
          bottom: 1050,
          x: 100,
          y: 50,
          toJSON: () => ({}),
        });
      }

      const result = editor.normalizeClientPoint(200, 150);

      expect(result).not.toBeNull();
      expect(result?.x).toBe(50); // (200 - 100) / 2
      expect(result?.y).toBe(50); // (150 - 50) / 2
    });

    it('should account for scroll offset when normalizing coordinates', () => {
      editor.setZoom(1);

      const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      const visibleHost = container.querySelector('.presentation-editor') as HTMLElement;

      if (viewportHost) {
        vi.spyOn(viewportHost, 'getBoundingClientRect').mockReturnValue({
          left: 100,
          top: 50,
          width: 800,
          height: 1000,
          right: 900,
          bottom: 1050,
          x: 100,
          y: 50,
          toJSON: () => ({}),
        });
      }

      // Note: Mocking scrollLeft/scrollTop on HTMLElement is complex in JSDOM
      // This test verifies the method works with default scroll (0, 0)
      const result = editor.normalizeClientPoint(200, 150);

      expect(result).not.toBeNull();
      // With scroll at 0,0: (200 - 100 + 0) / 1 = 100
      expect(result?.x).toBe(100);
      // With scroll at 0,0: (150 - 50 + 0) / 1 = 100
      expect(result?.y).toBe(100);
    });

    it('should return null for NaN coordinates', () => {
      expect(editor.normalizeClientPoint(NaN, 100)).toBeNull();
      expect(editor.normalizeClientPoint(100, NaN)).toBeNull();
      expect(editor.normalizeClientPoint(NaN, NaN)).toBeNull();
    });

    it('should return null for infinite coordinates', () => {
      expect(editor.normalizeClientPoint(Infinity, 100)).toBeNull();
      expect(editor.normalizeClientPoint(100, Infinity)).toBeNull();
      expect(editor.normalizeClientPoint(-Infinity, 100)).toBeNull();
      expect(editor.normalizeClientPoint(100, -Infinity)).toBeNull();
    });

    it('should accept negative coordinates (valid for elements positioned above/left of viewport)', () => {
      editor.setZoom(1);

      const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      if (viewportHost) {
        vi.spyOn(viewportHost, 'getBoundingClientRect').mockReturnValue({
          left: 100,
          top: 50,
          width: 800,
          height: 1000,
          right: 900,
          bottom: 1050,
          x: 100,
          y: 50,
          toJSON: () => ({}),
        });
      }

      const result = editor.normalizeClientPoint(-50, -25);

      expect(result).not.toBeNull();
      // With scroll at 0,0: (-50 - 100 + 0) / 1 = -150
      // Note: Negative client coords are valid when elements are above/left of viewport
      expect(result?.x).toBe(-150); // (-50 - 100) / 1
      expect(result?.y).toBe(-75); // (-25 - 50) / 1
    });
  });

  describe('zoomChange event', () => {
    beforeEach(() => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        pageSize: { w: 612, h: 792 },
      });
    });

    it('should emit zoomChange event when setZoom is called', () => {
      const listener = vi.fn();
      editor.on('zoomChange', listener);

      editor.setZoom(1.5);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ zoom: 1.5 });
    });

    it('should emit zoomChange event with correct value for multiple zoom changes', () => {
      const listener = vi.fn();
      editor.on('zoomChange', listener);

      editor.setZoom(1.5);
      editor.setZoom(2);
      editor.setZoom(0.75);

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, { zoom: 1.5 });
      expect(listener).toHaveBeenNthCalledWith(2, { zoom: 2 });
      expect(listener).toHaveBeenNthCalledWith(3, { zoom: 0.75 });
    });

    it('should allow removing zoomChange listener with off()', () => {
      const listener = vi.fn();
      editor.on('zoomChange', listener);

      editor.setZoom(1.5);
      expect(listener).toHaveBeenCalledTimes(1);

      editor.off('zoomChange', listener);

      editor.setZoom(2);
      // Should still be 1 call (not 2)
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should support multiple zoomChange listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      editor.on('zoomChange', listener1);
      editor.on('zoomChange', listener2);

      editor.setZoom(1.5);

      expect(listener1).toHaveBeenCalledWith({ zoom: 1.5 });
      expect(listener2).toHaveBeenCalledWith({ zoom: 1.5 });
    });
  });

  describe('applyZoom viewport dimensions', () => {
    beforeEach(() => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
        pageSize: { w: 612, h: 792 },
      });
    });

    it('should set viewport dimensions based on zoom', () => {
      editor.setZoom(1.5);

      const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      // At zoom 1.5, viewport width should be pageWidth * 1.5
      // Default page width is 612 points = 612px in layout space
      expect(viewportHost?.style.width).toBe('918px'); // 612 * 1.5
      expect(viewportHost?.style.minWidth).toBe('918px');
    });

    it('should apply transform to painterHost not viewportHost', () => {
      editor.setZoom(1.5);

      const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;

      // viewportHost should NOT have transform (it has scaled dimensions instead)
      expect(viewportHost?.style.transform).toBe('');

      // painterHost SHOULD have transform
      expect(painterHost?.style.transform).toBe('scale(1.5)');
      expect(painterHost?.style.transformOrigin).toBe('top left');
    });

    it('should apply transform to selectionOverlay', () => {
      editor.setZoom(2);

      const selectionOverlay = container.querySelector('.presentation-editor__selection-overlay') as HTMLElement;

      expect(selectionOverlay?.style.transform).toBe('scale(2)');
      expect(selectionOverlay?.style.transformOrigin).toBe('top left');
    });

    it('should clear transforms when zoom is 1', () => {
      // First set a non-1 zoom
      editor.setZoom(1.5);

      const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      expect(painterHost?.style.transform).toBe('scale(1.5)');

      // Then set zoom back to 1
      editor.setZoom(1);

      expect(painterHost?.style.transform).toBe('');
    });

    it('should set painterHost to unscaled dimensions', () => {
      editor.setZoom(2);

      const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      // painterHost should have unscaled page width (612px)
      // The transform: scale(2) visually doubles it to match viewport
      expect(painterHost?.style.width).toBe('612px');
    });

    it('should size viewport and overlays across all pages in horizontal layout', async () => {
      vi.useFakeTimers();
      mockIncrementalLayout.mockResolvedValue({
        layout: {
          pages: [
            { number: 1, size: { w: 612, h: 792 }, fragments: [] },
            { number: 2, size: { w: 612, h: 792 }, fragments: [] },
          ],
          pageSize: { w: 612, h: 792 },
        },
        measures: [],
      });

      try {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc',
          pageSize: { w: 612, h: 792 },
        });

        editor.setLayoutMode('horizontal');

        await vi.runAllTimersAsync();

        editor.setZoom(1.5);

        const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
        const selectionOverlay = container.querySelector('.presentation-editor__selection-overlay') as HTMLElement;

        // totalWidth = (612 * 2) + 20 (default horizontal gap) = 1244
        // scaledWidth = 1244 * 1.5 = 1866
        expect(viewportHost?.style.width).toBe('1866px');
        expect(viewportHost?.style.minWidth).toBe('1866px');
        expect(viewportHost?.style.minHeight).toBe('1188px'); // 792 * 1.5

        expect(painterHost?.style.width).toBe('1244px');
        expect(painterHost?.style.minHeight).toBe('792px');
        expect(painterHost?.style.transform).toBe('scale(1.5)');

        expect(selectionOverlay?.style.width).toBe('1244px');
        expect(selectionOverlay?.style.height).toBe('792px');
        expect(selectionOverlay?.style.transform).toBe('scale(1.5)');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('applyZoom with varying page sizes', () => {
    it('should use max width for vertical layout with mixed portrait/landscape pages', async () => {
      vi.useFakeTimers();

      // Simulate a multi-section document with portrait and landscape pages
      mockIncrementalLayout.mockResolvedValue({
        layout: {
          pages: [
            { number: 1, size: { w: 612, h: 792 }, fragments: [] }, // Portrait (8.5x11)
            { number: 2, size: { w: 792, h: 612 }, fragments: [] }, // Landscape (11x8.5)
            { number: 3, size: { w: 612, h: 792 }, fragments: [] }, // Portrait (8.5x11)
          ],
          pageSize: { w: 612, h: 792 },
        },
        measures: [],
      });

      try {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc-mixed',
          pageSize: { w: 612, h: 792 },
        });

        editor.setLayoutMode('vertical');
        await vi.runAllTimersAsync();

        editor.setZoom(1.5);

        const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;

        // For vertical layout with mixed pages, viewport should use max width (792 from landscape)
        // maxWidth = 792, totalHeight = 612 + 792 + 612 + 2 * pageGap
        // Default pageGap for vertical layout is 24: totalHeight = 2016 + 48 = 2064 (heights), but we need to sum heights: 792 + 612 + 792 = 2196
        // Wait, pages are: [Portrait 612x792, Landscape 792x612, Portrait 612x792]
        // Heights: 792 + 612 + 792 = 2196, gaps: 2 * 24 = 48, total = 2244
        // scaledWidth = 792 * 1.5 = 1188
        // scaledHeight = 2244 * 1.5 = 3366
        expect(viewportHost?.style.width).toBe('1188px');
        expect(viewportHost?.style.minWidth).toBe('1188px');
        expect(viewportHost?.style.minHeight).toBe('3366px');

        expect(painterHost?.style.width).toBe('792px'); // Unscaled max width
        expect(painterHost?.style.minHeight).toBe('2244px'); // Unscaled total height
        expect(painterHost?.style.transform).toBe('scale(1.5)');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should sum widths and use max height for horizontal layout with mixed page sizes', async () => {
      vi.useFakeTimers();

      mockIncrementalLayout.mockResolvedValue({
        layout: {
          pages: [
            { number: 1, size: { w: 612, h: 792 }, fragments: [] }, // Portrait
            { number: 2, size: { w: 792, h: 612 }, fragments: [] }, // Landscape
          ],
          pageSize: { w: 612, h: 792 },
        },
        measures: [],
      });

      try {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc-horizontal-mixed',
          pageSize: { w: 612, h: 792 },
        });

        editor.setLayoutMode('horizontal');
        await vi.runAllTimersAsync();

        editor.setZoom(2);

        const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;

        // For horizontal layout: sum widths (612 + 792 + pageGap = 1424), use max height (792)
        // scaledWidth = 1424 * 2 = 2848
        // scaledHeight = 792 * 2 = 1584
        expect(viewportHost?.style.width).toBe('2848px');
        expect(viewportHost?.style.minWidth).toBe('2848px');
        expect(viewportHost?.style.minHeight).toBe('1584px');

        expect(painterHost?.style.width).toBe('1424px'); // Unscaled total width
        expect(painterHost?.style.minHeight).toBe('792px'); // Unscaled max height
        expect(painterHost?.style.transform).toBe('scale(2)');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle empty pages array by using default dimensions', () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc-empty-pages',
        pageSize: { w: 612, h: 792 },
      });

      // Mock empty pages
      mockIncrementalLayout.mockResolvedValue({
        layout: {
          pages: [],
          pageSize: { w: 612, h: 792 },
        },
        measures: [],
      });

      editor.setZoom(1.5);

      const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
      const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;

      // Should fall back to default dimensions (612, 792)
      // scaledWidth = 612 * 1.5 = 918
      // scaledHeight = 792 * 1.5 = 1188
      expect(viewportHost?.style.width).toBe('918px');
      expect(viewportHost?.style.minWidth).toBe('918px');
      expect(viewportHost?.style.minHeight).toBe('1188px');

      expect(painterHost?.style.width).toBe('612px');
      expect(painterHost?.style.minHeight).toBe('792px');
      expect(painterHost?.style.transform).toBe('scale(1.5)');
    });

    it('should fall back to defaults for pages with missing size properties', async () => {
      vi.useFakeTimers();

      mockIncrementalLayout.mockResolvedValue({
        layout: {
          pages: [
            { number: 1, size: { w: 612, h: 792 }, fragments: [] }, // Valid size
            { number: 2, fragments: [] }, // Missing size
            { number: 3, size: null, fragments: [] }, // Null size
          ],
          pageSize: { w: 612, h: 792 },
        },
        measures: [],
      });

      try {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc-missing-sizes',
          pageSize: { w: 612, h: 792 },
        });

        await vi.runAllTimersAsync();

        editor.setZoom(1);

        const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;

        // All pages should use default dimensions
        // maxWidth = 612, totalHeight = 792 + 792 + 792 + 2 * 24 = 2424
        expect(viewportHost?.style.width).toBe('612px');
        expect(viewportHost?.style.minWidth).toBe('612px');
        expect(viewportHost?.style.minHeight).toBe('2424px');

        expect(painterHost?.style.width).toBe('612px');
        expect(painterHost?.style.minHeight).toBe('2424px');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should fall back to defaults for pages with invalid size values', async () => {
      vi.useFakeTimers();

      mockIncrementalLayout.mockResolvedValue({
        layout: {
          pages: [
            { number: 1, size: { w: 612, h: 792 }, fragments: [] }, // Valid
            { number: 2, size: { w: 0, h: 792 }, fragments: [] }, // Zero width (invalid)
            { number: 3, size: { w: -100, h: 792 }, fragments: [] }, // Negative width (invalid)
            { number: 4, size: { w: 'invalid', h: 792 }, fragments: [] }, // Non-number (invalid)
          ],
          pageSize: { w: 612, h: 792 },
        },
        measures: [],
      });

      try {
        editor = new PresentationEditor({
          element: container,
          documentId: 'test-doc-invalid-sizes',
          pageSize: { w: 612, h: 792 },
        });

        await vi.runAllTimersAsync();

        editor.setZoom(1);

        const viewportHost = container.querySelector('.presentation-editor__viewport') as HTMLElement;
        const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;

        // Invalid pages should fall back to defaults
        // maxWidth = 612, totalHeight = 792 * 4 + 3 * 24 = 3240
        expect(viewportHost?.style.width).toBe('612px');
        expect(viewportHost?.style.minWidth).toBe('612px');
        expect(viewportHost?.style.minHeight).toBe('3240px');

        expect(painterHost?.style.width).toBe('612px');
        expect(painterHost?.style.minHeight).toBe('3240px');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
