/**
 * Type Declaration Verification Tests
 *
 * This test file verifies that the type declarations in index.d.ts accurately
 * reflect the actual runtime behavior of the exported classes and functions.
 *
 * These tests serve two purposes:
 * 1. Compile-time: TypeScript will error if declared types don't match usage
 * 2. Runtime: Assertions verify that actual return values have expected shapes
 *
 * IMPORTANT: Tests use EXACT key matching - objects must have exactly the
 * declared properties, no more and no less. This catches both missing properties
 * AND extra undeclared properties that consumers might accidentally rely on.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PresentationEditor } from './core/presentation-editor/PresentationEditor.js';

// ============================================
// EXACT SHAPE VERIFICATION HELPERS
// ============================================

/**
 * Get all own enumerable keys of an object (excluding inherited properties)
 */
function getOwnKeys(obj: object): string[] {
  return Object.keys(obj).sort();
}

/**
 * Assert that an object has EXACTLY the specified keys - no more, no less.
 * This is stricter than just checking required properties exist.
 */
function assertExactKeys(obj: object, expectedKeys: string[], context: string): void {
  const actualKeys = getOwnKeys(obj);
  const expected = [...expectedKeys].sort();

  const missing = expected.filter((k) => !actualKeys.includes(k));
  const extra = actualKeys.filter((k) => !expected.includes(k));

  if (missing.length > 0 || extra.length > 0) {
    const messages: string[] = [];
    if (missing.length > 0) {
      messages.push(`Missing keys: ${missing.join(', ')}`);
    }
    if (extra.length > 0) {
      messages.push(`Extra undeclared keys: ${extra.join(', ')}`);
    }
    throw new Error(
      `${context}: ${messages.join('. ')}. Expected: [${expected.join(', ')}], Got: [${actualKeys.join(', ')}]`,
    );
  }
}

/**
 * Assert that a value is of the expected primitive type
 */
function assertType(value: unknown, expectedType: string, context: string): void {
  const actualType = typeof value;
  if (actualType !== expectedType) {
    throw new Error(`${context}: Expected type '${expectedType}', got '${actualType}'`);
  }
}

// ============================================
// INTERFACE SHAPE DEFINITIONS (from index.d.ts)
// ============================================

/** Expected keys for PositionHit interface */
const POSITION_HIT_KEYS = ['pos', 'layoutEpoch', 'blockId', 'pageIndex', 'column', 'lineIndex'] as const;

/** Expected keys for BoundingRect interface */
const BOUNDING_RECT_KEYS = ['top', 'left', 'bottom', 'right', 'width', 'height'] as const;

/** Expected keys for RangeRect interface */
const RANGE_RECT_KEYS = ['pageIndex', 'left', 'right', 'top', 'bottom', 'width', 'height'] as const;

/** Expected keys for LayoutError interface */
const LAYOUT_ERROR_KEYS = ['phase', 'error', 'timestamp'] as const;

/** Expected keys for RemoteCursorState interface */
const REMOTE_CURSOR_STATE_KEYS = ['clientId', 'user', 'anchor', 'head', 'updatedAt'] as const;

/** Expected keys for RemoteUserInfo interface (color required, name/email optional) */
const REMOTE_USER_INFO_REQUIRED_KEY = 'color';

/** Expected keys for getCurrentSectionPageStyles return type */
const SECTION_PAGE_STYLES_KEYS = ['pageSize', 'pageMargins', 'sectionIndex', 'orientation'] as const;
const SECTION_PAGE_SIZE_KEYS = ['width', 'height'] as const;
const SECTION_PAGE_MARGINS_KEYS = ['left', 'right', 'top', 'bottom'] as const;

/** Expected keys for getLayoutSnapshot return type */
const LAYOUT_SNAPSHOT_KEYS = ['blocks', 'measures', 'layout', 'sectionMetadata'] as const;

/** Required keys for LayoutPage interface (number and fragments are required) */
const LAYOUT_PAGE_REQUIRED_KEYS = ['number', 'fragments'] as const;

