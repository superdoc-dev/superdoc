import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DecorationSet } from 'prosemirror-view';
import { PluginKey } from 'prosemirror-state';

import { PresentationEditor } from '../PresentationEditor.js';

// Create a plugin key for our test highlight plugin
const testHighlightPluginKey = new PluginKey('testHighlight');

/**
 * Creates a mock decoration object that mimics ProseMirror's Decoration.inline structure.
 * The sync method accesses decoration.inline, decoration.from, decoration.to, and decoration.type.attrs
 */
const createMockDecoration = (from: number, to: number, attrs: Record<string, string>) => ({
  inline: true,
  from,
  to,
  type: { attrs },
});

/**
 * Creates a mock DecorationSet that the sync method can iterate over.
 * The sync method calls decorationSet.find(0, docSize) and checks instanceof DecorationSet.
 */
const createMockDecorationSet = (
  decorations: Array<{ from: number; to: number; class?: string; attrs?: Record<string, string> }>,
) => {
  const mockDecorations = decorations.map(({ from, to, class: className, attrs }) =>
    createMockDecoration(from, to, {
      ...(className ? { class: className } : {}),
      ...attrs,
    }),
  );

  // Create an object that passes instanceof DecorationSet check by using the actual prototype
  const mockSet = Object.create(DecorationSet.prototype);
  mockSet.find = () => mockDecorations;
  return mockSet;
};

/**
 * Creates a mock highlight plugin similar to customer implementations.
 * Only mocks spec.key and props.decorations() - the two properties #syncDecorationAttributes
 * reads. Real plugins have state.init/apply logic, but the sync method just reads the current
 * DecorationSet, so we return a static snapshot.
 */
const createMockHighlightPlugin = (
  decorations: Array<{ from: number; to: number; class?: string; attrs?: Record<string, string> }>,
) => {
  return {
    spec: {
      key: testHighlightPluginKey,
    },
    props: {
      decorations: () => createMockDecorationSet(decorations),
    },
  };
};

/**
 * Creates a mutable mock plugin whose decoration set can be swapped at runtime.
 * Simulates the real customer flow: a command dispatches a setMeta transaction,
 * the plugin's apply() returns a new DecorationSet, and the bridge picks it up.
 */
const createMutableMockPlugin = () => {
  let currentSet: ReturnType<typeof createMockDecorationSet> = createMockDecorationSet([]);
  const plugin = {
    spec: { key: testHighlightPluginKey },
    props: { decorations: () => currentSet },
  };
  const setDecorations = (
    items: Array<{ from: number; to: number; class?: string; attrs?: Record<string, string> }>,
  ) => {
    currentSet = items.length > 0 ? createMockDecorationSet(items) : DecorationSet.empty;
  };
  return { plugin, setDecorations };
};

/**
 * PresentationEditor requires extensive mocking due to its many dependencies.
 * This follows the established testing pattern used across other PresentationEditor
 * test files (e.g., getElementAtPos, zoom, collaboration tests).
 */
const {
  createDefaultConverter,
  mockClickToPosition,
  mockIncrementalLayout,
  mockToFlowBlocks,
  mockSelectionToRects,
  mockCreateDomPainter,
  mockEditorConverterStore,
  mockEditorOverlayManager,
  mockPlugins,
  mockEditorOn,
} = vi.hoisted(() => {
  const createDefaultConverter = () => ({
    headers: {},
    footers: {},
    headerIds: {
      default: null,
      first: null,
      even: null,
      odd: null,
      ids: [],
    },
    footerIds: {
      default: null,
      first: null,
      even: null,
      odd: null,
      ids: [],
    },
  });

  const converterStore = {
    current: createDefaultConverter() as ReturnType<typeof createDefaultConverter> & Record<string, unknown>,
    mediaFiles: {} as Record<string, string>,
  };

  // Plugins array that tests can modify
  const plugins: Array<unknown> = [];

  // Shared mock for editor.on() — lets tests extract registered event handlers.
  const editorOn = vi.fn();

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
    mockEditorConverterStore: converterStore,
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
    mockPlugins: plugins,
    mockEditorOn: editorOn,
  };
});

