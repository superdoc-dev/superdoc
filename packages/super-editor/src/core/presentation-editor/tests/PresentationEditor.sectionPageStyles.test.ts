import { describe, it, expect, vi, beforeEach } from 'vitest';
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
 * Test suite for PresentationEditor.getCurrentSectionPageStyles()
 *
 * This method returns page size, margins, section index, and orientation
 * for the section containing the current caret position. It's critical for
 * section-aware UI components like rulers that need to display accurate
 * information for multi-section documents where each section can have
 * different page dimensions and orientations.
 */
describe('PresentationEditor.getCurrentSectionPageStyles()', () => {
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
   * Test: Returns default values when no page/layout is available
   *
   * When the layout engine hasn't produced any pages yet (e.g., during initial
   * document load or before first layout pass), the method should return safe
   * defaults (8.5" x 11" portrait with 1" margins on all sides).
   */
  it('should return default values when no page/layout is available', async () => {
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: { pages: [] },
      measures: [],
    });

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-no-layout',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    expect(styles.pageSize).toEqual({ width: 8.5, height: 11 });
    expect(styles.pageMargins).toEqual({ left: 1, right: 1, top: 1, bottom: 1 });
    expect(styles.sectionIndex).toBe(0);
    expect(styles.orientation).toBe('portrait');
  });

  /**
   * Test: Returns portrait dimensions for portrait page
   *
   * Verifies that when a page has explicit portrait dimensions (8.5" x 11"),
   * the method correctly returns these dimensions in inches and identifies
   * the orientation as 'portrait'.
   */
  it('should return portrait dimensions for portrait page', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            margins: { left: 72, right: 72, top: 72, bottom: 72 },
            orientation: 'portrait',
            section: { index: 0 },
            fragments: [],
          },
        ],
      },
      measures: [],
    });

    mockSelectionToRects.mockReturnValue([{ pageIndex: 0, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-portrait',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    expect(styles.pageSize.width).toBeCloseTo(8.5, 2);
    expect(styles.pageSize.height).toBeCloseTo(11, 2);
    expect(styles.orientation).toBe('portrait');
    expect(styles.pageMargins.left).toBeCloseTo(0.75, 2);
    expect(styles.pageMargins.right).toBeCloseTo(0.75, 2);
    expect(styles.pageMargins.top).toBeCloseTo(0.75, 2);
    expect(styles.pageMargins.bottom).toBeCloseTo(0.75, 2);
  });

  /**
   * Test: Returns landscape dimensions for landscape page
   *
   * Verifies that when a page has landscape orientation (11" x 8.5"),
   * the method correctly returns these swapped dimensions and identifies
   * the orientation as 'landscape'.
   */
  it('should return landscape dimensions for landscape page', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 11 * PPI, h: 8.5 * PPI },
            margins: { left: 72, right: 72, top: 72, bottom: 72 },
            orientation: 'landscape',
            section: { index: 0 },
            fragments: [],
          },
        ],
      },
      measures: [],
    });

    mockSelectionToRects.mockReturnValue([{ pageIndex: 0, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-landscape',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    expect(styles.pageSize.width).toBeCloseTo(11, 2);
    expect(styles.pageSize.height).toBeCloseTo(8.5, 2);
    expect(styles.orientation).toBe('landscape');
  });

  /**
   * Test: Uses orientation-based defaults when page.size is undefined
   *
   * When a page object exists but doesn't have explicit size dimensions,
   * the method should infer the size based on the orientation field:
   * - portrait: 8.5" x 11"
   * - landscape: 11" x 8.5"
   */
  it('should use orientation-based defaults when page.size is undefined', async () => {
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: undefined,
            margins: { left: 72, right: 72, top: 72, bottom: 72 },
            orientation: 'landscape',
            section: { index: 0 },
            fragments: [],
          },
        ],
      },
      measures: [],
    });

    mockSelectionToRects.mockReturnValue([{ pageIndex: 0, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-orientation-default',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    // Should use landscape defaults: 11" x 8.5"
    expect(styles.pageSize.width).toBeCloseTo(11, 2);
    expect(styles.pageSize.height).toBeCloseTo(8.5, 2);
    expect(styles.orientation).toBe('landscape');
  });

  /**
   * Test: Falls back to converter margins when page margins are undefined
   *
   * When a page doesn't have explicit margin values, the method should use
   * the document-level margins from the converter's pageStyles. This ensures
   * consistent behavior even when layout data is incomplete.
   */
  it('should fall back to converter margins when page margins are undefined', async () => {
    const PPI = 96;
    mockEditorConverterStore.current.pageStyles = {
      pageMargins: { left: 1.5, right: 1.5, top: 2, bottom: 2 },
    };

    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            margins: undefined,
            orientation: 'portrait',
            section: { index: 0 },
            fragments: [],
          },
        ],
      },
      measures: [],
    });

    mockSelectionToRects.mockReturnValue([{ pageIndex: 0, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-fallback-margins',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    // Should use converter margins: 1.5", 1.5", 2", 2"
    expect(styles.pageMargins.left).toBeCloseTo(1.5, 2);
    expect(styles.pageMargins.right).toBeCloseTo(1.5, 2);
    expect(styles.pageMargins.top).toBeCloseTo(2, 2);
    expect(styles.pageMargins.bottom).toBeCloseTo(2, 2);
  });

  /**
   * Test: Falls back to safe defaults when converter margins are invalid/undefined
   *
   * When both page margins and converter margins are missing or invalid,
   * the method should use safe default margins of 1" on all sides to prevent
   * NaN or undefined values from breaking the UI.
   */
  it('should fall back to safe defaults when converter margins are invalid/undefined', async () => {
    const PPI = 96;
    mockEditorConverterStore.current.pageStyles = {
      pageMargins: undefined,
    };

    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            margins: undefined,
            orientation: 'portrait',
            section: { index: 0 },
            fragments: [],
          },
        ],
      },
      measures: [],
    });

    mockSelectionToRects.mockReturnValue([{ pageIndex: 0, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-safe-defaults',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    // Should use safe defaults: 1" on all sides
    expect(styles.pageMargins.left).toBe(1);
    expect(styles.pageMargins.right).toBe(1);
    expect(styles.pageMargins.top).toBe(1);
    expect(styles.pageMargins.bottom).toBe(1);
  });

  /**
   * Test: Falls back to safe defaults when converter margins have invalid values
   *
   * Validates that the method properly sanitizes margin values. When converter
   * margins are undefined or null, they get replaced with safe defaults of 1".
   *
   * Note: The typeof check filters out undefined/null but not NaN (typeof NaN === 'number').
   * Non-number types get coerced to numbers when used in calculations (string becomes 1).
   */
  it('should fall back to safe defaults when converter margins have invalid values', async () => {
    const PPI = 96;
    mockEditorConverterStore.current.pageStyles = {
      pageMargins: {
        left: undefined,
        right: null as unknown as number,
        top: undefined,
        bottom: null as unknown as number,
      },
    };

    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            margins: undefined,
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [],
          },
        ],
      },
      measures: [],
    });

    mockSelectionToRects.mockReturnValue([{ pageIndex: 0, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-invalid-margins',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    // undefined and null get replaced with safe default 1"
    expect(styles.pageMargins.left).toBe(1);
    expect(styles.pageMargins.right).toBe(1);
    expect(styles.pageMargins.top).toBe(1);
    expect(styles.pageMargins.bottom).toBe(1);
  });

  /**
   * Test: Handles invalid orientation values (falls back to 'portrait')
   *
   * When a page has an invalid or unrecognized orientation value,
   * the method should safely default to 'portrait' rather than breaking
   * or returning invalid data.
   */
  it('should handle invalid orientation values (falls back to portrait)', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            margins: { left: 72, right: 72, top: 72, bottom: 72 },
            orientation: 'invalid-orientation' as unknown as 'portrait' | 'landscape',
            section: { index: 0 },
            fragments: [],
          },
        ],
      },
      measures: [],
    });

    mockSelectionToRects.mockReturnValue([{ pageIndex: 0, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-invalid-orientation',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    // Should default to portrait for invalid orientation
    expect(styles.orientation).toBe('portrait');
  });

  /**
   * Test: Returns correct section for multi-section documents
   *
   * In documents with multiple sections, the method should correctly identify
   * which section contains the current caret position and return that section's
   * index along with its specific page dimensions and margins.
   */
  it('should return correct section for multi-section documents', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            margins: { left: 72, right: 72, top: 72, bottom: 72 },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [{ pmStart: 0, pmEnd: 50 }],
          },
          {
            number: 2,
            size: { w: 11 * PPI, h: 8.5 * PPI },
            margins: { left: 96, right: 96, top: 96, bottom: 96 },
            orientation: 'landscape',
            sectionIndex: 1,
            fragments: [{ pmStart: 51, pmEnd: 100 }],
          },
          {
            number: 3,
            size: { w: 7 * PPI, h: 9 * PPI },
            margins: { left: 48, right: 48, top: 48, bottom: 48 },
            orientation: 'portrait',
            sectionIndex: 2,
            fragments: [{ pmStart: 101, pmEnd: 150 }],
          },
        ],
      },
      measures: [],
    });

    // Simulate caret on page 2 (section 1)
    mockSelectionToRects.mockReturnValue([{ pageIndex: 1, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-multi-section',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    // Should return section 1 (landscape page)
    expect(styles.sectionIndex).toBe(1);
    expect(styles.orientation).toBe('landscape');
    expect(styles.pageSize.width).toBeCloseTo(11, 2);
    expect(styles.pageSize.height).toBeCloseTo(8.5, 2);
    expect(styles.pageMargins.left).toBeCloseTo(1, 2);
    expect(styles.pageMargins.right).toBeCloseTo(1, 2);
  });

  /**
   * Test: Uses section index from page metadata
   *
   * Verifies that when a page has explicit section metadata, the method
   * correctly extracts and returns the section index from that metadata.
   */
  it('should use section index from page metadata', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            margins: { left: 72, right: 72, top: 72, bottom: 72 },
            orientation: 'portrait',
            sectionIndex: 5,
            fragments: [],
          },
        ],
      },
      measures: [],
    });

    mockSelectionToRects.mockReturnValue([{ pageIndex: 0, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-section-index',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    expect(styles.sectionIndex).toBe(5);
  });

  /**
   * Test: Defaults section index to 0 when section metadata is missing
   *
   * When a page doesn't have section metadata, the method should safely
   * default to section index 0 rather than returning undefined or null.
   */
  it('should default section index to 0 when section metadata is missing', async () => {
    const PPI = 96;
    mockIncrementalLayout.mockResolvedValueOnce({
      layout: {
        pages: [
          {
            number: 1,
            size: { w: 8.5 * PPI, h: 11 * PPI },
            margins: { left: 72, right: 72, top: 72, bottom: 72 },
            orientation: 'portrait',
            section: undefined,
            fragments: [],
          },
        ],
      },
      measures: [],
    });

    mockSelectionToRects.mockReturnValue([{ pageIndex: 0, x: 100, y: 100, width: 10, height: 10 }]);

    presentation = new PresentationEditor({
      element: container,
      documentId: 'test-no-section-metadata',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const styles = presentation.getCurrentSectionPageStyles();

    expect(styles.sectionIndex).toBe(0);
  });
});