/** Required keys for FlowBlock interface */
const FLOW_BLOCK_REQUIRED_KEYS = ['id', 'type', 'pmStart', 'pmEnd'] as const;

/** Required keys for Measure interface */
const MEASURE_REQUIRED_KEYS = ['blockId', 'width', 'height'] as const;

/** Required keys for Layout interface */
const LAYOUT_REQUIRED_KEYS = ['pageSize', 'pages'] as const;

/** Required keys for SectionMetadata interface */
const SECTION_METADATA_REQUIRED_KEYS = ['sectionIndex', 'startPage', 'endPage'] as const;

/** Expected keys for PaintSnapshot interface */
const PAINT_SNAPSHOT_KEYS = ['formatVersion', 'pageCount', 'lineCount', 'markerCount', 'tabCount', 'pages'] as const;

/** Expected keys for normalizeClientPoint return type */
const NORMALIZE_CLIENT_POINT_KEYS = ['x', 'y', 'pageIndex', 'pageLocalY'] as const;

/** Expected keys for posAtCoords return type */
const POS_AT_COORDS_KEYS = ['pos', 'inside'] as const;

// ============================================
// SHAPE ASSERTION FUNCTIONS
// ============================================

function assertPositionHitShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  assertExactKeys(obj, [...POSITION_HIT_KEYS], context);

  assertType(obj.pos, 'number', `${context}.pos`);
  assertType(obj.layoutEpoch, 'number', `${context}.layoutEpoch`);
  assertType(obj.blockId, 'string', `${context}.blockId`);
  assertType(obj.pageIndex, 'number', `${context}.pageIndex`);
  assertType(obj.column, 'number', `${context}.column`);
  assertType(obj.lineIndex, 'number', `${context}.lineIndex`);
}

function assertBoundingRectShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  assertExactKeys(obj, [...BOUNDING_RECT_KEYS], context);

  assertType(obj.top, 'number', `${context}.top`);
  assertType(obj.left, 'number', `${context}.left`);
  assertType(obj.bottom, 'number', `${context}.bottom`);
  assertType(obj.right, 'number', `${context}.right`);
  assertType(obj.width, 'number', `${context}.width`);
  assertType(obj.height, 'number', `${context}.height`);
}

function assertRangeRectShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  assertExactKeys(obj, [...RANGE_RECT_KEYS], context);

  assertType(obj.pageIndex, 'number', `${context}.pageIndex`);
  assertType(obj.left, 'number', `${context}.left`);
  assertType(obj.right, 'number', `${context}.right`);
  assertType(obj.top, 'number', `${context}.top`);
  assertType(obj.bottom, 'number', `${context}.bottom`);
  assertType(obj.width, 'number', `${context}.width`);
  assertType(obj.height, 'number', `${context}.height`);
}

function assertLayoutErrorShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  assertExactKeys(obj, [...LAYOUT_ERROR_KEYS], context);

  expect(['initialization', 'render']).toContain(obj.phase);
  expect(obj.error).toBeInstanceOf(Error);
  assertType(obj.timestamp, 'number', `${context}.timestamp`);
}

function assertRemoteCursorStateShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  assertExactKeys(obj, [...REMOTE_CURSOR_STATE_KEYS], context);

  assertType(obj.clientId, 'number', `${context}.clientId`);
  assertType(obj.anchor, 'number', `${context}.anchor`);
  assertType(obj.head, 'number', `${context}.head`);
  assertType(obj.updatedAt, 'number', `${context}.updatedAt`);

  // user is RemoteUserInfo
  expect(obj.user).toBeTypeOf('object');
  const user = obj.user as Record<string, unknown>;
  // color is required
  expect(user).toHaveProperty(REMOTE_USER_INFO_REQUIRED_KEY);
  assertType(user.color, 'string', `${context}.user.color`);
  // name and email are optional but if present must be strings
  if ('name' in user && user.name !== undefined) {
    assertType(user.name, 'string', `${context}.user.name`);
  }
  if ('email' in user && user.email !== undefined) {
    assertType(user.email, 'string', `${context}.user.email`);
  }
}

function assertSectionPageStylesShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  assertExactKeys(obj, [...SECTION_PAGE_STYLES_KEYS], context);

  // pageSize: { width: number; height: number }
  expect(obj.pageSize).toBeTypeOf('object');
  const pageSize = obj.pageSize as Record<string, unknown>;
  assertExactKeys(pageSize, [...SECTION_PAGE_SIZE_KEYS], `${context}.pageSize`);
  assertType(pageSize.width, 'number', `${context}.pageSize.width`);
  assertType(pageSize.height, 'number', `${context}.pageSize.height`);

  // pageMargins: { left, right, top, bottom }
  expect(obj.pageMargins).toBeTypeOf('object');
  const pageMargins = obj.pageMargins as Record<string, unknown>;
  assertExactKeys(pageMargins, [...SECTION_PAGE_MARGINS_KEYS], `${context}.pageMargins`);
  assertType(pageMargins.left, 'number', `${context}.pageMargins.left`);
  assertType(pageMargins.right, 'number', `${context}.pageMargins.right`);
  assertType(pageMargins.top, 'number', `${context}.pageMargins.top`);
  assertType(pageMargins.bottom, 'number', `${context}.pageMargins.bottom`);

  // sectionIndex: number
  assertType(obj.sectionIndex, 'number', `${context}.sectionIndex`);

  // orientation: 'portrait' | 'landscape'
  expect(['portrait', 'landscape']).toContain(obj.orientation);
}

function assertLayoutSnapshotShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  assertExactKeys(obj, [...LAYOUT_SNAPSHOT_KEYS], context);

  expect(Array.isArray(obj.blocks)).toBe(true);
  expect(Array.isArray(obj.measures)).toBe(true);
  expect(Array.isArray(obj.sectionMetadata)).toBe(true);

  // Verify blocks have FlowBlock shape
  (obj.blocks as unknown[]).forEach((block, i) => {
    assertFlowBlockShape(block, `${context}.blocks[${i}]`);
  });

  // Verify measures have Measure shape
  (obj.measures as unknown[]).forEach((measure, i) => {
    assertMeasureShape(measure, `${context}.measures[${i}]`);
  });

  // Verify sectionMetadata entries have SectionMetadata shape
  (obj.sectionMetadata as unknown[]).forEach((meta, i) => {
    assertSectionMetadataShape(meta, `${context}.sectionMetadata[${i}]`);
  });

  // layout can be Layout | null
  if (obj.layout !== null) {
    assertLayoutShape(obj.layout, `${context}.layout`);
  }
}

function assertLayoutPageShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  // Check required keys exist
  for (const key of LAYOUT_PAGE_REQUIRED_KEYS) {
    expect(obj).toHaveProperty(key);
  }

  assertType(obj.number, 'number', `${context}.number`);
  expect(Array.isArray(obj.fragments)).toBe(true);

  // Optional properties type checks
  if ('margins' in obj && obj.margins != null) {
    expect(obj.margins).toBeTypeOf('object');
  }
  if ('size' in obj && obj.size != null) {
    const size = obj.size as Record<string, unknown>;
    expect(size).toHaveProperty('w');
    expect(size).toHaveProperty('h');
  }
  if ('orientation' in obj && obj.orientation != null) {
    expect(['portrait', 'landscape']).toContain(obj.orientation);
  }
  if ('sectionIndex' in obj && obj.sectionIndex != null) {
    assertType(obj.sectionIndex, 'number', `${context}.sectionIndex`);
  }
}

function assertFlowBlockShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  // Check required keys exist
  for (const key of FLOW_BLOCK_REQUIRED_KEYS) {
    expect(obj).toHaveProperty(key);
  }

  assertType(obj.id, 'string', `${context}.id`);
  assertType(obj.type, 'string', `${context}.type`);
  assertType(obj.pmStart, 'number', `${context}.pmStart`);
  assertType(obj.pmEnd, 'number', `${context}.pmEnd`);
}

function assertMeasureShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  // Check required keys exist
  for (const key of MEASURE_REQUIRED_KEYS) {
    expect(obj).toHaveProperty(key);
  }

  assertType(obj.blockId, 'string', `${context}.blockId`);
  assertType(obj.width, 'number', `${context}.width`);
  assertType(obj.height, 'number', `${context}.height`);

  // lines is optional
  if ('lines' in obj && obj.lines != null) {
    expect(Array.isArray(obj.lines)).toBe(true);
  }
}

function assertLayoutShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  // Check required keys exist
  for (const key of LAYOUT_REQUIRED_KEYS) {
    expect(obj).toHaveProperty(key);
  }

  // pageSize: { w, h }
  const pageSize = obj.pageSize as Record<string, unknown>;
  expect(pageSize).toHaveProperty('w');
  expect(pageSize).toHaveProperty('h');
  assertType(pageSize.w, 'number', `${context}.pageSize.w`);
  assertType(pageSize.h, 'number', `${context}.pageSize.h`);

  // pages: LayoutPage[]
  expect(Array.isArray(obj.pages)).toBe(true);
  (obj.pages as unknown[]).forEach((page, i) => {
    assertLayoutPageShape(page, `${context}.pages[${i}]`);
  });

  // Optional properties
  if ('pageGap' in obj && obj.pageGap != null) {
    assertType(obj.pageGap, 'number', `${context}.pageGap`);
  }
  if ('layoutEpoch' in obj && obj.layoutEpoch != null) {
    assertType(obj.layoutEpoch, 'number', `${context}.layoutEpoch`);
  }
}

function assertSectionMetadataShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  // Check required keys exist
  for (const key of SECTION_METADATA_REQUIRED_KEYS) {
    expect(obj).toHaveProperty(key);
  }

  assertType(obj.sectionIndex, 'number', `${context}.sectionIndex`);
  assertType(obj.startPage, 'number', `${context}.startPage`);
  assertType(obj.endPage, 'number', `${context}.endPage`);
}

function assertPaintSnapshotShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  assertExactKeys(obj, [...PAINT_SNAPSHOT_KEYS], context);

  expect(obj.formatVersion).toBe(1);
  assertType(obj.pageCount, 'number', `${context}.pageCount`);
  assertType(obj.lineCount, 'number', `${context}.lineCount`);
  assertType(obj.markerCount, 'number', `${context}.markerCount`);
  assertType(obj.tabCount, 'number', `${context}.tabCount`);
  expect(Array.isArray(obj.pages)).toBe(true);
}

function assertNormalizeClientPointShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  assertExactKeys(obj, [...NORMALIZE_CLIENT_POINT_KEYS], context);

  assertType(obj.x, 'number', `${context}.x`);
  assertType(obj.y, 'number', `${context}.y`);
  // pageIndex and pageLocalY are optional - only check type if defined
  if (obj.pageIndex !== undefined) {
    assertType(obj.pageIndex, 'number', `${context}.pageIndex`);
  }
  if (obj.pageLocalY !== undefined) {
    assertType(obj.pageLocalY, 'number', `${context}.pageLocalY`);
  }
}

function assertPosAtCoordsShape(value: unknown, context: string): void {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const obj = value as Record<string, unknown>;

  assertExactKeys(obj, [...POS_AT_COORDS_KEYS], context);

  assertType(obj.pos, 'number', `${context}.pos`);
  assertType(obj.inside, 'number', `${context}.inside`);
}