vi.mock('../../Editor.js', () => {
  return {
    Editor: vi.fn().mockImplementation(() => {
      const domElement = document.createElement('div');

      const mockState = {
        selection: { from: 0, to: 0 },
        plugins: mockPlugins,
        doc: {
          nodeSize: 1000,
          content: {
            size: 998,
          },
          descendants: vi.fn(),
          nodesBetween: vi.fn(),
          resolve: vi.fn((pos: number) => ({
            pos,
            depth: 0,
            parent: { inlineContent: true },
          })),
        },
        tr: {
          setSelection: vi.fn().mockReturnThis(),
        },
      };

      return {
        setDocumentMode: vi.fn(),
        setOptions: vi.fn(),
        on: mockEditorOn,
        off: vi.fn(),
        destroy: vi.fn(),
        getJSON: vi.fn(() => ({ type: 'doc', content: [] })),
        isEditable: true,
        state: mockState,
        view: {
          dom: domElement,
          focus: vi.fn(),
          dispatch: vi.fn(),
          state: mockState, // Also expose state on view for #syncDecorationAttributes
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

vi.mock('@superdoc/pm-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@superdoc/pm-adapter')>();
  return {
    ...actual,
    toFlowBlocks: mockToFlowBlocks,
  };
});

vi.mock('@superdoc/layout-bridge', () => ({
  incrementalLayout: mockIncrementalLayout,
  selectionToRects: mockSelectionToRects,
  clickToPosition: mockClickToPosition,
  createDragHandler: vi.fn(() => () => {}),
  getFragmentAtPosition: vi.fn(() => null),
  computeLinePmRange: vi.fn(() => ({ from: 0, to: 0 })),
  measureCharacterX: vi.fn(() => 0),
  extractIdentifierFromConverter: vi.fn(() => ({
    extractHeaderId: vi.fn(() => null),
    extractFooterId: vi.fn(() => null),
  })),
  buildMultiSectionIdentifier: vi.fn(() => ({ sections: [] })),
  getHeaderFooterType: vi.fn(() => null),
  getHeaderFooterTypeForSection: vi.fn(() => null),
  getBucketForPageNumber: vi.fn(() => 0),
  getBucketRepresentative: vi.fn(() => 0),
  layoutHeaderFooterWithCache: vi.fn(async () => ({})),
  computeDisplayPageNumber: vi.fn((pages: Array<{ number?: number }>) =>
    pages.map((p) => ({ displayText: String(p.number ?? 1) })),
  ),
  PageGeometryHelper: vi.fn().mockImplementation(() => ({
    updateLayout: vi.fn(),
    getPageIndexAtY: vi.fn(() => 0),
    getNearestPageIndex: vi.fn(() => 0),
    getPageTop: vi.fn(() => 0),
    getPageGap: vi.fn(() => 0),
    getLayout: vi.fn(() => ({ pages: [] })),
  })),
}));

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

vi.mock('../../header-footer/EditorOverlayManager.js', () => ({
  EditorOverlayManager: mockEditorOverlayManager,
}));

/**
 * Integration tests for decoration bridge sync via PresentationEditor.
 *
 * These tests verify that DecorationBridge is wired correctly into PresentationEditor's
 * lifecycle (observer-triggered rebuild → sync). For unit-level tests of bridge reconciliation
 * logic, see DecorationBridge.test.ts.
 *
 * Coverage:
 * - Class syncing: single class, multiple classes, multiple elements, range boundaries
 * - Attribute syncing: data-* attributes, combined class + attrs
 * - Multiple decorations: non-overlapping ranges, overlapping ranges
 * - Edge cases: empty sets, plugins without decorations, empty decorations, attribute filtering
 * - Style properties applied at the property level (setProperty/removeProperty)
 */
describe('PresentationEditor.decorationSync', () => {
  let container: HTMLElement;
  let editor: PresentationEditor;
  let painterHost: HTMLElement;

  /**
   * Waits for the DomPositionIndexObserverManager to process DOM mutations.
   *
   * When we append elements to painterHost, the MutationObserver triggers
   * scheduleRebuild(), which queues onRebuild() via requestAnimationFrame.
   * The observer has built-in debounce protection, so multiple mutations
   * only trigger one rebuild.
   *
   * We use a double RAF here as a waiting mechanism (not a trigger):
   * - Frame 1: The observer's scheduled RAF callback runs
   * - Frame 2: We know Frame 1 completed, safe to assert
   *
   * This doesn't cause duplicate onRebuild calls - it's just ensuring
   * the prior frame's work finished before we check results.
   */
  const waitForSync = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });

  /**
   * Sets up the editor with the given decorations and returns the painterHost.
   * Handles plugin creation, registration, and editor instantiation.
   */
  const setupWithDecorations = (
    decorations: Array<{ from: number; to: number; class?: string; attrs?: Record<string, string> }>,
  ) => {
    const plugin = createMockHighlightPlugin(decorations);
    mockPlugins.push(plugin);

    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });

    painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
  };

  /**
   * Creates a painted span element with PM position attributes and appends it to painterHost.
   * Returns the created element for assertions.
   */
  const addSpan = (start: number, end: number, text = 'text'): HTMLSpanElement => {
    const span = document.createElement('span');
    span.dataset.pmStart = String(start);
    span.dataset.pmEnd = String(end);
    span.textContent = text;
    painterHost.appendChild(span);
    return span;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    vi.clearAllMocks();
    mockEditorConverterStore.current = createDefaultConverter();
    mockEditorConverterStore.mediaFiles = {};
    mockPlugins.length = 0;
  });

  afterEach(() => {
    editor?.destroy();
    container?.remove();
  });

  describe('class decoration syncing', () => {
    it('applies decoration classes to painted elements within the decoration range', async () => {
      setupWithDecorations([{ from: 5, to: 15, class: 'highlight-selection' }]);
      const span = addSpan(5, 15);

      await waitForSync();

      expect(span.classList.contains('highlight-selection')).toBe(true);
    });

    it('applies decoration classes to multiple elements spanning the range', async () => {
      setupWithDecorations([{ from: 5, to: 25, class: 'highlight-selection' }]);
      const span1 = addSpan(5, 12);
      const span2 = addSpan(12, 20);
      const span3 = addSpan(20, 25);

      await waitForSync();

      expect(span1.classList.contains('highlight-selection')).toBe(true);
      expect(span2.classList.contains('highlight-selection')).toBe(true);
      expect(span3.classList.contains('highlight-selection')).toBe(true);
    });

    it('applies multiple CSS classes from a single decoration', async () => {
      setupWithDecorations([{ from: 5, to: 15, class: 'highlight-selection focus-active custom-style' }]);
      const span = addSpan(5, 15);

      await waitForSync();

      expect(span.classList.contains('highlight-selection')).toBe(true);
      expect(span.classList.contains('focus-active')).toBe(true);
      expect(span.classList.contains('custom-style')).toBe(true);
    });

    it('does not apply classes to elements outside the decoration range', async () => {
      setupWithDecorations([{ from: 10, to: 20, class: 'highlight-selection' }]);
      const spanBefore = addSpan(1, 9, 'before');
      const spanWithin = addSpan(10, 20, 'within');
      const spanAfter = addSpan(21, 30, 'after');

      await waitForSync();

      expect(spanBefore.classList.contains('highlight-selection')).toBe(false);
      expect(spanWithin.classList.contains('highlight-selection')).toBe(true);
      expect(spanAfter.classList.contains('highlight-selection')).toBe(false);
    });
  });

  describe('data attribute syncing', () => {
    it('applies data-* attributes from decorations to painted elements', async () => {
      setupWithDecorations([
        { from: 5, to: 15, attrs: { 'data-highlight-id': 'highlight-123', 'data-clause-type': 'important' } },
      ]);
      const span = addSpan(5, 15);

      await waitForSync();

      expect(span.getAttribute('data-highlight-id')).toBe('highlight-123');
      expect(span.getAttribute('data-clause-type')).toBe('important');
    });

    it('applies style properties from decoration style attribute', async () => {
      setupWithDecorations([{ from: 5, to: 15, attrs: { style: 'background-color: yellow;' } }]);
      const span = addSpan(5, 15);

      await waitForSync();

      expect(span.style.getPropertyValue('background-color')).toBe('yellow');
    });

    it('applies both classes and data attributes together', async () => {
      setupWithDecorations([
        { from: 5, to: 15, class: 'highlight-selection', attrs: { 'data-highlight-id': 'test-456' } },
      ]);
      const span = addSpan(5, 15);

      await waitForSync();

      expect(span.classList.contains('highlight-selection')).toBe(true);
      expect(span.getAttribute('data-highlight-id')).toBe('test-456');
    });
  });

  describe('multiple decorations', () => {
    it('handles multiple non-overlapping decorations', async () => {
      setupWithDecorations([
        { from: 5, to: 10, class: 'highlight-a' },
        { from: 15, to: 20, class: 'highlight-b' },
      ]);
      const span1 = addSpan(5, 10);
      const span2 = addSpan(15, 20);

      await waitForSync();

      expect(span1.classList.contains('highlight-a')).toBe(true);
      expect(span1.classList.contains('highlight-b')).toBe(false);
      expect(span2.classList.contains('highlight-a')).toBe(false);
      expect(span2.classList.contains('highlight-b')).toBe(true);
    });

    it('handles overlapping decorations by applying all classes', async () => {
      setupWithDecorations([
        { from: 5, to: 20, class: 'highlight-outer' },
        { from: 10, to: 15, class: 'highlight-inner' },
      ]);
      const spanOverlap = addSpan(10, 15, 'overlap');
      const spanOuter = addSpan(5, 10, 'outer only');

      await waitForSync();

      expect(spanOverlap.classList.contains('highlight-outer')).toBe(true);
      expect(spanOverlap.classList.contains('highlight-inner')).toBe(true);
      expect(spanOuter.classList.contains('highlight-outer')).toBe(true);
      expect(spanOuter.classList.contains('highlight-inner')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty decoration set gracefully', async () => {
      setupWithDecorations([]);
      const span = addSpan(5, 15);

      await waitForSync();

      expect(span.classList.length).toBe(0);
    });

    it('handles plugins without decorations prop', async () => {
      // Manually push a plugin without decorations prop (can't use setupWithDecorations)
      mockPlugins.push({ spec: { key: new PluginKey('noDecorations') }, props: {} });

      editor = new PresentationEditor({ element: container, documentId: 'test-doc' });
      painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;

      const span = addSpan(5, 15);

      await waitForSync();

      expect(span.classList.length).toBe(0);
    });

    it('handles decorations with no class or attributes gracefully', async () => {
      setupWithDecorations([{ from: 5, to: 15 }]);
      const span = addSpan(5, 15);

      await waitForSync();

      expect(span.classList.length).toBe(0);
    });

    it('ignores non-data and non-style attributes', async () => {
      setupWithDecorations([
        { from: 5, to: 15, attrs: { 'data-valid': 'yes', id: 'should-be-ignored', onclick: 'alert("xss")' } },
      ]);
      const span = addSpan(5, 15);

      await waitForSync();

      expect(span.getAttribute('data-valid')).toBe('yes');
      expect(span.getAttribute('id')).toBeNull();
      expect(span.getAttribute('onclick')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Transaction-driven sync (the real customer flow)
  // -----------------------------------------------------------------------

  describe('transaction-driven decoration sync', () => {
    /**
     * Extracts the 'transaction' event handler that PresentationEditor registered
     * on the mock editor. This simulates the real customer flow: a command dispatches
     * a setMeta transaction → Editor fires 'transaction' → bridge syncs.
     */
    const getTransactionHandler = (): (() => void) => {
      const onCalls: Array<[string, () => void]> = mockEditorOn.mock.calls;
      const match = onCalls.find(([event]) => event === 'transaction');
      if (!match) throw new Error('No transaction handler registered on mock editor');
      return match[1];
    };

    it('syncs decorations when a transaction fires (setMeta customer flow)', async () => {
      const { plugin, setDecorations } = createMutableMockPlugin();
      mockPlugins.push(plugin);

      editor = new PresentationEditor({ element: container, documentId: 'test-doc' });
      painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const span = addSpan(5, 15);

      // Wait for initial MutationObserver sync (no decorations yet).
      await waitForSync();
      expect(span.classList.contains('highlight-selection')).toBe(false);

      // Simulate the customer command: plugin state updates, then transaction fires.
      setDecorations([{ from: 5, to: 15, class: 'highlight-selection' }]);
      const fireTransaction = getTransactionHandler();
      fireTransaction();

      await waitForSync();
      expect(span.classList.contains('highlight-selection')).toBe(true);
    });

    it('clears decorations when plugin state is emptied via transaction', async () => {
      const { plugin, setDecorations } = createMutableMockPlugin();
      setDecorations([{ from: 5, to: 15, class: 'highlight-selection' }]);
      mockPlugins.push(plugin);

      editor = new PresentationEditor({ element: container, documentId: 'test-doc' });
      painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
      const span = addSpan(5, 15);

      // Wait for initial sync — highlight should be applied.
      await waitForSync();
      expect(span.classList.contains('highlight-selection')).toBe(true);

      // Clear decorations and fire transaction (simulates clearHighlight command).
      setDecorations([]);
      const fireTransaction = getTransactionHandler();
      fireTransaction();

      await waitForSync();
      expect(span.classList.contains('highlight-selection')).toBe(false);
    });
  });
});
