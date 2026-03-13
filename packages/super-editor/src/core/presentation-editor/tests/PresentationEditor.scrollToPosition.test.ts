/**
 * Tests for scrollToPosition and scrollToPositionAsync methods.
 *
 * These methods handle scrolling to a document position in presentation mode,
 * where ProseMirror's native scrollIntoView operates on a hidden editor.
 *
 * What we test:
 *
 * scrollToPosition (sync):
 *   - Returns false for invalid positions (NaN, Infinity)
 *   - Returns false when position is not in any page fragment
 *   - Scrolls to the specific text element (using data-pm-start/data-pm-end attributes)
 *   - Prefers more specific (smaller range) elements for precise centering
 *   - Falls back to page scroll when no text element found
 *   - Respects the `block` option (center, start, end, nearest)
 *
 * scrollToPositionAsync:
 *   - Uses fast path (sync scroll) when page is already mounted
 *   - Waits for virtualized pages to mount before scrolling
 *   - Returns false when page fails to mount within timeout (2000ms)
 *   - Returns false for invalid positions or positions outside layout
 *
 * Test patterns borrowed from PresentationEditor.goToAnchor.test.ts for testing
 * page virtualization and async mount waiting behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { PresentationEditor } from '../PresentationEditor.js';

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
              size: 200,
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
          nodeSize: 200,
          content: {
            size: 200,
          },
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
vi.mock('@superdoc/pm-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@superdoc/pm-adapter')>();
  return {
    ...actual,
    toFlowBlocks: mockToFlowBlocks,
  };
});

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

vi.mock('../../header-footer/EditorOverlayManager', () => ({
  EditorOverlayManager: mockEditorOverlayManager,
}));

describe('PresentationEditor - scrollToPosition', () => {
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

    // Setup default layout with two pages
    const layoutResult = {
      layout: {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            numberText: '1',
            size: { w: 612, h: 792 },
            fragments: [{ kind: 'para', pmStart: 0, pmEnd: 100 }],
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
            fragments: [{ kind: 'para', pmStart: 100, pmEnd: 200 }],
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
    mockToFlowBlocks.mockReturnValue({ blocks: [], bookmarks: new Map() });
  });

  afterEach(() => {
    if (editor) {
      editor.destroy();
    }
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  describe('scrollToPosition (sync)', () => {
    it('should return false for invalid position', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

      expect(editor.scrollToPosition(NaN)).toBe(false);
      expect(editor.scrollToPosition(Infinity)).toBe(false);
    });

    it('should return false when position not in any page fragment', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Position 250 is beyond our layout (pages cover 0-200)
      expect(editor.scrollToPosition(250)).toBe(false);
    });

    it('should scroll to page element when position is valid', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Create mock page element
      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      expect(pagesHost).toBeTruthy();
      if (pagesHost) {
        const mockPage = document.createElement('div');
        mockPage.setAttribute('data-page-index', '0');
        mockPage.scrollIntoView = vi.fn();
        pagesHost.appendChild(mockPage);
      }

      const result = editor.scrollToPosition(50);
      expect(result).toBe(true);
    });

    it('should scroll to specific text element when found', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Create mock page with text element containing position data
      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      expect(pagesHost).toBeTruthy();
      if (pagesHost) {
        const mockPage = document.createElement('div');
        mockPage.setAttribute('data-page-index', '0');
        mockPage.scrollIntoView = vi.fn();

        // Add text element with pm position data
        const textElement = document.createElement('span');
        textElement.dataset.pmStart = '40';
        textElement.dataset.pmEnd = '60';
        textElement.scrollIntoView = vi.fn();
        mockPage.appendChild(textElement);

        pagesHost.appendChild(mockPage);

        const result = editor.scrollToPosition(50);
        expect(result).toBe(true);
        // Should scroll the text element, not the page
        expect(textElement.scrollIntoView).toHaveBeenCalledWith({
          block: 'center',
          inline: 'nearest',
          behavior: 'auto',
        });
        expect(mockPage.scrollIntoView).not.toHaveBeenCalled();
      }
    });

    it('should prefer more specific (smaller range) elements', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      expect(pagesHost).toBeTruthy();
      if (pagesHost) {
        const mockPage = document.createElement('div');
        mockPage.setAttribute('data-page-index', '0');
        mockPage.scrollIntoView = vi.fn();

        // Larger range element (paragraph)
        const paraElement = document.createElement('div');
        paraElement.dataset.pmStart = '0';
        paraElement.dataset.pmEnd = '100';
        paraElement.scrollIntoView = vi.fn();
        mockPage.appendChild(paraElement);

        // Smaller range element (span within paragraph)
        const spanElement = document.createElement('span');
        spanElement.dataset.pmStart = '45';
        spanElement.dataset.pmEnd = '55';
        spanElement.scrollIntoView = vi.fn();
        paraElement.appendChild(spanElement);

        pagesHost.appendChild(mockPage);

        const result = editor.scrollToPosition(50);
        expect(result).toBe(true);
        // Should scroll the smaller span element
        expect(spanElement.scrollIntoView).toHaveBeenCalled();
        expect(paraElement.scrollIntoView).not.toHaveBeenCalled();
      }
    });

    it('should skip header/footer elements when finding scroll target', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      expect(pagesHost).toBeTruthy();
      if (pagesHost) {
        const mockPage = document.createElement('div');
        mockPage.setAttribute('data-page-index', '0');
        mockPage.scrollIntoView = vi.fn();

        // Header element with overlapping PM positions (from separate PM doc)
        const header = document.createElement('div');
        header.className = 'superdoc-page-header';
        const headerSpan = document.createElement('span');
        headerSpan.dataset.pmStart = '48';
        headerSpan.dataset.pmEnd = '52';
        headerSpan.scrollIntoView = vi.fn();
        header.appendChild(headerSpan);
        mockPage.appendChild(header);

        // Body element with wider range
        const bodySpan = document.createElement('span');
        bodySpan.dataset.pmStart = '40';
        bodySpan.dataset.pmEnd = '60';
        bodySpan.scrollIntoView = vi.fn();
        mockPage.appendChild(bodySpan);

        // Footer element with overlapping PM positions
        const footer = document.createElement('div');
        footer.className = 'superdoc-page-footer';
        const footerSpan = document.createElement('span');
        footerSpan.dataset.pmStart = '49';
        footerSpan.dataset.pmEnd = '51';
        footerSpan.scrollIntoView = vi.fn();
        footer.appendChild(footerSpan);
        mockPage.appendChild(footer);

        pagesHost.appendChild(mockPage);

        const result = editor.scrollToPosition(50);
        expect(result).toBe(true);
        // Should scroll the body element, not the header/footer elements
        // (even though header/footer have smaller ranges)
        expect(bodySpan.scrollIntoView).toHaveBeenCalled();
        expect(headerSpan.scrollIntoView).not.toHaveBeenCalled();
        expect(footerSpan.scrollIntoView).not.toHaveBeenCalled();
      }
    });

    it('should use provided block option', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      expect(pagesHost).toBeTruthy();
      if (pagesHost) {
        const mockPage = document.createElement('div');
        mockPage.setAttribute('data-page-index', '0');
        mockPage.scrollIntoView = vi.fn();
        pagesHost.appendChild(mockPage);

        editor.scrollToPosition(50, { block: 'start' });
        expect(mockPage.scrollIntoView).toHaveBeenCalledWith({
          block: 'start',
          inline: 'nearest',
          behavior: 'auto',
        });
      }
    });

    it('should fall back to page scroll when no text element found', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      expect(pagesHost).toBeTruthy();
      if (pagesHost) {
        const mockPage = document.createElement('div');
        mockPage.setAttribute('data-page-index', '0');
        mockPage.scrollIntoView = vi.fn();
        // No text elements with pm data
        pagesHost.appendChild(mockPage);

        const result = editor.scrollToPosition(50);
        expect(result).toBe(true);
        expect(mockPage.scrollIntoView).toHaveBeenCalled();
      }
    });
  });

  describe('scrollToPositionAsync', () => {
    it('should use fast path when page is already mounted', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      expect(pagesHost).toBeTruthy();
      if (pagesHost) {
        const mockPage = document.createElement('div');
        mockPage.setAttribute('data-page-index', '0');
        mockPage.scrollIntoView = vi.fn();
        pagesHost.appendChild(mockPage);

        const result = await editor.scrollToPositionAsync(50);
        expect(result).toBe(true);
        expect(mockPage.scrollIntoView).toHaveBeenCalled();
      }
    });

    it('should return false for invalid position', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());

      expect(await editor.scrollToPositionAsync(NaN)).toBe(false);
    });

    it('should return false when position not in layout', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Position beyond layout
      expect(await editor.scrollToPositionAsync(500)).toBe(false);
    });

    it('should wait for page mount when page is virtualized', async () => {
      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      const pagesHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      expect(pagesHost).toBeTruthy();

      // Start with no page mounted
      // Simulate page mounting after a delay
      setTimeout(() => {
        if (pagesHost) {
          const mockPage = document.createElement('div');
          mockPage.setAttribute('data-page-index', '1');
          mockPage.scrollIntoView = vi.fn();
          pagesHost.appendChild(mockPage);
        }
      }, 100);

      // Position 150 is on page 2 (index 1)
      const result = await editor.scrollToPositionAsync(150);
      expect(result).toBe(true);
    });

    it('should return false and warn when page fails to mount within timeout', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      editor = new PresentationEditor({
        element: container,
        documentId: 'test-doc',
      });

      await vi.waitFor(() => expect(mockIncrementalLayout).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Page 2 never mounts - should timeout
      // Note: This test may be slow due to the 2000ms timeout
      // In real tests, you might want to mock the timeout value
      const result = await editor.scrollToPositionAsync(150);

      // The page never mounted, so it should fail
      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('failed to mount within timeout'));

      consoleWarnSpy.mockRestore();
    });
  });
});
