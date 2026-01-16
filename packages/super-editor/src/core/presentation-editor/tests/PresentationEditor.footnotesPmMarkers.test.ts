import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PresentationEditor } from '../PresentationEditor.js';

let capturedLayoutOptions: any;

vi.mock('../../Editor', () => ({
  Editor: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
    setDocumentMode: vi.fn(),
    setOptions: vi.fn(),
    getJSON: vi.fn(() => ({ type: 'doc', content: [] })),
    isEditable: true,
    schema: {},
    state: {
      selection: { from: 0, to: 0 },
      doc: {
        nodeSize: 100,
        content: { size: 100 },
        descendants: vi.fn((cb: (node: any, pos: number) => void) => {
          cb({ type: { name: 'footnoteReference' }, attrs: { id: '1' }, nodeSize: 1 }, 10);
        }),
      },
    },
    view: { dom: document.createElement('div'), hasFocus: vi.fn(() => false) },
    options: { documentId: 'test', element: document.createElement('div'), mediaFiles: {} },
    converter: {
      headers: {},
      footers: {},
      headerIds: { default: null, ids: [] },
      footerIds: { default: null, ids: [] },
      footnotes: [{ id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }],
    },
    storage: { image: { media: {} } },
  })),
}));

vi.mock('@superdoc/pm-adapter', () => ({
  toFlowBlocks: vi.fn((_: unknown, opts?: any) => {
    if (typeof opts?.blockIdPrefix === 'string' && opts.blockIdPrefix.startsWith('footnote-')) {
      return {
        blocks: [{ kind: 'paragraph', runs: [{ kind: 'text', text: 'Body', pmStart: 5, pmEnd: 9 }] }],
        bookmarks: new Map(),
      };
    }
    return { blocks: [], bookmarks: new Map() };
  }),
}));

vi.mock('@superdoc/layout-bridge', () => ({
  incrementalLayout: vi.fn(async (...args: any[]) => {
    capturedLayoutOptions = args[3];
    return { layout: { pages: [] }, measures: [] };
  }),
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

describe('PresentationEditor - footnote number marker PM position', () => {
  let editor: PresentationEditor;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    capturedLayoutOptions = undefined;
  });

  afterEach(() => {
    editor?.destroy();
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  it('adds pmStart/pmEnd to the data-sd-footnote-number marker run', async () => {
    editor = new PresentationEditor({ element: container });
    await new Promise((r) => setTimeout(r, 100));

    const footnotes = capturedLayoutOptions?.footnotes;
    expect(footnotes).toBeTruthy();
    const blocks = footnotes.blocksById?.get('1');
    expect(blocks?.[0]?.kind).toBe('paragraph');

    const markerRun = blocks?.[0]?.runs?.[0];
    expect(markerRun?.dataAttrs?.['data-sd-footnote-number']).toBe('true');
    expect(markerRun?.pmStart).toBe(5);
    expect(markerRun?.pmEnd).toBe(6);
  });
});
