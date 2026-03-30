import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PresentationEditor } from '../PresentationEditor.js';

let capturedLayoutOptions: any;
let capturedBlocksForLayout: any[] | undefined;

const { mockIncrementalLayout, mockResolveLayout } = vi.hoisted(() => ({
  mockIncrementalLayout: vi.fn(async (...args: any[]) => {
    capturedLayoutOptions = args[3];
    capturedBlocksForLayout = args[2];
    return { layout: { pages: [] }, measures: [] };
  }),
  mockResolveLayout: vi.fn(() => ({ version: 1, flowMode: 'paginated', pageGap: 0, pages: [] })),
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

vi.mock('@superdoc/pm-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@superdoc/pm-adapter')>();
  return {
    ...actual,
    toFlowBlocks: vi.fn((_: unknown, opts?: any) => {
      if (typeof opts?.blockIdPrefix === 'string' && opts.blockIdPrefix.startsWith('footnote-')) {
        return {
          blocks: [
            { kind: 'paragraph', id: 'footnote-body-1', runs: [{ kind: 'text', text: 'Body', pmStart: 5, pmEnd: 9 }] },
          ],
          bookmarks: new Map(),
        };
      }
      return { blocks: [], bookmarks: new Map() };
    }),
  };
});

vi.mock('@superdoc/layout-bridge', () => ({
  incrementalLayout: mockIncrementalLayout,
  normalizeMargin: (value: number | undefined, fallback: number) =>
    Number.isFinite(value) ? (value as number) : fallback,
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
    setVirtualizationPins: vi.fn(),
    getMountedPageIndices: vi.fn(() => []),
    onScroll: vi.fn(),
    setScrollContainer: vi.fn(),
  })),
  DOM_CLASS_NAMES: { PAGE: '', FRAGMENT: '', LINE: '', INLINE_SDT_WRAPPER: '', BLOCK_SDT: '', DOCUMENT_SECTION: '' },
}));

vi.mock('@superdoc/measuring-dom', () => ({ measureBlock: vi.fn(() => ({ width: 100, height: 100 })) }));

vi.mock('@superdoc/layout-resolved', () => ({
  resolveLayout: mockResolveLayout,
}));

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
    capturedBlocksForLayout = undefined;
    mockIncrementalLayout.mockClear();
    mockResolveLayout.mockClear();
    mockIncrementalLayout.mockImplementation(async (...args: any[]) => {
      capturedLayoutOptions = args[3];
      capturedBlocksForLayout = args[2];
      return { layout: { pages: [] }, measures: [] };
    });
    mockResolveLayout.mockImplementation(() => ({ version: 1, flowMode: 'paginated', pageGap: 0, pages: [] }));
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

  it('appends semantic footnotes as end-of-document blocks in semantic flow mode', async () => {
    editor = new PresentationEditor({
      element: container,
      layoutEngineOptions: {
        flowMode: 'semantic',
      },
    });
    await new Promise((r) => setTimeout(r, 100));

    expect(capturedLayoutOptions?.flowMode).toBe('semantic');
    expect(capturedLayoutOptions?.footnotes).toBeUndefined();
    expect(Array.isArray(capturedBlocksForLayout)).toBe(true);

    const blockIds = (capturedBlocksForLayout ?? []).map((block) => block.id);
    expect(blockIds).toContain('__sd_semantic_footnotes_heading');
    expect(blockIds.some((id) => typeof id === 'string' && id.startsWith('__sd_semantic_footnote-1-'))).toBe(true);
  });

  it('does not expose PM ranges on synthetic semantic footnote blocks', async () => {
    editor = new PresentationEditor({
      element: container,
      layoutEngineOptions: {
        flowMode: 'semantic',
      },
    });
    await new Promise((r) => setTimeout(r, 100));

    const semanticBlocks = (capturedBlocksForLayout ?? []).filter((block) =>
      typeof block?.id === 'string' ? block.id.startsWith('__sd_semantic_footnote-') : false,
    );
    expect(semanticBlocks.length).toBeGreaterThan(0);

    const firstRun = semanticBlocks[0]?.runs?.[0];
    expect(firstRun?.pmStart).toBeUndefined();
    expect(firstRun?.pmEnd).toBeUndefined();
  });

  it('passes footnote-injected lookup blocks to resolveLayout', async () => {
    mockIncrementalLayout.mockImplementationOnce(async (...args: any[]) => {
      capturedLayoutOptions = args[3];
      capturedBlocksForLayout = args[2];
      return {
        layout: {
          pageSize: { w: 612, h: 792 },
          pages: [
            {
              number: 1,
              size: { w: 612, h: 792 },
              fragments: [
                {
                  kind: 'drawing',
                  blockId: 'footnote-separator-page-1-col-0',
                  drawingKind: 'vectorShape',
                  x: 0,
                  y: 0,
                  width: 100,
                  height: 1,
                  geometry: { width: 100, height: 1 },
                  scale: 1,
                },
                {
                  kind: 'para',
                  blockId: 'footnote-body-1',
                  fromLine: 0,
                  toLine: 1,
                  x: 0,
                  y: 2,
                  width: 100,
                },
              ],
            },
          ],
        },
        measures: [],
        extraBlocks: [
          { kind: 'paragraph', id: 'footnote-body-1', runs: [{ kind: 'text', text: 'Body' }] },
          {
            kind: 'drawing',
            id: 'footnote-separator-page-1-col-0',
            drawingKind: 'vectorShape',
            geometry: { width: 100, height: 1 },
            shapeKind: 'rect',
            fillColor: '#000000',
            strokeColor: null,
            strokeWidth: 0,
          },
        ],
        extraMeasures: [
          {
            kind: 'paragraph',
            lines: [
              {
                fromRun: 0,
                fromChar: 0,
                toRun: 0,
                toChar: 4,
                width: 100,
                ascent: 8,
                descent: 2,
                lineHeight: 10,
              },
            ],
            totalHeight: 10,
          },
          {
            kind: 'drawing',
            drawingKind: 'vectorShape',
            width: 100,
            height: 1,
            scale: 1,
            naturalWidth: 100,
            naturalHeight: 1,
            geometry: { width: 100, height: 1 },
          },
        ],
      };
    });

    editor = new PresentationEditor({ element: container });
    await new Promise((r) => setTimeout(r, 100));

    expect(mockResolveLayout).toHaveBeenCalled();
    const lastResolveInput = mockResolveLayout.mock.calls.at(-1)?.[0];
    expect(lastResolveInput).toBeTruthy();
    expect(lastResolveInput.blocks.map((block: { id: string }) => block.id)).toEqual(
      expect.arrayContaining(['footnote-body-1', 'footnote-separator-page-1-col-0']),
    );
    expect(lastResolveInput.measures).toHaveLength(lastResolveInput.blocks.length);
  });
});
