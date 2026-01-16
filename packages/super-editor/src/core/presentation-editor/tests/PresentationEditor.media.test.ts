import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PresentationEditor } from '../PresentationEditor.js';

/**
 * Regression test for SD-1313: Images not rendering when loading from persisted YDoc
 *
 * The bug: PresentationEditor passed options.mediaFiles (empty) to toFlowBlocks
 * instead of storage.image.media (populated from YDoc).
 */

let capturedMediaFiles: Record<string, string> | undefined;

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: { media: {} as Record<string, string> },
}));

vi.mock('../../Editor', () => ({
  Editor: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
    setDocumentMode: vi.fn(),
    setOptions: vi.fn(),
    getJSON: vi.fn(() => ({ type: 'doc', content: [] })),
    isEditable: true,
    state: { selection: { from: 0, to: 0 }, doc: { nodeSize: 100, content: { size: 100 }, descendants: vi.fn() } },
    view: { dom: document.createElement('div'), hasFocus: vi.fn(() => false) },
    options: { documentId: 'test', element: document.createElement('div'), mediaFiles: {} },
    converter: {
      headers: {},
      footers: {},
      headerIds: { default: null, ids: [] },
      footerIds: { default: null, ids: [] },
    },
    storage: { image: mockStorage },
  })),
}));

vi.mock('@superdoc/pm-adapter', () => ({
  toFlowBlocks: vi.fn((_, opts) => {
    capturedMediaFiles = opts?.mediaFiles;
    return { blocks: [], bookmarks: new Map() };
  }),
}));

vi.mock('@superdoc/layout-bridge', () => ({
  incrementalLayout: vi.fn(async () => ({ layout: { pages: [] }, measures: [] })),
  selectionToRects: vi.fn(() => []),
  clickToPosition: vi.fn(),
  getFragmentAtPosition: vi.fn(),
  computeLinePmRange: vi.fn(),
  measureCharacterX: vi.fn(),
  extractIdentifierFromConverter: vi.fn(),
  getHeaderFooterType: vi.fn(),
  getBucketForPageNumber: vi.fn(),
  getBucketRepresentative: vi.fn(),
  buildMultiSectionIdentifier: vi.fn(),
  getHeaderFooterTypeForSection: vi.fn(),
  layoutHeaderFooterWithCache: vi.fn(),
  computeDisplayPageNumber: vi.fn(),
  findWordBoundaries: vi.fn(),
  findParagraphBoundaries: vi.fn(),
  createDragHandler: vi.fn(),
  PageGeometryHelper: vi.fn(() => ({
    updateLayout: vi.fn(),
    getPageIndexAtY: vi.fn(() => 0),
    getNearestPageIndex: vi.fn(() => 0),
    getPageTop: vi.fn(() => 0),
    getPageGap: vi.fn(() => 0),
    getLayout: vi.fn(() => ({ pages: [] })),
  })),
}));

vi.mock('@superdoc/painter-dom', () => ({
  createDomPainter: vi.fn(() => ({
    paint: vi.fn(),
    destroy: vi.fn(),
    setZoom: vi.fn(),
    setLayoutMode: vi.fn(),
    setProviders: vi.fn(),
    setData: vi.fn(),
  })),
  DOM_CLASS_NAMES: { PAGE: '', FRAGMENT: '', LINE: '', INLINE_SDT_WRAPPER: '', BLOCK_SDT: '', DOCUMENT_SECTION: '' },
}));

vi.mock('@superdoc/measuring-dom', () => ({ measureBlock: vi.fn(() => ({ width: 100, height: 100 })) }));

vi.mock('../../header-footer/HeaderFooterRegistry', () => ({
  HeaderFooterEditorManager: vi.fn(() => ({
    createEditor: vi.fn(),
    destroyEditor: vi.fn(),
    getEditor: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
  })),
  HeaderFooterLayoutAdapter: vi.fn(() => ({
    clear: vi.fn(),
    getBatch: vi.fn(() => []),
    getBlocksByRId: vi.fn(() => new Map()),
  })),
}));

vi.mock('../../header-footer/EditorOverlayManager', () => ({
  EditorOverlayManager: vi.fn(() => ({
    showEditingOverlay: vi.fn(() => ({ success: true, editorHost: document.createElement('div') })),
    hideEditingOverlay: vi.fn(),
    showSelectionOverlay: vi.fn(),
    hideSelectionOverlay: vi.fn(),
    setOnDimmingClick: vi.fn(),
    getActiveEditorHost: vi.fn(() => null),
    destroy: vi.fn(),
  })),
}));

vi.mock('y-prosemirror', () => ({
  ySyncPluginKey: { getState: vi.fn(() => ({ type: {}, binding: { mapping: new Map() } })) },
  absolutePositionToRelativePosition: vi.fn((pos) => ({ type: 'relative', pos })),
  relativePositionToAbsolutePosition: vi.fn((relPos) => relPos?.pos ?? null),
}));

describe('SD-1313: toFlowBlocks receives media from storage.image.media', () => {
  let editor: PresentationEditor;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    capturedMediaFiles = undefined;
    mockStorage.media = {};
  });

  afterEach(() => {
    editor?.destroy();
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  it('passes storage.image.media to toFlowBlocks', async () => {
    mockStorage.media = { 'word/media/image1.jpeg': 'base64-data' };

    editor = new PresentationEditor({ element: container });
    await new Promise((r) => setTimeout(r, 100));

    expect(capturedMediaFiles?.['word/media/image1.jpeg']).toBe('base64-data');
  });

  it('includes all media entries from storage', async () => {
    mockStorage.media = {
      'word/media/image1.jpeg': 'data-1',
      'word/media/image2.png': 'data-2',
    };

    editor = new PresentationEditor({ element: container });
    await new Promise((r) => setTimeout(r, 100));

    expect(Object.keys(capturedMediaFiles || {})).toHaveLength(2);
  });
});
