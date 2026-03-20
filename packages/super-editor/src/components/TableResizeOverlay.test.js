import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import TableResizeOverlay from './TableResizeOverlay.vue';

// Mock dependencies
vi.mock('@core/super-converter/helpers.js', () => ({
  pixelsToTwips: vi.fn((px) => Math.round(px * 15)), // 1px ≈ 15 twips
  twipsToPixels: vi.fn((twips) => Math.round(twips / 15)),
}));

vi.mock('@superdoc/layout-bridge', () => ({
  measureCache: {
    invalidate: vi.fn(),
  },
}));

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a mock editor instance with ProseMirror-like structure
 */
function createMockEditor(overrides = {}) {
  const mockTr = {
    setNodeMarkup: vi.fn().mockReturnThis(),
  };

  const mockState = {
    tr: mockTr,
    doc: {
      nodeAt: vi.fn(() => ({
        type: { name: 'table' },
        attrs: { grid: [], tableWidth: 1000 },
        nodeSize: 100,
        descendants: vi.fn((callback) => {
          // Simulate table structure: tableRow -> tableCell
          callback({ type: { name: 'tableRow' } }, 0, null);
          callback(
            {
              type: { name: 'tableCell' },
              attrs: { colspan: 1, colwidth: [100] },
            },
            1,
            { type: { name: 'tableRow' } },
          );
        }),
      })),
      descendants: vi.fn((callback) => {
        callback(
          {
            type: { name: 'table' },
            nodeSize: 100,
          },
          10,
        );
        return false;
      }),
    },
  };

  return {
    zoom: 1,
    view: {
      dom: {
        style: { pointerEvents: 'auto' },
      },
      state: mockState,
      dispatch: vi.fn(),
    },
    ...overrides,
  };
}

/**
 * Creates a mock table element with boundary metadata
 * Uses undefined instead of null for the "use default" case
 */
function createMockTableElement(metadata = undefined, overrides = {}) {
  const defaultMetadata = {
    columns: [
      { i: 0, x: 0, w: 100, min: 50, r: 1 },
      { i: 1, x: 100, w: 150, min: 50, r: 1 },
      { i: 2, x: 250, w: 100, min: 50, r: 1 },
    ],
  };

  // If metadata is explicitly null, return null for the attribute
  // If metadata is undefined, use the default
  // Otherwise use the provided metadata
  let boundariesAttr;
  if (metadata === null) {
    boundariesAttr = null;
  } else if (metadata === undefined) {
    boundariesAttr = JSON.stringify(defaultMetadata);
  } else {
    boundariesAttr = JSON.stringify(metadata);
  }

  const element = {
    getAttribute: vi.fn((attr) => {
      if (attr === 'data-table-boundaries') return boundariesAttr;
      if (attr === 'data-sd-block-id') return 'test-block-id';
      return null;
    }),
    querySelector: vi.fn(() => ({
      getAttribute: vi.fn(() => '15'), // data-pm-start
    })),
    closest: vi.fn(() => ({
      getBoundingClientRect: () => ({
        left: 0,
        right: 800,
        top: 0,
        bottom: 600,
      }),
    })),
    getBoundingClientRect: vi.fn(() => ({
      left: 50,
      right: 400,
      top: 100,
      bottom: 300,
      width: 350,
      height: 200,
    })),
    offsetParent: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
      }),
      scrollLeft: 0,
      scrollTop: 0,
    },
    offsetLeft: 50,
    offsetTop: 100,
    ...overrides,
  };

  return element;
}

// ============================================================================
// Tests
// ============================================================================