// ============================================
// MOCK SETUP
// ============================================

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
  mockEditorOverlayManager,
  mockClickToPosition,
} = vi.hoisted(() => {
  const createDefaultConverter = () => ({
    headers: { 'rId-header-default': { type: 'doc', content: [{ type: 'paragraph' }] } },
    footers: { 'rId-footer-default': { type: 'doc', content: [{ type: 'paragraph' }] } },
    headerIds: { default: 'rId-header-default', first: null, even: null, odd: null, ids: ['rId-header-default'] },
    footerIds: { default: 'rId-footer-default', first: null, even: null, odd: null, ids: ['rId-footer-default'] },
  });

  const converterStore = {
    current: createDefaultConverter() as ReturnType<typeof createDefaultConverter> & Record<string, unknown>,
    mediaFiles: {} as Record<string, string>,
  };

  return {
    createDefaultConverter,
    mockIncrementalLayout: vi.fn(async () => ({
      layout: {
        pageSize: { w: 816, h: 1056 },
        pages: [
          {
            number: 1,
            size: { w: 816, h: 1056 },
            margins: { left: 96, right: 96, top: 96, bottom: 96 },
            orientation: 'portrait',
            sectionIndex: 0,
            fragments: [
              {
                pmStart: 0,
                pmEnd: 100,
                x: 96,
                y: 96,
                width: 624,
                height: 100,
                blockId: 'block-1',
                column: 0,
              },
            ],
          },
        ],
        layoutEpoch: 1,
        pageGap: 20,
      },
      measures: [
        {
          blockId: 'block-1',
          width: 624,
          height: 100,
          lines: [{ width: 100, ascent: 12, descent: 4, lineHeight: 16 }],
        },
      ],
    })),
    mockToFlowBlocks: vi.fn(() => ({ blocks: [], bookmarks: new Map() })),
    mockSelectionToRects: vi.fn(() => [
      { pageIndex: 0, left: 100, right: 110, top: 100, bottom: 120, width: 10, height: 20 },
    ]),
    mockCreateDomPainter: vi.fn(() => ({
      paint: vi.fn(),
      destroy: vi.fn(),
      setZoom: vi.fn(),
      setLayoutMode: vi.fn(),
      setProviders: vi.fn(),
      setData: vi.fn(),
      getSnapshot: vi.fn(() => null),
    })),
    mockMeasureBlock: vi.fn(() => ({ width: 100, height: 100 })),
    mockEditorConverterStore: converterStore,
    mockCreateHeaderFooterEditor: vi.fn(() => {
      const listeners = new Map<string, Set<(payload?: unknown) => void>>();
      const on = (event: string, handler: (payload?: unknown) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(handler);
      };
      const off = (event: string, handler: (payload?: unknown) => void) => {
        listeners.get(event)?.delete(handler);
      };
      const emit = (event: string, payload?: unknown) => {
        listeners.get(event)?.forEach((h) => h(payload));
      };
      const editorStub = {
        on,
        off,
        emit,
        once: (event: string, handler: (payload?: unknown) => void) => {
          const wrapper = (payload?: unknown) => {
            off(event, wrapper);
            handler(payload);
          };
          on(event, wrapper);
        },
        destroy: vi.fn(),
        setEditable: vi.fn(),
        setOptions: vi.fn(),
        commands: { setTextSelection: vi.fn() },
        state: { doc: { content: { size: 10 } } },
        view: { dom: document.createElement('div'), focus: vi.fn() },
      };
      queueMicrotask(() => editorStub.emit('create'));
      return editorStub;
    }),
    mockOnHeaderFooterDataUpdate: vi.fn(),
    mockEditorOverlayManager: vi.fn().mockImplementation(() => ({
      showEditingOverlay: vi.fn(() => ({ success: true, editorHost: document.createElement('div'), reason: null })),
      hideEditingOverlay: vi.fn(),
      showSelectionOverlay: vi.fn(),
      hideSelectionOverlay: vi.fn(),
      setOnDimmingClick: vi.fn(),
      getActiveEditorHost: vi.fn(() => null),
      destroy: vi.fn(),
    })),
    // Return EXACTLY the PositionHit shape - no more, no less
    mockClickToPosition: vi.fn(() => ({
      pos: 5,
      layoutEpoch: 1,
      blockId: 'block-1',
      pageIndex: 0,
      column: 0,
      lineIndex: 0,
    })),
  };
});

