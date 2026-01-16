import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PresentationEditor } from '../PresentationEditor.js';
const {
  createDefaultConverter,
  mockClickToPosition,
  mockIncrementalLayout,
  mockToFlowBlocks,
  mockSelectionToRects,
  mockCreateDomPainter,
  mockEditorConverterStore,
  mockEditorOverlayManager,
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
  };
});

vi.mock('../../Editor.js', () => {
  return {
    Editor: vi.fn().mockImplementation(() => {
      const domElement = document.createElement('div');

      return {
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
        },
        view: {
          dom: domElement,
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

vi.mock('@superdoc/pm-adapter', () => ({
  toFlowBlocks: mockToFlowBlocks,
}));

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

describe('PresentationEditor.getElementAtPos', () => {
  let container: HTMLElement;
  let editor: PresentationEditor;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    vi.clearAllMocks();
    mockEditorConverterStore.current = createDefaultConverter();
    mockEditorConverterStore.mediaFiles = {};

    editor = new PresentationEditor({
      element: container,
      documentId: 'test-doc',
    });
  });

  afterEach(() => {
    editor?.destroy();
    container?.remove();
  });

  it('returns a painted element from the DomPositionIndex', () => {
    const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
    const span = document.createElement('span');
    span.dataset.pmStart = '2';
    span.dataset.pmEnd = '4';
    span.textContent = 'hello';
    painterHost.appendChild(span);

    const found = editor.getElementAtPos(3, { forceRebuild: true });

    expect(found).toBe(span);
  });

  it('can fall back to elementFromPoint when requested', () => {
    const painterHost = container.querySelector('.presentation-editor__pages') as HTMLElement;
    const span = document.createElement('span');
    span.dataset.pmStart = '10';
    span.dataset.pmEnd = '12';
    painterHost.appendChild(span);

    const rectsSpy = vi.spyOn(editor, 'getRangeRects').mockReturnValue([
      {
        pageIndex: 0,
        left: 10,
        top: 20,
        right: 12,
        bottom: 22,
        width: 2,
        height: 2,
      },
    ]);
    const doc = container.ownerDocument;
    if (typeof doc.elementFromPoint !== 'function') {
      Object.defineProperty(doc, 'elementFromPoint', {
        value: () => null,
        configurable: true,
      });
    }
    const elementFromPointSpy = vi.spyOn(doc, 'elementFromPoint').mockReturnValue(span);

    const found = editor.getElementAtPos(99, { fallbackToCoords: true, forceRebuild: true });

    expect(rectsSpy).toHaveBeenCalledWith(99, 99);
    expect(elementFromPointSpy).toHaveBeenCalled();
    expect(found).toBe(span);
  });

  it('returns null for invalid positions', () => {
    expect(editor.getElementAtPos(NaN)).toBeNull();
  });
});