describe('TableResizeOverlay', () => {
  let rafCallbacks = [];
  let originalRaf;
  let originalCancelRaf;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock requestAnimationFrame
    rafCallbacks = [];
    originalRaf = global.requestAnimationFrame;
    originalCancelRaf = global.cancelAnimationFrame;

    global.requestAnimationFrame = vi.fn((cb) => {
      const id = rafCallbacks.length;
      rafCallbacks.push(cb);
      return id;
    });
    global.cancelAnimationFrame = vi.fn((id) => {
      rafCallbacks[id] = null;
    });
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRaf;
    global.cancelAnimationFrame = originalCancelRaf;
  });

  // ==========================================================================
  // Lifecycle Tests
  // ==========================================================================

  describe('Lifecycle', () => {
    it('should initialize with null overlayRect when no tableElement', () => {
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement: null,
        },
      });

      expect(wrapper.vm.overlayRect).toBeNull();
      wrapper.unmount();
    });

    it('should parse metadata when tableElement is provided', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      expect(wrapper.vm.tableMetadata).not.toBeNull();
      expect(wrapper.vm.tableMetadata.columns).toHaveLength(3);
      wrapper.unmount();
    });

    it('should start RAF tracking when visible becomes true', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: false,
          tableElement,
        },
      });

      await wrapper.setProps({ visible: true });
      await nextTick();

      expect(global.requestAnimationFrame).toHaveBeenCalled();
      wrapper.unmount();
    });

    it('should stop RAF tracking on unmount', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();
      wrapper.unmount();

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should remove event listeners on unmount', async () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const tableElement = createMockTableElement();

      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();
      wrapper.unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });

  // ==========================================================================
  // Metadata Parsing Tests
  // ==========================================================================

  describe('parseTableMetadata', () => {
    it('should parse valid table metadata', async () => {
      const metadata = {
        columns: [
          { i: 0, x: 0, w: 100, min: 50, r: 1 },
          { i: 1, x: 100, w: 200, min: 75, r: 0 },
        ],
      };

      const tableElement = createMockTableElement(metadata);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      expect(wrapper.vm.tableMetadata.columns).toHaveLength(2);
      expect(wrapper.vm.tableMetadata.columns[0]).toEqual({
        i: 0,
        x: 0,
        w: 100,
        min: 50,
        r: 1,
      });

      wrapper.unmount();
    });

    it('should emit error for invalid JSON', async () => {
      const tableElement = createMockTableElement();
      tableElement.getAttribute = vi.fn(() => 'not valid json');

      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const errorEvents = wrapper.emitted('resize-error');
      expect(errorEvents).toBeTruthy();
      expect(errorEvents[0][0].error).toContain('Unexpected token');

      wrapper.unmount();
    });

    it('should filter out invalid columns', async () => {
      const metadata = {
        columns: [
          { i: 0, x: 0, w: 100, min: 50, r: 1 }, // valid
          { i: -1, x: 0, w: 100, min: 50, r: 1 }, // invalid: negative index
          { i: 1, x: 100, w: 0, min: 50, r: 1 }, // invalid: zero width
          { i: 2, x: 200, w: 100, min: 0, r: 1 }, // invalid: zero min
          { i: 3, x: 300, w: 100, min: 50, r: 2 }, // invalid: r not 0 or 1
        ],
      };

      const tableElement = createMockTableElement(metadata);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      expect(wrapper.vm.tableMetadata.columns).toHaveLength(1);
      expect(wrapper.vm.tableMetadata.columns[0].i).toBe(0);

      wrapper.unmount();
    });

    it('should emit error when all columns are invalid', async () => {
      const metadata = {
        columns: [{ i: -1, x: 0, w: 0, min: 0, r: 5 }],
      };

      const tableElement = createMockTableElement(metadata);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const errorEvents = wrapper.emitted('resize-error');
      expect(errorEvents).toBeTruthy();
      expect(errorEvents[0][0].error).toContain('corrupted or empty');

      wrapper.unmount();
    });

    it('should handle missing segments gracefully', async () => {
      const metadata = {
        columns: [{ i: 0, x: 0, w: 100, min: 50, r: 1 }],
        // No segments property
      };

      const tableElement = createMockTableElement(metadata);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      expect(wrapper.vm.tableMetadata.segments).toBeUndefined();

      wrapper.unmount();
    });

    it('should handle missing data-table-boundaries attribute', async () => {
      // Pass explicit null to get null attribute
      const tableElement = createMockTableElement(null);

      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      expect(wrapper.vm.tableMetadata).toBeNull();

      wrapper.unmount();
    });

    it('should normalize clamped min width while keeping min below width', async () => {
      const metadata = {
        columns: [
          { i: 0, x: 0, w: 10, min: 10, r: 1 },
          { i: 1, x: 10, w: 2, min: 2, r: 1 },
        ],
      };

      const tableElement = createMockTableElement(metadata);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const [firstCol, secondCol] = wrapper.vm.tableMetadata.columns;
      expect(firstCol.min).toBeLessThan(firstCol.w);
      expect(secondCol.min).toBeLessThan(secondCol.w);
      expect(firstCol.min).toBe(9);
      expect(secondCol.min).toBe(1);

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // Boundary Segments Tests
  // ==========================================================================

  describe('getBoundarySegments', () => {
    it('should return full height for right-edge boundaries', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      // Find right-edge boundary
      const rightEdgeBoundary = wrapper.vm.resizableBoundaries.find((b) => b.type === 'right-edge');
      const segments = wrapper.vm.getBoundarySegments(rightEdgeBoundary);

      expect(segments).toEqual([{ y: 0, h: null }]);

      wrapper.unmount();
    });

    it('should return segments from metadata for inner boundaries', async () => {
      const metadata = {
        columns: [
          { i: 0, x: 0, w: 100, min: 50, r: 1 },
          { i: 1, x: 100, w: 100, min: 50, r: 1 },
        ],
        segments: [
          null, // column 0
          [
            { y: 0, h: 50 },
            { y: 100, h: 25 },
          ], // column 1 boundary
        ],
      };

      const tableElement = createMockTableElement(metadata);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const innerBoundary = wrapper.vm.resizableBoundaries.find((b) => b.type === 'inner');
      const segments = wrapper.vm.getBoundarySegments(innerBoundary);

      expect(segments).toEqual([
        { y: 0, h: 50 },
        { y: 100, h: 25 },
      ]);

      wrapper.unmount();
    });

    it('should return empty array when boundary is covered by merged cells', async () => {
      const metadata = {
        columns: [
          { i: 0, x: 0, w: 100, min: 50, r: 1 },
          { i: 1, x: 100, w: 100, min: 50, r: 1 },
        ],
        segments: [
          null,
          [], // Empty segments = covered by merged cells
        ],
      };

      const tableElement = createMockTableElement(metadata);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const innerBoundary = wrapper.vm.resizableBoundaries.find((b) => b.type === 'inner');
      const segments = wrapper.vm.getBoundarySegments(innerBoundary);

      expect(segments).toEqual([]);

      wrapper.unmount();
    });

    it('should fallback to full height when no segments data', async () => {
      const metadata = {
        columns: [
          { i: 0, x: 0, w: 100, min: 50, r: 1 },
          { i: 1, x: 100, w: 100, min: 50, r: 1 },
        ],
        // No segments
      };

      const tableElement = createMockTableElement(metadata);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const innerBoundary = wrapper.vm.resizableBoundaries.find((b) => b.type === 'inner');
      const segments = wrapper.vm.getBoundarySegments(innerBoundary);

      expect(segments).toEqual([{ y: 0, h: null }]);

      wrapper.unmount();
    });

    it('should filter invalid segments', async () => {
      const metadata = {
        columns: [
          { i: 0, x: 0, w: 100, min: 50, r: 1 },
          { i: 1, x: 100, w: 100, min: 50, r: 1 },
        ],
        segments: [
          null,
          [
            { y: 0, h: 50 }, // valid
            null, // invalid
            'invalid', // invalid
            { y: 'bad', h: 25 }, // invalid y
            { y: 100, h: 25 }, // valid
          ],
        ],
      };

      const tableElement = createMockTableElement(metadata);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const innerBoundary = wrapper.vm.resizableBoundaries.find((b) => b.type === 'inner');
      const segments = wrapper.vm.getBoundarySegments(innerBoundary);

      // Should filter out invalid entries, but keep ones with invalid y (defaults to 0)
      expect(segments.length).toBeGreaterThanOrEqual(2);

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // Drag Behavior Tests
  // ==========================================================================

  describe('Drag Behavior', () => {
    it('should initialize drag state on handle mousedown', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      // Simulate mousedown on first handle
      const event = new MouseEvent('mousedown', {
        clientX: 100,
        bubbles: true,
      });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });

      wrapper.vm.onHandleMouseDown(event, 0);

      expect(wrapper.vm.dragState).not.toBeNull();
      expect(wrapper.vm.dragState.columnIndex).toBe(0);
      expect(wrapper.vm.dragState.resizableBoundaryIndex).toBe(0);

      wrapper.unmount();
    });

    it('should add global listeners on drag start', async () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const tableElement = createMockTableElement();

      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const event = new MouseEvent('mousedown', { clientX: 100 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });

      wrapper.vm.onHandleMouseDown(event, 0);

      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));

      addEventListenerSpy.mockRestore();
      wrapper.unmount();
    });

    it('should disable PM editor pointer events during drag', async () => {
      const editor = createMockEditor();
      const tableElement = createMockTableElement();

      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor,
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const event = new MouseEvent('mousedown', { clientX: 100 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });

      wrapper.vm.onHandleMouseDown(event, 0);

      expect(editor.view.dom.style.pointerEvents).toBe('none');

      wrapper.unmount();
    });

    it('should emit resize-start event', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const event = new MouseEvent('mousedown', { clientX: 100 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });

      wrapper.vm.onHandleMouseDown(event, 0);

      const startEvents = wrapper.emitted('resize-start');
      expect(startEvents).toBeTruthy();
      expect(startEvents[0][0]).toHaveProperty('columnIndex');
      expect(startEvents[0][0]).toHaveProperty('initialWidths');

      wrapper.unmount();
    });

    it('should emit error when editor view is not available', async () => {
      const editor = { view: null };
      const tableElement = createMockTableElement();

      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor,
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const event = new MouseEvent('mousedown', { clientX: 100 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });

      wrapper.vm.onHandleMouseDown(event, 0);

      const errorEvents = wrapper.emitted('resize-error');
      expect(errorEvents).toBeTruthy();
      expect(errorEvents[0][0].error).toBe('Editor view not available');

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // Viewing Mode Guard Tests
  // ==========================================================================

  describe('Viewing mode restrictions', () => {
    it('should ignore column handle drags when documentMode is viewing', async () => {
      const tableElement = createMockTableElement();

      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor({ options: { documentMode: 'viewing' } }),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const event = new MouseEvent('mousedown', { clientX: 100, clientY: 50 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });

      wrapper.vm.onHandleMouseDown(event, 0);

      expect(wrapper.vm.dragState).toBeNull();
      expect(wrapper.emitted('resize-start')).toBeUndefined();

      wrapper.unmount();
    });

    it('should ignore row handle drags when documentMode is viewing', async () => {
      const tableElement = createMockTableElement({
        columns: [
          { i: 0, x: 0, w: 100, min: 50, r: 1 },
          { i: 1, x: 100, w: 150, min: 50, r: 1 },
        ],
        rows: [
          { i: 0, y: 0, h: 50, min: 30, r: 1 },
          { i: 1, y: 50, h: 50, min: 30, r: 1 },
        ],
      });

      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor({ options: { documentMode: 'viewing' } }),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const event = new MouseEvent('mousedown', { clientX: 100, clientY: 50 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });

      wrapper.vm.onRowHandleMouseDown(event, 0);

      expect(wrapper.vm.rowDragState).toBeNull();
      expect(wrapper.emitted('resize-start')).toBeUndefined();

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // Overlay Rect Tests
  // ==========================================================================

  describe('updateOverlayRect', () => {
    it('should set overlayRect to null for zero-size table', async () => {
      const tableElement = createMockTableElement();
      tableElement.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: 0,
        height: 0,
      }));

      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      expect(wrapper.vm.overlayRect).toBeNull();

      wrapper.unmount();
    });

    it('should calculate correct overlay position with offset parent', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      expect(wrapper.vm.overlayRect).not.toBeNull();
      expect(wrapper.vm.overlayRect.width).toBe(350);
      expect(wrapper.vm.overlayRect.height).toBe(200);

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // Resizable Boundaries Tests
  // ==========================================================================

  describe('resizableBoundaries', () => {
    it('should create inner boundaries between columns', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const innerBoundaries = wrapper.vm.resizableBoundaries.filter((b) => b.type === 'inner');
      expect(innerBoundaries).toHaveLength(2); // 3 columns = 2 inner boundaries

      wrapper.unmount();
    });

    it('should create right-edge boundary for last column', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const rightEdgeBoundaries = wrapper.vm.resizableBoundaries.filter((b) => b.type === 'right-edge');
      expect(rightEdgeBoundaries).toHaveLength(1);

      wrapper.unmount();
    });

    it('should return empty array when no metadata', async () => {
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement: null,
        },
      });

      await nextTick();

      expect(wrapper.vm.resizableBoundaries).toEqual([]);

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // Edge Cases Tests
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle rapid visibility toggle during drag', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      // Start drag
      const event = new MouseEvent('mousedown', { clientX: 100 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
      wrapper.vm.onHandleMouseDown(event, 0);

      expect(wrapper.vm.dragState).not.toBeNull();

      // Hide overlay during drag
      await wrapper.setProps({ visible: false });
      await nextTick();

      // Drag state should be cleaned up
      expect(wrapper.vm.dragState).toBeNull();

      wrapper.unmount();
    });

    it('should handle table with zero columns', async () => {
      const metadata = { columns: [] };
      const tableElement = createMockTableElement(metadata);

      // This will emit an error for empty columns
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      expect(wrapper.vm.tableMetadata).toBeNull();
      expect(wrapper.vm.resizableBoundaries).toEqual([]);

      wrapper.unmount();
    });

    it('should handle single column table', async () => {
      const metadata = {
        columns: [{ i: 0, x: 0, w: 100, min: 50, r: 1 }],
      };
      const tableElement = createMockTableElement(metadata);

      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      // Single column = only right-edge boundary
      expect(wrapper.vm.resizableBoundaries).toHaveLength(1);
      expect(wrapper.vm.resizableBoundaries[0].type).toBe('right-edge');

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // Constants Tests
  // ==========================================================================

  describe('Constants', () => {
    it('should use RESIZE_HANDLE_WIDTH_PX in handle styles', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const boundary = wrapper.vm.resizableBoundaries[0];
      const segment = { y: 0, h: null };
      const style = wrapper.vm.getSegmentHandleStyle(boundary, segment);

      expect(style.width).toBe('9px'); // RESIZE_HANDLE_WIDTH_PX

      wrapper.unmount();
    });

    it('should use RESIZE_HANDLE_OFFSET_PX in transform', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const boundary = wrapper.vm.resizableBoundaries[0];
      const segment = { y: 0, h: null };
      const style = wrapper.vm.getSegmentHandleStyle(boundary, segment);

      expect(style.transform).toBe('translateX(-4px)'); // RESIZE_HANDLE_OFFSET_PX

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // Visual bounds during drag (SD-2094)
  // ==========================================================================

  describe('Visual bounds during drag (SD-2094)', () => {
    /** Metadata with both column and row boundaries for cross-axis tests */
    const metadataWithRows = {
      columns: [
        { i: 0, x: 0, w: 100, min: 50, r: 1 },
        { i: 1, x: 100, w: 150, min: 50, r: 1 },
      ],
      rows: [
        { i: 0, y: 0, h: 50, min: 30, r: 1 },
        { i: 1, y: 50, h: 50, min: 30, r: 1 },
      ],
    };

    it('should not expand overlay width during column drag', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      // Start a column drag
      const event = new MouseEvent('mousedown', { clientX: 100 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
      wrapper.vm.onHandleMouseDown(event, 0);

      await nextTick();

      // Overlay width should remain at table width (350), not expanded
      const style = wrapper.vm.overlayStyle;
      expect(style.width).toBe('350px');
      expect(style.height).toBe('200px');

      wrapper.unmount();
    });

    it('should not expand overlay height during row drag', async () => {
      const tableElement = createMockTableElement(metadataWithRows);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      // Start a row drag
      const event = new MouseEvent('mousedown', { clientY: 50 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
      wrapper.vm.onRowHandleMouseDown(event, 0);

      await nextTick();

      // Overlay height should remain at table height (200), not expanded
      const style = wrapper.vm.overlayStyle;
      expect(style.width).toBe('350px');
      expect(style.height).toBe('200px');

      wrapper.unmount();
    });

    it('should constrain row handle width to table width', async () => {
      const tableElement = createMockTableElement(metadataWithRows);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const rowBoundary = wrapper.vm.resizableRowBoundaries[0];
      const style = wrapper.vm.getRowHandleStyle(rowBoundary);

      // Width should be explicit pixel value matching table width, not '100%'
      expect(style.width).toBe('350px');

      wrapper.unmount();
    });

    it('should constrain column handle fallback height to table height', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const boundary = wrapper.vm.resizableBoundaries[0];
      // null segment height triggers the fallback
      const style = wrapper.vm.getSegmentHandleStyle(boundary, { y: null, h: null });

      // Height should be explicit pixel value matching table height, not '100%'
      expect(style.height).toBe('200px');

      wrapper.unmount();
    });

    it('should constrain column guideline height to table height during drag', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const event = new MouseEvent('mousedown', { clientX: 100 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
      wrapper.vm.onHandleMouseDown(event, 0);

      await nextTick();

      const style = wrapper.vm.guidelineStyle;
      expect(style.height).toBe('200px');

      wrapper.unmount();
    });

    it('should constrain row guideline width to table width during drag', async () => {
      const tableElement = createMockTableElement(metadataWithRows);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const event = new MouseEvent('mousedown', { clientY: 50 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
      wrapper.vm.onRowHandleMouseDown(event, 0);

      await nextTick();

      const style = wrapper.vm.rowGuidelineStyle;
      expect(style.width).toBe('350px');

      wrapper.unmount();
    });

    it('should hide row handles during column drag', async () => {
      const tableElement = createMockTableElement(metadataWithRows);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      // Row handles should be visible before drag
      const rowHandlesBefore = wrapper.findAll('.resize-handle--row');
      expect(rowHandlesBefore.length).toBeGreaterThan(0);
      expect(rowHandlesBefore[0].element.style.display).not.toBe('none');

      // Start a column drag
      const event = new MouseEvent('mousedown', { clientX: 100 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
      wrapper.vm.onHandleMouseDown(event, 0);

      await nextTick();

      // Row handles should be hidden (v-show sets display:none) during column drag
      const rowHandlesDuring = wrapper.findAll('.resize-handle--row');
      for (const handle of rowHandlesDuring) {
        expect(handle.element.style.display).toBe('none');
      }

      wrapper.unmount();
    });

    it('should hide column handles during row drag', async () => {
      const tableElement = createMockTableElement(metadataWithRows);
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      // Column handles should be visible before drag
      const colHandlesBefore = wrapper.findAll('.resize-handle:not(.resize-handle--row)');
      expect(colHandlesBefore.length).toBeGreaterThan(0);
      expect(colHandlesBefore[0].element.style.display).not.toBe('none');

      // Start a row drag
      const event = new MouseEvent('mousedown', { clientY: 50 });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
      wrapper.vm.onRowHandleMouseDown(event, 0);

      await nextTick();

      // Column handles should be hidden (v-show sets display:none) during row drag
      const colHandlesDuring = wrapper.findAll('.resize-handle:not(.resize-handle--row)');
      for (const handle of colHandlesDuring) {
        expect(handle.element.style.display).toBe('none');
      }

      wrapper.unmount();
    });

    it('should always emit resize-end on column drag mouseup', async () => {
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor: createMockEditor(),
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      // Start drag
      const downEvent = new MouseEvent('mousedown', { clientX: 100 });
      Object.defineProperty(downEvent, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(downEvent, 'stopPropagation', { value: vi.fn() });
      wrapper.vm.onHandleMouseDown(downEvent, 0);

      expect(wrapper.vm.dragState).not.toBeNull();

      // Immediately release (zero delta — below MIN_RESIZE_DELTA_PX)
      const upEvent = new MouseEvent('mouseup');
      document.dispatchEvent(upEvent);

      await nextTick();

      // resize-end should still be emitted even with zero delta
      expect(wrapper.emitted('resize-end')).toBeDefined();
      expect(wrapper.emitted('resize-end').length).toBeGreaterThanOrEqual(1);

      wrapper.unmount();
    });

    it('should cancel an active column drag on window blur', async () => {
      const editor = createMockEditor();
      const tableElement = createMockTableElement();
      const wrapper = mount(TableResizeOverlay, {
        props: {
          editor,
          visible: true,
          tableElement,
        },
      });

      await nextTick();

      const downEvent = new MouseEvent('mousedown', { clientX: 100 });
      Object.defineProperty(downEvent, 'preventDefault', { value: vi.fn() });
      Object.defineProperty(downEvent, 'stopPropagation', { value: vi.fn() });
      wrapper.vm.onHandleMouseDown(downEvent, 0);

      expect(wrapper.vm.dragState).not.toBeNull();
      expect(editor.view.dom.style.pointerEvents).toBe('none');

      window.dispatchEvent(new Event('blur'));
      await nextTick();

      expect(wrapper.vm.dragState).toBeNull();
      expect(editor.view.dom.style.pointerEvents).toBe('auto');
      expect(wrapper.emitted('resize-end')).toBeDefined();

      wrapper.unmount();
    });

    it('should cancel an active row drag when the document becomes hidden', async () => {
      const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });

      try {
        const editor = createMockEditor();
        const metadata = {
          columns: [
            { i: 0, x: 0, w: 100, min: 50, r: 1 },
            { i: 1, x: 100, w: 150, min: 50, r: 1 },
          ],
          rows: [
            { i: 0, y: 0, h: 50, min: 30, r: 1 },
            { i: 1, y: 50, h: 50, min: 30, r: 1 },
          ],
        };
        const tableElement = createMockTableElement(metadata);
        const wrapper = mount(TableResizeOverlay, {
          props: {
            editor,
            visible: true,
            tableElement,
          },
        });

        await nextTick();

        const downEvent = new MouseEvent('mousedown', { clientY: 50 });
        Object.defineProperty(downEvent, 'preventDefault', { value: vi.fn() });
        Object.defineProperty(downEvent, 'stopPropagation', { value: vi.fn() });
        wrapper.vm.onRowHandleMouseDown(downEvent, 0);

        expect(wrapper.vm.rowDragState).not.toBeNull();
        expect(editor.view.dom.style.pointerEvents).toBe('none');

        document.dispatchEvent(new Event('visibilitychange'));
        await nextTick();

        expect(wrapper.vm.rowDragState).toBeNull();
        expect(editor.view.dom.style.pointerEvents).toBe('auto');
        expect(wrapper.emitted('resize-end')).toBeDefined();

        wrapper.unmount();
      } finally {
        if (originalVisibilityState) {
          Object.defineProperty(document, 'visibilityState', originalVisibilityState);
        } else {
          delete document.visibilityState;
        }
      }
    });
  });
});