vi.mock('./core/Editor', () => ({
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
        content: { size: 100 },
        descendants: vi.fn(),
        nodesBetween: vi.fn(),
        resolve: vi.fn((pos: number) => ({
          pos,
          depth: 0,
          parent: { inlineContent: true },
          node: vi.fn(),
          min: vi.fn((other: { pos: number }) => Math.min(pos, other.pos)),
          max: vi.fn((other: { pos: number }) => Math.max(pos, other.pos)),
        })),
      },
      tr: { setSelection: vi.fn().mockReturnThis() },
    },
    view: {
      dom: { dispatchEvent: vi.fn(() => true), focus: vi.fn() },
      focus: vi.fn(),
      dispatch: vi.fn(),
    },
    options: { documentId: 'test-doc', element: document.createElement('div') },
    converter: mockEditorConverterStore.current,
    storage: { image: { media: mockEditorConverterStore.mediaFiles } },
  })),
}));

vi.mock('@superdoc/pm-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@superdoc/pm-adapter')>();
  return { ...actual, toFlowBlocks: mockToFlowBlocks };
});

vi.mock('@superdoc/layout-bridge', () => ({
  incrementalLayout: mockIncrementalLayout,
  selectionToRects: mockSelectionToRects,
  clickToPosition: mockClickToPosition,
  createDragHandler: vi.fn(() => () => {}),
  getFragmentAtPosition: vi.fn(() => null),
  computeLinePmRange: vi.fn(() => ({ from: 0, to: 0 })),
  extractIdentifierFromConverter: vi.fn(() => ({
    extractHeaderId: vi.fn(() => 'rId-header-default'),
    extractFooterId: vi.fn(() => 'rId-footer-default'),
  })),
  buildMultiSectionIdentifier: vi.fn(() => ({ sections: [] })),
  getHeaderFooterTypeForSection: vi.fn(() => 'default'),
  getHeaderFooterType: vi.fn(() => 'default'),
  layoutHeaderFooterWithCache: vi.fn(async () => ({
    default: { layout: { pages: [{ fragments: [], number: 1 }], height: 0 }, blocks: [], measures: [] },
  })),
  computeDisplayPageNumber: vi.fn((pages) =>
    pages.map((p: { number?: number }) => ({ displayText: String(p.number ?? 1) })),
  ),
  PageGeometryHelper: vi.fn().mockImplementation(({ layout, pageGap }) => ({
    updateLayout: vi.fn(),
    getPageIndexAtY: vi.fn(() => 0),
    getNearestPageIndex: vi.fn(() => 0),
    getPageTop: vi.fn(() => 0),
    getPageGap: vi.fn(() => pageGap ?? 0),
    getLayout: vi.fn(() => layout),
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

vi.mock('@superdoc/measuring-dom', () => ({ measureBlock: mockMeasureBlock }));

vi.mock('@extensions/pagination/pagination-helpers.js', () => ({
  createHeaderFooterEditor: mockCreateHeaderFooterEditor,
  onHeaderFooterDataUpdate: mockOnHeaderFooterDataUpdate,
}));

vi.mock('./core/header-footer/EditorOverlayManager', () => ({
  EditorOverlayManager: mockEditorOverlayManager,
}));

// ============================================
// TYPE VERIFICATION TESTS
// ============================================

describe('Type Declaration Verification (index.d.ts)', () => {
  let container: HTMLElement;
  let presentation: PresentationEditor;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
    mockEditorConverterStore.current = { ...createDefaultConverter(), headerEditors: [], footerEditors: [] };
    mockEditorConverterStore.mediaFiles = {};
    (PresentationEditor as typeof PresentationEditor & { instances: Map<string, unknown> }).instances = new Map();
  });

  afterEach(() => {
    if (presentation) presentation.destroy();
    if (container?.parentNode) container.parentNode.removeChild(container);
  });

  /** Helper to create and initialize a PresentationEditor for testing */
  async function createEditor(docId: string): Promise<PresentationEditor> {
    presentation = new PresentationEditor({
      element: container,
      documentId: docId,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      mode: 'docx',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    return presentation;
  }

  // ============================================
  // getCurrentSectionPageStyles
  // ============================================

  describe('getCurrentSectionPageStyles()', () => {
    it('returns EXACT shape declared in index.d.ts', async () => {
      await createEditor('type-test-section-styles');
      const result = presentation.getCurrentSectionPageStyles();
      assertSectionPageStylesShape(result, 'getCurrentSectionPageStyles()');
    });
  });

  // ============================================
  // hitTest
  // ============================================

  describe('hitTest()', () => {
    it('returns EXACT PositionHit shape', async () => {
      await createEditor('type-test-hit-test');
      const result = presentation.hitTest(100, 100);
      if (result !== null) {
        assertPositionHitShape(result, 'hitTest()');
      }
    });
  });

  // ============================================
  // getSelectionBounds
  // ============================================

  describe('getSelectionBounds()', () => {
    it('returns correct shape with bounds, rects, and pageIndex', async () => {
      mockSelectionToRects.mockReturnValue([
        { pageIndex: 0, left: 100, right: 200, top: 50, bottom: 70, width: 100, height: 20 },
      ]);
      await createEditor('type-test-selection-bounds');
      const result = presentation.getSelectionBounds(0, 10);
      if (result !== null) {
        expect(result).toHaveProperty('bounds');
        expect(result).toHaveProperty('rects');
        expect(result).toHaveProperty('pageIndex');
        assertBoundingRectShape(result.bounds, 'getSelectionBounds().bounds');
        expect(Array.isArray(result.rects)).toBe(true);
        assertType(result.pageIndex, 'number', 'getSelectionBounds().pageIndex');
      }
    });
  });

  // ============================================
  // getSelectionRects
  // ============================================

  describe('getSelectionRects()', () => {
    it('returns array of EXACT RangeRect shapes', async () => {
      mockSelectionToRects.mockReturnValue([
        { pageIndex: 0, left: 100, right: 200, top: 50, bottom: 70, width: 100, height: 20 },
        { pageIndex: 1, left: 50, right: 150, top: 100, bottom: 120, width: 100, height: 20 },
      ]);
      await createEditor('type-test-selection-rects');
      const result = presentation.getSelectionRects();
      expect(Array.isArray(result)).toBe(true);
      result.forEach((rect, i) => {
        assertRangeRectShape(rect, `getSelectionRects()[${i}]`);
      });
    });
  });

  // ============================================
  // getLayoutSnapshot
  // ============================================

  describe('getLayoutSnapshot()', () => {
    it('returns EXACT shape { blocks, measures, layout }', async () => {
      await createEditor('type-test-layout-snapshot');
      const result = presentation.getLayoutSnapshot();
      assertLayoutSnapshotShape(result, 'getLayoutSnapshot()');
    });
  });

  // ============================================
  // getLayoutHealthState
  // ============================================

  describe('getLayoutHealthState()', () => {
    it('returns valid literal type', async () => {
      await createEditor('type-test-health-state');
      const result = presentation.getLayoutHealthState();
      expect(['healthy', 'degraded', 'failed']).toContain(result);
    });
  });

  // ============================================
  // isLayoutHealthy
  // ============================================

  describe('isLayoutHealthy()', () => {
    it('returns boolean', async () => {
      await createEditor('type-test-is-healthy');
      const result = presentation.isLayoutHealthy();
      expect(typeof result).toBe('boolean');
    });
  });

  // ============================================
  // getLayoutError
  // ============================================

  describe('getLayoutError()', () => {
    it('returns null or EXACT LayoutError shape', async () => {
      await createEditor('type-test-layout-error');
      const result = presentation.getLayoutError();
      if (result !== null) {
        assertLayoutErrorShape(result, 'getLayoutError()');
      } else {
        expect(result).toBeNull();
      }
    });
  });

  // ============================================
  // getRemoteCursors
  // ============================================

  describe('getRemoteCursors()', () => {
    it('returns array of EXACT RemoteCursorState shapes', async () => {
      await createEditor('type-test-remote-cursors');

      const result = presentation.getRemoteCursors();

      expect(Array.isArray(result)).toBe(true);
      result.forEach((cursor, i) => {
        assertRemoteCursorStateShape(cursor, `getRemoteCursors()[${i}]`);
      });
    });
  });

  // ============================================
  // getPages
  // ============================================

  describe('getPages()', () => {
    it('returns array of LayoutPage shapes', async () => {
      await createEditor('type-test-get-pages');
      const result = presentation.getPages();
      expect(Array.isArray(result)).toBe(true);
      result.forEach((page, i) => {
        assertLayoutPageShape(page, `getPages()[${i}]`);
      });
    });
  });

  // ============================================
  // getPaintSnapshot
  // ============================================

  describe('getPaintSnapshot()', () => {
    it('returns null or PaintSnapshot shape', async () => {
      await createEditor('type-test-paint-snapshot');
      const result = presentation.getPaintSnapshot();
      if (result !== null) {
        assertPaintSnapshotShape(result, 'getPaintSnapshot()');
      } else {
        expect(result).toBeNull();
      }
    });
  });

  // ============================================
  // Readonly properties type verification
  // ============================================

  describe('readonly properties', () => {
    it('have correct types', async () => {
      await createEditor('type-test-readonly');
      expect(presentation.editor).toBeDefined();
      expect(presentation.element).toBeInstanceOf(HTMLElement);
      expect(typeof presentation.isEditable).toBe('boolean');
      expect(typeof presentation.zoom).toBe('number');
      expect(presentation.state).toHaveProperty('selection');
      expect(presentation.commands === undefined || typeof presentation.commands === 'object').toBe(true);
    });
  });

  // ============================================
  // Method return type verification
  // ============================================

  describe('method return types', () => {
    it('undo() returns boolean', async () => {
      await createEditor('type-test-undo');

      const result = presentation.undo();
      expect(typeof result).toBe('boolean');
    });

    it('redo() returns boolean', async () => {
      await createEditor('type-test-redo');
      const result = presentation.redo();
      expect(typeof result).toBe('boolean');
    });

    it('getActiveEditor() returns Editor-like object', async () => {
      await createEditor('type-test-active-editor');
      const result = presentation.getActiveEditor();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('view');
    });

    it('onLayoutUpdated() returns unsubscribe function', async () => {
      await createEditor('type-test-on-layout-updated');
      const unsubscribe = presentation.onLayoutUpdated(() => {});
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('onLayoutError() returns unsubscribe function', async () => {
      await createEditor('type-test-on-layout-error');
      const unsubscribe = presentation.onLayoutError(() => {});
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('normalizeClientPoint() returns EXACT shape or null', async () => {
      await createEditor('type-test-normalize-client-point');
      const result = presentation.normalizeClientPoint(100, 100);
      if (result !== null) {
        assertNormalizeClientPointShape(result, 'normalizeClientPoint()');
      } else {
        expect(result).toBeNull();
      }
    });

    it('coordsAtPos() returns EXACT shape or null', async () => {
      await createEditor('type-test-coords-at-pos');
      const result = presentation.coordsAtPos(0);
      if (result !== null) {
        assertBoundingRectShape(result, 'coordsAtPos()');
      } else {
        expect(result).toBeNull();
      }
    });

    it('posAtCoords() returns EXACT shape or null', async () => {
      await createEditor('type-test-pos-at-coords');
      const result = presentation.posAtCoords({ clientX: 100, clientY: 100 });
      if (result !== null) {
        assertPosAtCoordsShape(result, 'posAtCoords()');
      } else {
        expect(result).toBeNull();
      }
    });
  });

  // ============================================
  // Static methods
  // ============================================

  describe('static methods', () => {
    it('getInstance() returns PresentationEditor | undefined', async () => {
      await createEditor('type-test-get-instance');
      const found = PresentationEditor.getInstance('type-test-get-instance');
      expect(found === undefined || found instanceof PresentationEditor).toBe(true);
      const notFound = PresentationEditor.getInstance('non-existent');
      expect(notFound).toBeUndefined();
    });

    it('setGlobalZoom() accepts number', () => {
      // Should not throw
      expect(() => PresentationEditor.setGlobalZoom(1.5)).not.toThrow();
    });
  });
});
