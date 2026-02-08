<template>
  <!-- Prevent mousedown from propagating to editor - critical for clean resize handle drags -->
  <div
    ref="overlayEl"
    v-if="visible && tableMetadata"
    class="superdoc-table-resize-overlay"
    :style="overlayStyle"
    @mousedown.stop
  >
    <!-- Resize handles for each column boundary segment -->
    <template
      v-for="(boundary, resizableBoundaryIndex) in resizableBoundaries"
      :key="`boundary-${resizableBoundaryIndex}`"
    >
      <div
        v-for="(segment, segmentIndex) in getBoundarySegments(boundary)"
        :key="`handle-${boundary.type}-${boundary.index}-${segmentIndex}`"
        class="resize-handle"
        :class="{
          'resize-handle--active': dragState && dragState.resizableBoundaryIndex === resizableBoundaryIndex,
          'resize-handle--edge': boundary.type === 'right-edge',
        }"
        :data-boundary-index="resizableBoundaryIndex"
        :data-boundary-type="boundary.type"
        :style="getSegmentHandleStyle(boundary, segment)"
        @mousedown="onHandleMouseDown($event, resizableBoundaryIndex)"
      ></div>
    </template>

    <!-- Visual guideline during drag -->
    <div v-if="dragState" class="resize-guideline" :style="guidelineStyle"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { pixelsToTwips, twipsToPixels } from '@core/super-converter/helpers.js';
import { measureCache } from '@superdoc/layout-bridge';

/**
 * Props for the TableResizeOverlay component
 */
