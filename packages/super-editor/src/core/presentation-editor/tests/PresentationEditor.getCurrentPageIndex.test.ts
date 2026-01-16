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
  clickToPosition: vi.fn(() => null),
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

/**
 * Test suite for PresentationEditor.#getCurrentPageIndex() fragment fallback
 *
 * The #getCurrentPageIndex() method determines which page contains the current
 * caret position. It has two strategies:
 * 1. Primary: Use selectionToRects() which queries the layout engine directly
 * 2. Fallback: When selectionToRects returns empty (e.g., collapsed cursor at
 *    edge positions), scan page fragments to find which page contains the position
 *
 * This fallback mechanism is critical for maintaining section-aware functionality
 * when the primary method cannot determine the page location.
 */
describe('PresentationEditor.#getCurrentPageIndex() fragment fallback', () => {
  let container: HTMLElement;
  let presentation: PresentationEditor;

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
    (PresentationEditor as typeof PresentationEditor & { instances: Map<string, unknown> }).instances = new Map();
  });

  afterEach(() => {
    if (presentation) {
      presentation.destroy();
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  /**
   * Test: Uses selectionToRects when it returns valid rects
   *
   * When selectionToRects successfully returns rectangle data for the current
   * selection, that should be the authoritative source for determining the
   * page index. The fragment fallback should not be used in this case.
   */
  it('should use selectionToRects when it returns valid rects', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [{ pmStart: 0, pmEnd: 50 }],
          },
          {
            number: 2,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [{ pmStart: 51, pmEnd: 100 }],
          },
        ],
      },
      measures: [],
    });

    // selectionToRects returns page 1
    mockSelectionToRects.mockReturnValue([{ pageIndex: 1, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-selection-rects',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    // Should use page index 1 from selectionToRects
    expect(mockSelectionToRects).toHaveBeenCalled();
    // Verify we're on page 2 (index 1) by checking that the page was used
    expect(styles.sectionIndex).toBe(0);
  });

  /**
   * Test: Falls back to fragment scanning when selectionToRects returns empty array
   *
   * When selectionToRects returns an empty array (e.g., collapsed cursor at
   * boundary positions), the method should fall back to scanning page fragments
   * to determine which page contains the current position.
   */
  it('should fall back to fragment scanning when selectionToRects returns empty array', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [{ pmStart: 0, pmEnd: 50 }],
          },
          {
            number: 2,
            size: { w: 11 * PPI, h: 8.5 * PPI },
            orientation: 'landscape',
            sectionIndex: 1,
            fragments: [{ pmStart: 51, pmEnd: 100 }],
          },
        ],
      },
      measures: [],
    });

    // selectionToRects returns empty - trigger fallback
    mockSelectionToRects.mockReturnValue([]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-fragment-fallback',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Mock editor selection to position 0 (should be on page 0)
    const mockEditor = (presentation as unknown as { editor?: { state?: { selection?: { from: number } } } }).editor;
    if (mockEditor && mockEditor.state && mockEditor.state.selection) {
      mockEditor.state.selection.from = 0;
    }

    const styles = presentation.getCurrentSectionPageStyles();

    // Should fall back to fragment scanning and find position 0 on page 0
    expect(styles.sectionIndex).toBe(0);
    expect(styles.orientation).toBe('portrait');
  });

  /**
   * Test: Finds position in fragment on non-first page
   *
   * Verifies that the fragment scanning fallback correctly identifies positions
   * on pages other than the first page. This ensures the fallback logic properly
   * iterates through all pages and fragments.
   */
  it('should find position in fragment on non-first page', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [{ pmStart: 0, pmEnd: 50 }],
          },
          {
            number: 2,
            size: { w: 11 * PPI, h: 8.5 * PPI },
            orientation: 'landscape',
            sectionIndex: 1,
            fragments: [{ pmStart: 51, pmEnd: 100 }],
          },
          {
            number: 3,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 2,
            fragments: [{ pmStart: 101, pmEnd: 150 }],
          },
        ],
      },
      measures: [],
    });

    // selectionToRects returns empty - trigger fallback
    mockSelectionToRects.mockReturnValue([]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-non-first-page',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Mock editor selection to position 75 (should be on page 1, section 1)
    const mockEditor = (presentation as unknown as { editor?: { state?: { selection?: { from: number } } } }).editor;
    if (mockEditor && mockEditor.state && mockEditor.state.selection) {
      mockEditor.state.selection.from = 75;
    }

    const styles = presentation.getCurrentSectionPageStyles();

    // Should find position 75 on page 1 (landscape section)
    expect(styles.sectionIndex).toBe(1);
    expect(styles.orientation).toBe('landscape');
  });

  /**
   * Test: Returns 0 when position not found in any fragment
   *
   * When a position cannot be found in any page fragment (e.g., position is
   * beyond the last fragment), the method should safely return page index 0
   * rather than throwing an error or returning undefined.
   */
  it('should return 0 when position not found in any fragment', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [{ pmStart: 0, pmEnd: 50 }],
          },
        ],
      },
      measures: [],
    });

    // selectionToRects returns empty - trigger fallback
    mockSelectionToRects.mockReturnValue([]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-position-not-found',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Mock editor selection to position 999 (beyond any fragment)
    const mockEditor = (presentation as unknown as { editor?: { state?: { selection?: { from: number } } } }).editor;
    if (mockEditor && mockEditor.state && mockEditor.state.selection) {
      mockEditor.state.selection.from = 999;
    }

    const styles = presentation.getCurrentSectionPageStyles();

    // Should default to section 0 when position not found
    expect(styles.sectionIndex).toBe(0);
  });

  /**
   * Test: Handles fragments without pmStart/pmEnd gracefully
   *
   * Some fragments may not have pmStart/pmEnd properties (e.g., drawing
   * fragments that don't correspond to text content). The method should
   * skip these fragments without throwing errors.
   */
  it('should handle fragments without pmStart/pmEnd gracefully', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [
              { pmStart: undefined, pmEnd: undefined }, // Fragment without position data
              { pmStart: 0, pmEnd: 50 },
            ],
          },
          {
            number: 2,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [
              { pmStart: null, pmEnd: null }, // Fragment with null positions
              { pmStart: 51, pmEnd: 100 },
            ],
          },
        ],
      },
      measures: [],
    });

    // selectionToRects returns empty - trigger fallback
    mockSelectionToRects.mockReturnValue([]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-incomplete-fragments',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Mock editor selection to position 60 (should be on page 1)
    const mockEditor = (presentation as unknown as { editor?: { state?: { selection?: { from: number } } } }).editor;
    if (mockEditor && mockEditor.state && mockEditor.state.selection) {
      mockEditor.state.selection.from = 60;
    }

    const styles = presentation.getCurrentSectionPageStyles();

    // Should skip incomplete fragments and find position 60 on page 1
    expect(styles.sectionIndex).toBe(0);
  });

  /**
   * Test: Correctly identifies position at fragment boundaries
   *
   * Positions at the exact start or end of a fragment should be correctly
   * identified as belonging to that fragment/page. This tests the inclusive
   * range check (pos >= pmStart && pos <= pmEnd).
   */
  it('should correctly identify position at fragment boundaries', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [{ pmStart: 0, pmEnd: 50 }],
          },
          {
            number: 2,
            size: { w: 11 * PPI, h: 8.5 * PPI },
            orientation: 'landscape',
            sectionIndex: 1,
            fragments: [{ pmStart: 51, pmEnd: 100 }],
          },
        ],
      },
      measures: [],
    });

    // selectionToRects returns empty - trigger fallback
    mockSelectionToRects.mockReturnValue([]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-boundary-positions',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Test position at end of first fragment
    const mockEditor = (presentation as unknown as { editor?: { state?: { selection?: { from: number } } } }).editor;
    if (mockEditor && mockEditor.state && mockEditor.state.selection) {
      mockEditor.state.selection.from = 50;
    }

    let styles = presentation.getCurrentSectionPageStyles();
    expect(styles.sectionIndex).toBe(0);
    expect(styles.orientation).toBe('portrait');

    // Test position at start of second fragment
    if (mockEditor && mockEditor.state && mockEditor.state.selection) {
      mockEditor.state.selection.from = 51;
    }

    styles = presentation.getCurrentSectionPageStyles();
    expect(styles.sectionIndex).toBe(1);
    expect(styles.orientation).toBe('landscape');
  });

  /**
   * Test: Handles empty pages array gracefully
   *
   * When the layout has no pages yet, the method should return page index 0
   * without throwing errors or attempting to scan non-existent pages.
   */
  it('should handle empty pages array gracefully', async () => {
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [],
      },
      measures: [],
    });

    mockSelectionToRects.mockReturnValue([]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-empty-pages',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    // Should return default values when no pages exist
    expect(styles.sectionIndex).toBe(0);
    expect(styles.pageSize).toEqual({ width: 8.5, height: 11 });
    expect(styles.orientation).toBe('portrait');
  });

  /**
   * Test: Handles pages with empty fragments arrays
   *
   * Pages may exist but have no fragments yet (e.g., during incremental layout).
   * The method should handle this case without errors and continue searching
   * other pages.
   */
  it('should handle pages with empty fragments arrays', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [], // Empty fragments array
          },
          {
            number: 2,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [{ pmStart: 0, pmEnd: 100 }],
          },
        ],
      },
      measures: [],
    });

    mockSelectionToRects.mockReturnValue([]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-empty-fragments',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const mockEditor = (presentation as unknown as { editor?: { state?: { selection?: { from: number } } } }).editor;
    if (mockEditor && mockEditor.state && mockEditor.state.selection) {
      mockEditor.state.selection.from = 50;
    }

    const styles = presentation.getCurrentSectionPageStyles();

    // Should skip page with empty fragments and find position on page 1
    expect(styles.sectionIndex).toBe(0);
  });

  /**
   * Test: Prefers selectionToRects over fragment fallback when both are available
   *
   * Even if fragment data would give a valid result, the method should always
   * prefer selectionToRects when it returns non-empty results, as it's the
   * more accurate, authoritative source.
   */
  it('should prefer selectionToRects over fragment fallback when both available', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [{ pmStart: 0, pmEnd: 100 }],
          },
          {
            number: 2,
            size: { w: 11 * PPI, h: 8.5 * PPI },
            orientation: 'landscape',
            sectionIndex: 1,
            fragments: [{ pmStart: 101, pmEnd: 200 }],
          },
        ],
      },
      measures: [],
    });

    // selectionToRects says page 1 (landscape)
    mockSelectionToRects.mockReturnValue([{ pageIndex: 1, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-prefer-selection-rects',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Mock editor position to 50 (which would be page 0 via fragments)
    const mockEditor = (presentation as unknown as { editor?: { state?: { selection?: { from: number } } } }).editor;
    if (mockEditor && mockEditor.state && mockEditor.state.selection) {
      mockEditor.state.selection.from = 50;
    }

    const styles = presentation.getCurrentSectionPageStyles();

    // Should use selectionToRects result (page 1, landscape) not fragment fallback (page 0, portrait)
    expect(styles.orientation).toBe('landscape');
    expect(styles.sectionIndex).toBe(1);
  });
});