const props = defineProps({
  /** Editor instance for dispatching transactions */
  editor: {
    type: Object,
    required: true,
  },
  /** Show or hide the overlay */
  visible: {
    type: Boolean,
    default: false,
  },
  /** Table fragment element containing data-table-boundaries */
  tableElement: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['resize-start', 'resize-move', 'resize-end', 'resize-success', 'resize-error']);

const overlayEl = ref(null);
const overlayRect = ref(null);
/**
 * Parsed table metadata from data-table-boundaries attribute
 * @type {import('vue').Ref<{columns: Array<{i: number, x: number, w: number, min: number, r?: number}>} | null>}
 */
const tableMetadata = ref(null);

/**
 * Get the editor's zoom level for coordinate transformations.
 *
 * Retrieves the current zoom multiplier from the editor instance. Zoom is centrally
 * controlled by PresentationEditor via transform: scale() applied to the #viewportHost
 * element. This ensures consistent scaling between rendered content and overlay elements.
 *
 * The zoom factor is critical for accurate coordinate transformations:
 * - Layout coordinates: Unscaled logical pixels used by the layout engine
 * - Screen coordinates: Physical pixels affected by CSS transform: scale()
 * - Conversion: screenCoord = layoutCoord * zoom
 *
 * This function handles both direct PresentationEditor instances and wrapped Editor
 * instances that contain a presentationEditor property.
 *
 * The zoom level is a multiplier where:
 * - 1 = 100% (default, no scaling)
 * - 0.5 = 50% (zoomed out, screen coords are half of layout coords)
 * - 2 = 200% (zoomed in, screen coords are double layout coords)
 *
 * @returns {number} The zoom level multiplier. Returns 1 (100%) as a safe fallback
 *                   if zoom cannot be retrieved from the editor instance.
 *
 * @example
 * ```javascript
 * const zoom = getZoom();
 * // Position resize handle at column boundary
 * const boundaryScreenX = columnLayoutX * zoom;
 * // Check if mouse is within threshold of boundary
 * const mouseLayoutX = event.clientX / zoom;
 * ```
 */
const getZoom = () => {
  const editor = props.editor;
  if (editor && typeof editor.zoom === 'number') {
    return editor.zoom;
  }
  if (editor?.presentationEditor && typeof editor.presentationEditor.zoom === 'number') {
    return editor.presentationEditor.zoom;
  }
  // Fallback to default zoom when editor instance doesn't have zoom configured
  console.warn(
    '[TableResizeOverlay] getZoom: Unable to retrieve zoom from editor instance, using fallback value of 1. ' +
      'This may indicate the editor is not fully initialized or is not a PresentationEditor instance. ' +
      'Table resize handles may be misaligned.',
  );
  return 1;
};

/**
 * Drag state tracking
 * @type {import('vue').Ref<{
 *   columnIndex: number,
 *   resizableBoundaryIndex: number,
 *   isRightEdge: boolean,
 *   initialX: number,
 *   initialWidths: number[],
 *   leftColumn: {width: number, minWidth: number},
 *   rightColumn: {width: number, minWidth: number} | null,
 *   constrainedDelta: number
 * } | null>}
 */
const dragState = ref(null);

/**
 * Flag to track forced cleanup (overlay hidden during drag)
 */
const forcedCleanup = ref(false);

// ============================================================================
// Constants
// ============================================================================

/**
 * Width of the resize handle hit area in pixels.
 *
 * COORDINATE SPACE: This width is in SCREEN SPACE (zoomed pixels).
 * - The handle is positioned using layout coordinates (column boundary x * zoom)
 * - The width itself is a fixed screen-space value (9px) to ensure consistent hit area
 * - This means the handle maintains a constant visual size regardless of zoom level
 * - Users can always grab handles with the same precision, even when zoomed in/out
 *
 * Example: At zoom 2.0, a boundary at layout x=100 renders at screen x=200,
 * but the handle width stays 9 screen pixels for easy interaction.
 */
const RESIZE_HANDLE_WIDTH_PX = 9;

/**
 * Horizontal offset to center the resize handle on the boundary line.
 *
 * COORDINATE SPACE: This offset is in SCREEN SPACE (zoomed pixels).
 * - Applied via CSS transform: translateX() to center the 9px-wide handle
 * - Offset of 4px centers a 9px element on the boundary line (9/2 ≈ 4.5, rounded to 4)
 * - Like RESIZE_HANDLE_WIDTH_PX, this is zoom-independent for consistent UX
 *
 * Visual layout:
 *   Boundary line position: x
 *   Handle left edge: x - 4px
 *   Handle right edge: x + 5px (9px total width)
 *   Result: Boundary line is approximately centered in the handle
 */
const RESIZE_HANDLE_OFFSET_PX = 4;

/** Extension added to overlay width during drag for smooth mouse tracking */
const DRAG_OVERLAY_EXTENSION_PX = 1000;

/** Minimum overlay width during drag operations */
const MIN_DRAG_OVERLAY_WIDTH_PX = 2000;

/** Throttle interval for mouse move events (60fps = ~16.67ms) */
const THROTTLE_INTERVAL_MS = 16;

/** Minimum delta threshold to dispatch a resize transaction (avoids micro-adjustments) */
const MIN_RESIZE_DELTA_PX = 1;

// ============================================================================
// State
// ============================================================================

let rafId = null;
let isUnmounted = false;

/**
 * Starts continuous RAF-based tracking of the overlay position.
 *
 * Uses requestAnimationFrame to continuously update the overlay's position
 * relative to the table element. This ensures handles stay aligned during
 * scrolling, layout changes, and pagination shifts.
 *
 * @returns {void}
 * @sideeffect Sets `rafId` to the current animation frame ID
 * @sideeffect Calls `updateOverlayRect()` on each animation frame
 */
function startOverlayTracking() {
  if (rafId !== null) return;
  const step = () => {
    updateOverlayRect();
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

/**
 * Stops the RAF-based overlay position tracking.
 *
 * Cancels any pending animation frame and resets the tracking state.
 * Should be called when the overlay is hidden or component unmounts.
 *
 * @returns {void}
 * @sideeffect Cancels the animation frame identified by `rafId`
 * @sideeffect Sets `rafId` to null
 */
function stopOverlayTracking() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

/**
 * Overlay position and size relative to table element
 */
const overlayStyle = computed(() => {
  if (!overlayRect.value || !props.tableElement) return {};

  const rect = overlayRect.value;

  // During any drag operation, use a very large overlay to ensure smooth mouse tracking
  // This prevents issues when the mouse moves beyond the original table bounds
  let overlayWidth = rect.width;
  if (dragState.value) {
    // Set a fixed large width during drag to avoid reactive resize triggering re-renders
    overlayWidth = Math.max(rect.width + DRAG_OVERLAY_EXTENSION_PX, MIN_DRAG_OVERLAY_WIDTH_PX);
  }

  return {
    position: 'absolute',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${overlayWidth}px`,
    height: `${rect.height}px`,
    pointerEvents: dragState.value ? 'auto' : 'none',
    zIndex: 10,
  };
});

/**
 * Recompute overlay position/size relative to the overlay's own offset parent.
 * Keeps handles aligned when the table moves (scroll, relayout, pagination shifts).
 */
function updateOverlayRect() {
  if (!props.tableElement) {
    overlayRect.value = null;
    return;
  }

  const tableRect = props.tableElement.getBoundingClientRect();

  // Validate rect has non-zero dimensions
  if (tableRect.width === 0 || tableRect.height === 0) {
    overlayRect.value = null;
    return;
  }

  // Position overlay relative to its own offset parent (the element that
  // position:absolute resolves against), NOT the table's offset parent.
  // The table's offsetParent is its .superdoc-page, but the overlay is rendered
  // as a child of .super-editor — a different coordinate space. Using the table's
  // page as reference caused the overlay to be mispositioned on pages after the first.
  const referenceEl = overlayEl.value?.offsetParent;
  if (referenceEl) {
    const referenceRect = referenceEl.getBoundingClientRect();
    const left = tableRect.left - referenceRect.left + (referenceEl.scrollLeft || 0);
    const top = tableRect.top - referenceRect.top + (referenceEl.scrollTop || 0);
    overlayRect.value = {
      left,
      top,
      width: tableRect.width,
      height: tableRect.height,
    };
  } else {
    // Fallback: use table's own offset position
    overlayRect.value = {
      left: props.tableElement.offsetLeft,
      top: props.tableElement.offsetTop,
      width: tableRect.width,
      height: tableRect.height,
    };
  }
}

/**
 * Filter to only resizable column boundaries
 * Creates handles for:
 * - Inner boundaries (between columns)
 * - Right edge (resize last column)
 */
const resizableBoundaries = computed(() => {
  if (!tableMetadata.value?.columns) {
    return [];
  }

  const columns = tableMetadata.value.columns;
  const boundaries = [];

  // Create handles for inner column boundaries (between columns)
  for (let i = 0; i < columns.length - 1; i++) {
    const col = columns[i];
    const nextCol = columns[i + 1];

    boundaries.push({
      ...col,
      index: i,
      x: nextCol.x,
      type: 'inner',
    });
  }

  // Add handle for right edge of table (resize last column)
  const lastCol = columns[columns.length - 1];
  boundaries.push({
    ...lastCol,
    index: columns.length - 1,
    x: lastCol.x + lastCol.w,
    type: 'right-edge',
  });

  return boundaries;
});

/**
 * Retrieves vertical segments for a column boundary where resize handles should appear.
 *
 * Segments define the vertical ranges where a column boundary is visible and resizable,
 * accounting for merged cells that span multiple rows. A boundary at column index N
 * exists only where cells end at that column position.
 *
 * **Segment Structure:**
 * Each segment has:
 * - `y`: Vertical position in pixels from table top
 * - `h`: Height in pixels, or `null` for full-height (100%)
 *
 * **Right Edge Handling:**
 * Right-edge boundaries always span full height since they represent the table's
 * outer edge.
 *
 * **Merged Cell Handling:**
 * When cells span multiple columns, some boundaries don't exist at certain rows.
 * For example, if row 0 has a cell spanning columns 0-2, there's no boundary at
 * column 1 for that row.
 *
 * @param {{index: number, type: string, ...rest: unknown}} boundary - Column boundary data with index and type properties
 * @returns {Array<{y: number, h: number | null}>} Array of vertical segments where handles should render, or empty array if boundary is fully covered by merged cells
 *
 * @example
 * ```typescript
 * // Right edge boundary - always full height
 * getBoundarySegments({ index: 2, type: 'right-edge' })
 * // Returns: [{ y: 0, h: null }]
 *
 * // Inner boundary with segments at specific rows
 * getBoundarySegments({ index: 1, type: 'inner' })
 * // Returns: [{ y: 0, h: 50 }, { y: 100, h: 25 }]
 *
 * // Boundary completely covered by merged cells
 * getBoundarySegments({ index: 1, type: 'inner' })
 * // Returns: []
 * ```
 */
function getBoundarySegments(boundary) {
  // For right-edge, always show full height
  if (boundary.type === 'right-edge') {
    return [{ y: 0, h: null }]; // null height means 100%
  }

  // Get segments for this boundary column from metadata
  // The boundary at index N is between columns N and N+1
  // So we look up segments for column index N+1 (the right edge of column N)
  const segmentsData = tableMetadata.value?.segments;
  if (!segmentsData || !Array.isArray(segmentsData)) {
    // Fallback to full-height if no segments data
    return [{ y: 0, h: null }];
  }

  // boundary.index is the column index, the boundary is at boundary.index + 1
  const boundaryColIndex = boundary.index + 1;
  const colSegments = segmentsData[boundaryColIndex];

  if (!colSegments || colSegments.length === 0) {
    // No segments for this boundary - it's completely inside merged cells
    // Return empty array to hide handle entirely for this boundary
    return [];
  }

  return colSegments
    .filter((seg) => seg && typeof seg === 'object')
    .map((seg) => ({
      y: typeof seg.y === 'number' ? seg.y : 0,
      h: seg.h !== null && typeof seg.h === 'number' ? seg.h : null,
    }));
}

/**
 * Generates CSS styles for positioning a resize handle segment.
 *
 * Creates an absolutely-positioned element at the specified column boundary,
 * with vertical positioning and height determined by the segment. The handle
 * is offset horizontally to center it on the boundary line.
 *
 * **Positioning Logic:**
 * - Horizontal: Positioned at `boundary.x` with -4px transform to center the 9px-wide handle
 * - Vertical: Uses `segment.y` for top position, or 0 if null
 * - Height: Uses `segment.h` for pixel height, or '100%' if null
 *
 * **Interaction:**
 * - Cursor is set to 'col-resize' for visual feedback
 * - Pointer events enabled to capture mouse interactions
 *
 * @param {{x: number, index: number, ...rest: unknown}} boundary - Column boundary data containing x position
 * @param {{y: number | null, h: number | null}} segment - Segment position (y) and height (h), null values use defaults
 * @returns {Record<string, string>} CSS style object for the handle element
 *
 * @example
 * ```typescript
 * // Full-height handle at x=100
 * getSegmentHandleStyle({ x: 100, index: 0 }, { y: null, h: null })
 * // Returns: { position: 'absolute', left: '100px', top: '0', width: '9px', height: '100%', ... }
 *
 * // Segment handle from y=50 with height 75px
 * getSegmentHandleStyle({ x: 200, index: 1 }, { y: 50, h: 75 })
 * // Returns: { position: 'absolute', left: '200px', top: '50px', width: '9px', height: '75px', ... }
 * ```
 */
function getSegmentHandleStyle(boundary, segment) {
  // Get zoom factor to convert layout coordinates to screen coordinates
  const zoom = getZoom();

  // Multiply layout coordinates by zoom to position correctly in zoomed space
  const scaledX = boundary.x * zoom;
  const scaledY = segment.y != null ? segment.y * zoom : null;
  const scaledH = segment.h != null ? segment.h * zoom : null;

  return {
    position: 'absolute',
    left: `${scaledX}px`,
    top: scaledY != null ? `${scaledY}px` : '0',
    width: `${RESIZE_HANDLE_WIDTH_PX}px`,
    height: scaledH != null ? `${scaledH}px` : '100%',
    transform: `translateX(-${RESIZE_HANDLE_OFFSET_PX}px)`,
    cursor: 'col-resize',
    pointerEvents: 'auto',
  };
}

/**
 * Style for the drag guideline
 */
const guidelineStyle = computed(() => {
  if (!dragState.value || !tableMetadata.value) return { display: 'none' };

  const initialBoundary = resizableBoundaries.value[dragState.value.resizableBoundaryIndex];
  if (!initialBoundary) return { display: 'none' };

  // Get zoom factor to convert layout coordinates to screen coordinates
  const zoom = getZoom();

  // constrainedDelta is in layout coordinates, so the entire calculation stays in layout space
  // Then multiply by zoom to convert to screen coordinates
  const newX = (initialBoundary.x + dragState.value.constrainedDelta) * zoom;

  return {
    position: 'absolute',
    left: `${newX}px`,
    top: '0',
    width: '2px',
    height: '100%',
    backgroundColor: '#4A90E2',
    pointerEvents: 'none',
    zIndex: 20,
  };
});

/**
 * Parses table metadata from the `data-table-boundaries` attribute on the table element.
 *
 * Extracts column boundary information including positions, widths, and minimum widths.
 * Also extracts segment data for merged cell support when present.
 *
 * The metadata is validated to ensure:
 * - Column indices (`i`) are non-negative integers
 * - Column positions (`x`) are non-negative
 * - Column widths (`w`) are positive
 * - Minimum widths (`min`) are positive
 * - Resize flag (`r`) is 0 or 1
 *
 * @returns {void}
 * @sideeffect Sets `tableMetadata.value` to parsed metadata or null
 * @emits resize-error When metadata is corrupted, empty after validation, or fails to parse
 *
 * @example
 * ```typescript
 * // Called automatically when tableElement prop changes
 * // Metadata format: { columns: [...], segments: [...] }
 * parseTableMetadata();
 * // tableMetadata.value = { columns: [{i: 0, x: 0, w: 100, min: 50, r: 1}, ...], segments: [...] }
 * ```
 */
function parseTableMetadata() {
  if (!props.tableElement) {
    tableMetadata.value = null;
    return;
  }

  try {
    const boundariesAttr = props.tableElement.getAttribute('data-table-boundaries');
    if (!boundariesAttr) {
      tableMetadata.value = null;
      return;
    }

    const parsed = JSON.parse(boundariesAttr);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.columns)) {
      tableMetadata.value = null;
      return;
    }

    const validatedColumns = parsed.columns
      .filter((col) => {
        return (
          typeof col === 'object' &&
          Number.isFinite(col.i) &&
          col.i >= 0 &&
          Number.isFinite(col.x) &&
          col.x >= 0 &&
          Number.isFinite(col.w) &&
          col.w > 0 &&
          Number.isFinite(col.min) &&
          col.min > 0 &&
          (col.r === 0 || col.r === 1)
        );
      })
      .map((col) => ({
        i: col.i,
        x: Math.max(0, col.x),
        w: Math.max(1, col.w),
        min: Math.max(1, col.min),
        r: col.r,
      }));

    // Check for corrupted metadata - valid JSON but empty/invalid structure
    if (validatedColumns.length === 0) {
      tableMetadata.value = null;
      emit('resize-error', {
        error: 'Table metadata is corrupted or empty after validation',
        rawMetadata: boundariesAttr,
      });
      return;
    }

    // Extract segments if present (for merged cell support)
    // segments[colIndex] contains segment data for that column boundary
    // Each segment has {c: columnIndex, y: yPosition, h: height}
    const segments = Array.isArray(parsed.segments) ? parsed.segments : undefined;

    tableMetadata.value = { columns: validatedColumns, segments };
  } catch (error) {
    tableMetadata.value = null;
    emit('resize-error', {
      error: error instanceof Error ? error.message : 'Failed to parse table boundaries',
      rawMetadata: props.tableElement?.getAttribute('data-table-boundaries'),
    });
  }
}

/**
 * Handle mouse down on resize handle
 * @param {MouseEvent} event - Mouse event
 * @param {number} resizableBoundaryIndex - Index in the resizableBoundaries array
 */
function onHandleMouseDown(event, resizableBoundaryIndex) {
  event.preventDefault();
  event.stopPropagation();

  if (!tableMetadata.value?.columns) return;

  const boundary = resizableBoundaries.value[resizableBoundaryIndex];
  if (!boundary) return;

  const columns = tableMetadata.value.columns;
  const isRightEdge = boundary.type === 'right-edge';

  const leftColumn = columns[boundary.index];
  const rightColumn = isRightEdge ? null : columns[boundary.index + 1];

  // Store initial state
  dragState.value = {
    columnIndex: boundary.index,
    resizableBoundaryIndex,
    isRightEdge,
    initialX: event.clientX,
    initialWidths: columns.map((col) => col.w),
    leftColumn: {
      width: leftColumn.w,
      minWidth: leftColumn.min,
    },
    rightColumn: rightColumn
      ? {
          width: rightColumn.w,
          minWidth: rightColumn.min,
        }
      : null,
    constrainedDelta: 0,
  };

  // Disable pointer events on PM view to prevent conflicts
  if (!props.editor?.view?.dom) {
    emit('resize-error', { error: 'Editor view not available' });
    dragState.value = null;
    return;
  }
  const pmView = props.editor.view.dom;
  pmView.style.pointerEvents = 'none';

  // Add global listeners
  try {
    document.addEventListener('mousemove', onDocumentMouseMove);
    document.addEventListener('mouseup', onDocumentMouseUp);

    emit('resize-start', {
      columnIndex: boundary.index,
      isRightEdge,
      initialWidths: dragState.value.initialWidths,
    });
  } catch (error) {
    document.removeEventListener('mousemove', onDocumentMouseMove);
    document.removeEventListener('mouseup', onDocumentMouseUp);
    pmView.style.pointerEvents = 'auto';
    dragState.value = null;
    emit('resize-error', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Throttle function with cancellation support to prevent memory leaks
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum time between executions (ms)
 * @returns {{throttled: Function, cancel: Function}} Throttled function and cancel function
 */
function throttle(func, limit) {
  let inThrottle;
  let timeoutId = null;

  const throttled = function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      timeoutId = setTimeout(() => {
        inThrottle = false;
        timeoutId = null;
      }, limit);
    }
  };

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      inThrottle = false;
    }
  };

  return { throttled, cancel };
}

// Create throttled mouse move handler with cancellation
const mouseMoveThrottle = throttle((event) => {
  if (isUnmounted || !dragState.value) return;

  // Get zoom factor to convert screen coordinates to layout coordinates
  const zoom = getZoom();

  // Calculate raw delta in screen pixels, then convert to layout space
  // This ensures constraints (which are in layout space) can be compared correctly
  const screenDelta = event.clientX - dragState.value.initialX;
  const delta = screenDelta / zoom;

  // Calculate constraints based on layout-computed minWidth (already in layout space)
  const minDelta = -(dragState.value.leftColumn.width - dragState.value.leftColumn.minWidth);

  // For right edge, constrain by page content area to prevent overflow beyond margins
  // For inner boundaries, constrain by right column's minimum
  let maxDelta;
  if (dragState.value.isRightEdge) {
    // Get the page element (superdoc-page) which represents the physical page
    const tableRect = props.tableElement.getBoundingClientRect();
    const pageEl = props.tableElement.closest('.superdoc-page');

    if (pageEl) {
      const pageRect = pageEl.getBoundingClientRect();
      const tableLeftInPage = tableRect.left - pageRect.left;
      const rightMargin = tableLeftInPage; // Assumes symmetric margins
      const maxRightPosition = pageRect.right - rightMargin;
      // availableSpace is in screen pixels (from getBoundingClientRect),
      // convert to layout space by dividing by zoom
      const availableSpace = (maxRightPosition - tableRect.right) / zoom;
      maxDelta = Math.max(0, availableSpace);
    } else {
      // No page element found - allow unlimited expansion (fallback)
      maxDelta = Infinity;
    }
  } else {
    // rightColumn dimensions are already in layout space
    maxDelta = dragState.value.rightColumn.width - dragState.value.rightColumn.minWidth;
  }

  // Constrain delta
  const constrainedDelta = Math.max(minDelta, Math.min(maxDelta, delta));

  // Update visual guideline only (no PM transaction yet)
  dragState.value.constrainedDelta = constrainedDelta;

  emit('resize-move', {
    columnIndex: dragState.value.columnIndex,
    delta: constrainedDelta,
  });
}, THROTTLE_INTERVAL_MS);

/** Handle mouse move during drag (throttled to 16ms for 60fps) */
const onDocumentMouseMove = mouseMoveThrottle.throttled;

/**
 * Handle mouse up to end drag
 * @param {MouseEvent} event - Mouse event
 */
function onDocumentMouseUp(event) {
  if (!dragState.value) return;

  const finalDelta = dragState.value.constrainedDelta;
  const columnIndex = dragState.value.columnIndex;
  const initialWidths = dragState.value.initialWidths;
  const isRightEdge = dragState.value.isRightEdge;

  // Calculate final column widths
  const newWidths = [...initialWidths];
  newWidths[columnIndex] = initialWidths[columnIndex] + finalDelta;

  // Only adjust right column if this is an inner boundary (not right edge)
  if (!isRightEdge) {
    newWidths[columnIndex + 1] = initialWidths[columnIndex + 1] - finalDelta;
  }

  // Clean up event listeners and restore pointer events
  document.removeEventListener('mousemove', onDocumentMouseMove);
  document.removeEventListener('mouseup', onDocumentMouseUp);

  if (props.editor?.view?.dom) {
    const pmView = props.editor.view.dom;
    pmView.style.pointerEvents = 'auto';
  }

  // Only dispatch transaction if:
  // 1. Not a forced cleanup
  // 2. Delta is significant (> MIN_RESIZE_DELTA_PX)
  if (!forcedCleanup.value && Math.abs(finalDelta) > MIN_RESIZE_DELTA_PX) {
    dispatchResizeTransaction(columnIndex, newWidths);

    emit('resize-end', {
      columnIndex,
      finalWidths: newWidths,
      delta: finalDelta,
    });
  }

  // Clear drag state
  dragState.value = null;
}

/**
 * Dispatch ProseMirror transaction to update column widths
 * Updates both grid (twips) and colwidth (pixels) attributes
 *
 * @param {number} columnIndex - Index of the resized column
 * @param {number[]} newWidths - New column widths in pixels
 */
function dispatchResizeTransaction(columnIndex, newWidths) {
  if (!props.editor?.view || !props.tableElement) {
    return;
  }

  try {
    const { state, dispatch } = props.editor.view;
    const tr = state.tr;

    // Find table position
    const tablePos = findTablePosition(state, props.tableElement);

    if (tablePos === null) {
      emit('resize-error', {
        columnIndex,
        error: 'Table position not found in document',
      });
      return;
    }

    // Get table node
    const tableNode = state.doc.nodeAt(tablePos);

    if (!tableNode || tableNode.type.name !== 'table') {
      emit('resize-error', {
        columnIndex,
        error: 'Invalid table node at position',
      });
      return;
    }

    // Convert pixel widths to twips for grid attribute
    const gridTwips = newWidths.map((w) => pixelsToTwips(w));
    const newGrid = gridTwips.map((twips) => ({ col: twips }));

    // Calculate total table width in twips for tableWidth attribute
    const totalWidthTwips = gridTwips.reduce((sum, w) => sum + w, 0);

    // Update table node with new grid, tableWidth, and userEdited flag
    const newAttrs = {
      ...tableNode.attrs,
      grid: newGrid,
      tableWidth: totalWidthTwips,
      userEdited: true,
    };

    tr.setNodeMarkup(tablePos, null, newAttrs);

    // Update affected cell colwidth attributes
    const affectedColumns = [columnIndex, columnIndex + 1];
    updateCellColwidths(tr, tableNode, tablePos, affectedColumns, newWidths);

    // Dispatch transaction
    dispatch(tr);

    // Invalidate the measure cache for this table to force re-measurement with new widths
    const blockId = props.tableElement?.getAttribute('data-sd-block-id');
    if (blockId && blockId.trim()) {
      measureCache.invalidate([blockId]);
    }

    // Emit success event
    emit('resize-success', { columnIndex, newWidths });
  } catch (error) {
    emit('resize-error', {
      columnIndex,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Find the position of the table node in the document
 * @param {Object} state - ProseMirror state
 * @param {HTMLElement} tableElement - Table DOM element
 * @returns {number | null} Position of table node or null
 */
function findTablePosition(state, tableElement) {
  // Strategy: Use ProseMirror position markers (data-pm-start/data-pm-end) from table cells
  // to find which table node in the document matches this DOM element

  // Find any element with data-pm-start inside the table
  const pmElement = tableElement.querySelector('[data-pm-start]');

  if (!pmElement) {
    return null;
  }

  const pmStartAttr = pmElement.getAttribute('data-pm-start');
  if (!pmStartAttr) {
    return null;
  }

  const pmStart = parseInt(pmStartAttr, 10);
  if (!Number.isFinite(pmStart)) {
    return null;
  }

  // Find the table node that contains this position
  let tablePos = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      const tableEnd = pos + node.nodeSize;

      // Check if pmStart is within this table's range
      if (pmStart >= pos && pmStart < tableEnd) {
        tablePos = pos;
        return false; // Stop iteration
      }
    }
  });

  return tablePos;
}

/**
 * Update colwidth attributes on cells in affected columns
 * Uses ProseMirror's descendants API for proper position resolution
 * @param {Object} tr - ProseMirror transaction
 * @param {Object} tableNode - Table node
 * @param {number} tablePos - Position of table node
 * @param {number[]} affectedColumns - Column indices that changed
 * @param {number[]} newWidths - New column widths in pixels
 */
function updateCellColwidths(tr, tableNode, tablePos, affectedColumns, newWidths) {
  let currentRow = 0;
  let currentCol = 0;

  tableNode.descendants((node, pos, parent) => {
    if (node.type.name === 'tableRow') {
      currentCol = 0;
      return true; // Continue descending
    }

    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      const { colspan = 1 } = node.attrs;

      // Check if this cell is in an affected column
      const cellAffectsColumns = affectedColumns.some(
        (affectedCol) => affectedCol >= currentCol && affectedCol < currentCol + colspan,
      );

      if (cellAffectsColumns) {
        // Calculate absolute position in document
        const absolutePos = tablePos + 1 + pos;

        // Build new colwidth array for this cell
        const newColwidth = [];
        for (let i = 0; i < colspan; i++) {
          const colIndex = currentCol + i;
          const width = newWidths[colIndex];
          if (width !== undefined && width > 0) {
            newColwidth.push(width);
          }
        }

        // Only update if we have valid widths
        // colwidth must always be an array, even for single columns
        if (newColwidth.length > 0) {
          tr.setNodeMarkup(absolutePos, null, {
            ...node.attrs,
            colwidth: newColwidth,
          });
        }
      }

      currentCol += colspan;
      return false; // Don't descend into cell content
    }

    return true;
  });
}

/**
 * Watch for changes to table element and reparse metadata
 */
watch(
  () => props.tableElement,
  () => {
    parseTableMetadata();
    updateOverlayRect();
    if (props.visible && props.tableElement) {
      startOverlayTracking();
    } else if (!props.tableElement) {
      stopOverlayTracking();
    }
  },
  { immediate: true },
);

/**
 * Watch for visibility changes
 */
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      parseTableMetadata();
      updateOverlayRect();
      startOverlayTracking();
    } else {
      stopOverlayTracking();
      // Clean up drag state if overlay is hidden
      if (dragState.value) {
        forcedCleanup.value = true;
        onDocumentMouseUp(new MouseEvent('mouseup'));
        forcedCleanup.value = false;
      }
    }
  },
);

onMounted(() => {
  window.addEventListener('scroll', updateOverlayRect, true);
  window.addEventListener('resize', updateOverlayRect);
  updateOverlayRect();
});

/**
 * Clean up on unmount
 */
onBeforeUnmount(() => {
  // Set unmounted flag to prevent post-unmount throttled calls
  isUnmounted = true;

  // Cancel any pending throttled calls to prevent memory leaks
  mouseMoveThrottle.cancel();
  stopOverlayTracking();

  if (dragState.value) {
    document.removeEventListener('mousemove', onDocumentMouseMove);
    document.removeEventListener('mouseup', onDocumentMouseUp);

    // Re-enable PM pointer events
    if (props.editor?.view?.dom) {
      props.editor.view.dom.style.pointerEvents = 'auto';
    }
  }

  window.removeEventListener('scroll', updateOverlayRect, true);
  window.removeEventListener('resize', updateOverlayRect);
});
</script>

<style scoped>
.superdoc-table-resize-overlay {
  position: absolute;
  pointer-events: none;
  user-select: none;
}

.resize-handle {
  position: absolute;
  cursor: col-resize;
  user-select: none;
  z-index: 15;
}

.resize-handle::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  width: 2px;
  height: 100%;
  background-color: rgba(74, 144, 226, 0.3);
  transform: translateX(-1px);
  transition:
    background-color 0.2s ease,
    width 0.2s ease;
}

.resize-handle:hover::before {
  background-color: #4a90e2;
  width: 3px;
  transform: translateX(-1.5px);
}

.resize-handle--active::before {
  background-color: #4a90e2;
  width: 2px;
  transform: translateX(-1px);
}

.resize-guideline {
  position: absolute;
  background-color: #4a90e2;
  pointer-events: none;
  box-shadow: 0 0 4px rgba(74, 144, 226, 0.5);
}
</style>
