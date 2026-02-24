<template>
  <div v-if="visible && imageMetadata" class="superdoc-image-resize-overlay" :style="overlayStyle" @mousedown.stop>
    <!-- Resize handles for each corner -->
    <div
      v-for="handle in resizeHandles"
      :key="handle.position"
      class="resize-handle"
      :class="{
        'resize-handle--active': dragState && dragState.handle === handle.position,
        [`resize-handle--${handle.position}`]: true,
      }"
      :style="handle.style"
      :data-handle-position="handle.position"
      @mousedown="onHandleMouseDown($event, handle.position)"
    ></div>

    <!-- Visual guideline during drag -->
    <div v-if="dragState" class="resize-guideline" :style="guidelineStyle"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { measureCache } from '@superdoc/layout-bridge';

// Configuration constants
const OVERLAY_EXPANSION_PX = 2000;
const RESIZE_HANDLE_SIZE_PX = 12;
const MOUSE_MOVE_THROTTLE_MS = 16; // ~60fps
const DIMENSION_CHANGE_THRESHOLD_PX = 1;
const Z_INDEX_OVERLAY = 10;
const Z_INDEX_HANDLE = 15;
const Z_INDEX_GUIDELINE = 20;

/**
 * Validates that the editor prop conforms to expected ProseMirror structure
 * @param {Object} editor - Editor object to validate
 * @returns {boolean} True if editor is valid, false otherwise
 */
function isValidEditor(editor) {
  return (
    editor &&
    typeof editor === 'object' &&
    editor.view &&
    typeof editor.view === 'object' &&
    editor.view.dom instanceof HTMLElement &&
    editor.view.state &&
    typeof editor.view.dispatch === 'function'
  );
}

/**
 * Props for the ImageResizeOverlay component
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
  /** Image fragment element containing data-image-metadata */
  imageElement: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['resize-start', 'resize-move', 'resize-end', 'resize-success', 'resize-error']);

/**
 * Parsed image metadata from data-image-metadata attribute
 */
const imageMetadata = ref(null);

/**
 * Drag state tracking
 * @type {import('vue').Ref<{
 *   handle: 'nw' | 'ne' | 'sw' | 'se',
 *   initialX: number,
 *   initialY: number,
 *   initialWidth: number,
 *   initialHeight: number,
 *   aspectRatio: number,
 *   constrainedWidth: number,
 *   constrainedHeight: number
 * } | null>}
 */
const dragState = ref(null);

/**
 * Flag to track forced cleanup (overlay hidden during drag)
 */
const forcedCleanup = ref(false);

/**
 * Overlay position and size relative to image element.
 * The overlay is rendered inside .super-editor wrapper, so we need to
 * calculate the image position relative to that wrapper.
 */
const overlayStyle = computed(() => {
  if (!props.imageElement || !props.imageElement.isConnected) return {};

  const imageRect = props.imageElement.getBoundingClientRect();

  // Find the wrapper element (.super-editor) which is the overlay's positioned parent
  const wrapper = props.imageElement.closest('.super-editor');
  if (!wrapper) {
    // Fallback to offsetLeft/offsetTop if wrapper not found
    return {
      position: 'absolute',
      left: `${props.imageElement.offsetLeft}px`,
      top: `${props.imageElement.offsetTop}px`,
      width: `${imageRect.width}px`,
      height: `${imageRect.height}px`,
      pointerEvents: dragState.value ? 'auto' : 'none',
      zIndex: Z_INDEX_OVERLAY,
    };
  }

  const wrapperRect = wrapper.getBoundingClientRect();

  // Calculate image position relative to wrapper, accounting for wrapper scroll
  const scrollLeft = wrapper.scrollLeft || 0;
  const scrollTop = wrapper.scrollTop || 0;
  const relativeLeft = imageRect.left - wrapperRect.left + scrollLeft;
  const relativeTop = imageRect.top - wrapperRect.top + scrollTop;

  // During drag, expand overlay to track mouse movements beyond image bounds
  let overlayWidth = imageRect.width;
  let overlayHeight = imageRect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (dragState.value) {
    // Expand overlay in all directions during drag
    const expansion = OVERLAY_EXPANSION_PX;
    overlayWidth = imageRect.width + expansion * 2;
    overlayHeight = imageRect.height + expansion * 2;
    offsetX = -expansion;
    offsetY = -expansion;
  }

  return {
    position: 'absolute',
    left: `${relativeLeft + offsetX}px`,
    top: `${relativeTop + offsetY}px`,
    width: `${overlayWidth}px`,
    height: `${overlayHeight}px`,
    pointerEvents: dragState.value ? 'auto' : 'none',
    zIndex: Z_INDEX_OVERLAY,
  };
});

/**
 * Compute resize handle positions (NW, NE, SW, SE corners)
 * Handles are positioned relative to the overlay container, which is already
 * positioned at the image's offsetLeft/offsetTop.
 *
 * When dragging is active, the overlay expands by 2000px in all directions,
 * so handle positions must be offset by the expansion amount.
 */
const resizeHandles = computed(() => {
  if (!imageMetadata.value || !props.imageElement) {
    return [];
  }

  const rect = props.imageElement.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const handleSize = RESIZE_HANDLE_SIZE_PX;
  const offset = handleSize / 2;

  // During drag, the overlay is expanded and offset by 2000px in all directions.
  // The handles need to compensate for this shift to stay at the image corners.
  const expansion = dragState.value ? OVERLAY_EXPANSION_PX : 0;

  // Handles are positioned relative to the overlay, which is already at the image position
  // So corners are at (0,0), (width,0), (0,height), (width,height)
  // During drag, add expansion offset to keep handles at the image corners
  return [
    {
      position: 'nw',
      style: {
        left: `${expansion - offset}px`,
        top: `${expansion - offset}px`,
        cursor: 'nwse-resize',
      },
    },
    {
      position: 'ne',
      style: {
        left: `${expansion + width - offset}px`,
        top: `${expansion - offset}px`,
        cursor: 'nesw-resize',
      },
    },
    {
      position: 'sw',
      style: {
        left: `${expansion - offset}px`,
        top: `${expansion + height - offset}px`,
        cursor: 'nesw-resize',
      },
    },
    {
      position: 'se',
      style: {
        left: `${expansion + width - offset}px`,
        top: `${expansion + height - offset}px`,
        cursor: 'nwse-resize',
      },
    },
  ];
});

/**
 * Style for the drag guideline
 * The guideline shows the prospective new size during drag.
 * During drag, the overlay is expanded by 2000px in all directions,
 * so the guideline position must be offset accordingly.
 */
const guidelineStyle = computed(() => {
  if (!dragState.value || !props.imageElement) {
    return { display: 'none' };
  }

  // During drag, the overlay is expanded and offset by 2000px.
  // The guideline should appear at the image position within the expanded overlay.
  const expansion = OVERLAY_EXPANSION_PX;

  return {
    position: 'absolute',
    left: `${expansion}px`,
    top: `${expansion}px`,
    width: `${dragState.value.constrainedWidth}px`,
    height: `${dragState.value.constrainedHeight}px`,
    border: '2px solid #4A90E2',
    pointerEvents: 'none',
    zIndex: Z_INDEX_GUIDELINE,
    boxSizing: 'border-box',
  };
});

/**
 * Parse and validate image metadata from DOM element's data-image-metadata attribute
 *
 * Metadata includes constraints for resize operations:
 * - originalWidth/originalHeight: Measured dimensions before layout constraints
 * - maxWidth/maxHeight: Maximum allowed dimensions based on layout context
 * - aspectRatio: Width/height ratio to maintain during resize
 * - minWidth/minHeight: Minimum allowed dimensions
 *
 * @remarks
 * This function validates all required fields to ensure resize operations
 * can proceed safely. Invalid or missing metadata will hide the overlay.
 */
function parseImageMetadata() {
  if (!props.imageElement || !props.imageElement.isConnected) {
    imageMetadata.value = null;
    return;
  }

  // When image has clipPath the overlay receives the wrapper; metadata is on the inner img
  const metaEl = props.imageElement.hasAttribute('data-image-metadata')
    ? props.imageElement
    : props.imageElement.querySelector?.('[data-image-metadata]');
  const metadataAttr = metaEl?.getAttribute?.('data-image-metadata');
  try {
    if (!metadataAttr) {
      imageMetadata.value = null;
      return;
    }

    const parsed = JSON.parse(metadataAttr);
    if (!parsed || typeof parsed !== 'object') {
      imageMetadata.value = null;
      return;
    }

    // Validate required fields
    const required = [
      'originalWidth',
      'originalHeight',
      'maxWidth',
      'maxHeight',
      'aspectRatio',
      'minWidth',
      'minHeight',
    ];
    for (const field of required) {
      if (!Number.isFinite(parsed[field]) || parsed[field] <= 0) {
        console.warn(`[ImageResizeOverlay] Invalid or missing metadata field: ${field}`);
        imageMetadata.value = null;
        return;
      }
    }

    imageMetadata.value = parsed;
  } catch (error) {
    imageMetadata.value = null;
    emit('resize-error', {
      error: error instanceof Error ? error.message : 'Failed to parse image metadata',
      rawMetadata: metadataAttr,
    });
  }
}

/**
 * Handle mouse down on resize handle
 * @param {MouseEvent} event - Mouse event
 * @param {'nw' | 'ne' | 'sw' | 'se'} handlePosition - Handle position
 */
function onHandleMouseDown(event, handlePosition) {
  event.preventDefault();
  event.stopPropagation();

  if (!isValidEditor(props.editor) || !imageMetadata.value || !props.imageElement) return;

  const rect = props.imageElement.getBoundingClientRect();

  // Store initial state
  dragState.value = {
    handle: handlePosition,
    initialX: event.clientX,
    initialY: event.clientY,
    initialWidth: rect.width,
    initialHeight: rect.height,
    aspectRatio: imageMetadata.value.aspectRatio,
    constrainedWidth: rect.width,
    constrainedHeight: rect.height,
  };

  // Disable pointer events on PM view to prevent conflicts
  const pmView = props.editor.view.dom;
  pmView.style.pointerEvents = 'none';

  // Add global listeners
  document.addEventListener('mousemove', onDocumentMouseMove);
  document.addEventListener('mouseup', onDocumentMouseUp);
  document.addEventListener('keydown', onEscapeKey);

  emit('resize-start', {
    blockId: props.imageElement.getAttribute('data-sd-block-id'),
    initialWidth: rect.width,
    initialHeight: rect.height,
  });
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
  if (!dragState.value || !imageMetadata.value) return;

  // Calculate deltas based on handle position
  let deltaX = event.clientX - dragState.value.initialX;
  let deltaY = event.clientY - dragState.value.initialY;

  // Adjust deltas based on handle position
  const handle = dragState.value.handle;
  if (handle === 'nw') {
    deltaX = -deltaX;
    deltaY = -deltaY;
  } else if (handle === 'ne') {
    deltaY = -deltaY;
  } else if (handle === 'sw') {
    deltaX = -deltaX;
  }
  // For 'se', deltas are already positive

  // Calculate new dimensions maintaining aspect ratio
  // Use the larger delta to determine scale
  const scaleX = (dragState.value.initialWidth + deltaX) / dragState.value.initialWidth;
  const scaleY = (dragState.value.initialHeight + deltaY) / dragState.value.initialHeight;

  // Use the larger scale to maintain aspect ratio
  const scale = Math.max(scaleX, scaleY);

  let newWidth = dragState.value.initialWidth * scale;
  let newHeight = dragState.value.initialHeight * scale;

  // Apply constraints
  const minWidth = imageMetadata.value.minWidth;
  const minHeight = imageMetadata.value.minHeight;
  const maxWidth = imageMetadata.value.maxWidth;
  const maxHeight = imageMetadata.value.maxHeight;

  // Constrain to min/max while maintaining aspect ratio
  if (newWidth < minWidth) {
    newWidth = minWidth;
    newHeight = newWidth / dragState.value.aspectRatio;
  }
  if (newHeight < minHeight) {
    newHeight = minHeight;
    newWidth = newHeight * dragState.value.aspectRatio;
  }
  if (newWidth > maxWidth) {
    newWidth = maxWidth;
    newHeight = newWidth / dragState.value.aspectRatio;
  }
  if (newHeight > maxHeight) {
    newHeight = maxHeight;
    newWidth = newHeight * dragState.value.aspectRatio;
  }

  // Update visual guideline only (no PM transaction yet)
  dragState.value.constrainedWidth = newWidth;
  dragState.value.constrainedHeight = newHeight;

  emit('resize-move', {
    blockId: props.imageElement.getAttribute('data-sd-block-id'),
    width: newWidth,
    height: newHeight,
  });
}, MOUSE_MOVE_THROTTLE_MS);

/** Handle mouse move during drag (throttled to 16ms for 60fps) */
const onDocumentMouseMove = mouseMoveThrottle.throttled;

/**
 * Handle escape key to cancel drag operation
 * @param {KeyboardEvent} event - Keyboard event
 */
function onEscapeKey(event) {
  if (event.key === 'Escape' && dragState.value) {
    // Cancel drag without dispatching transaction
    forcedCleanup.value = true;
    onDocumentMouseUp(new MouseEvent('mouseup'));
    forcedCleanup.value = false;
  }
}

/**
 * Handle mouse up to end drag
 * @param {MouseEvent} event - Mouse event
 */
function onDocumentMouseUp(event) {
  if (!dragState.value) return;

  const finalWidth = dragState.value.constrainedWidth;
  const finalHeight = dragState.value.constrainedHeight;
  const blockId = props.imageElement?.getAttribute('data-sd-block-id');

  // Clean up event listeners and restore pointer events
  document.removeEventListener('mousemove', onDocumentMouseMove);
  document.removeEventListener('mouseup', onDocumentMouseUp);
  document.removeEventListener('keydown', onEscapeKey);

  if (props.editor?.view) {
    const pmView = props.editor.view.dom;
    if (pmView && pmView.style) {
      pmView.style.pointerEvents = 'auto';
    }
  }

  // Only dispatch transaction if:
  // 1. Not a forced cleanup
  // 2. Dimensions changed significantly (> 1px)
  const widthDelta = Math.abs(finalWidth - dragState.value.initialWidth);
  const heightDelta = Math.abs(finalHeight - dragState.value.initialHeight);

  if (
    !forcedCleanup.value &&
    (widthDelta > DIMENSION_CHANGE_THRESHOLD_PX || heightDelta > DIMENSION_CHANGE_THRESHOLD_PX)
  ) {
    dispatchResizeTransaction(blockId, finalWidth, finalHeight);

    emit('resize-end', {
      blockId,
      finalWidth,
      finalHeight,
    });
  }

  // Clear drag state
  dragState.value = null;
}

/**
 * Dispatch ProseMirror transaction to update image size
 * Updates the image node's size attribute
 *
 * @param {string} blockId - Block ID of the image
 * @param {number} newWidth - New width in pixels
 * @param {number} newHeight - New height in pixels
 */
function dispatchResizeTransaction(blockId, newWidth, newHeight) {
  if (!isValidEditor(props.editor) || !props.imageElement) {
    return;
  }

  // Validate dimensions before proceeding
  if (!Number.isFinite(newWidth) || !Number.isFinite(newHeight) || newWidth <= 0 || newHeight <= 0) {
    emit('resize-error', {
      blockId,
      error: 'Invalid dimensions: width and height must be positive finite numbers',
    });
    return;
  }

  try {
    const { state, dispatch } = props.editor.view;
    const tr = state.tr;

    // Find image position using data-pm-start attribute
    const pmStartAttr = props.imageElement.getAttribute('data-pm-start');
    if (!pmStartAttr) {
      emit('resize-error', {
        blockId,
        error: 'Image position marker (data-pm-start) not found',
      });
      return;
    }

    const imagePos = parseInt(pmStartAttr, 10);
    if (!Number.isFinite(imagePos) || imagePos < 0) {
      emit('resize-error', {
        blockId,
        error: 'Invalid image position marker',
      });
      return;
    }

    // Get image node
    const imageNode = state.doc.nodeAt(imagePos);

    if (!imageNode || imageNode.type.name !== 'image') {
      emit('resize-error', {
        blockId,
        error: 'Invalid image node at position',
      });
      return;
    }

    // Store pixel dimensions directly (converted to EMU only during DOCX export)
    const newAttrs = {
      ...imageNode.attrs,
      size: {
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      },
    };

    tr.setNodeMarkup(imagePos, null, newAttrs);

    // Dispatch transaction
    dispatch(tr);

    // Invalidate the measure cache for this image to force re-measurement with new size
    if (blockId && blockId.trim()) {
      measureCache.invalidate([blockId]);
    }

    // Emit success event
    emit('resize-success', { blockId, newWidth, newHeight });
  } catch (error) {
    emit('resize-error', {
      blockId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Watch for changes to image element and reparse metadata
 */
watch(
  () => props.imageElement,
  () => {
    parseImageMetadata();
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
      parseImageMetadata();
    } else {
      // Clean up drag state if overlay is hidden
      if (dragState.value) {
        forcedCleanup.value = true;
        onDocumentMouseUp(new MouseEvent('mouseup'));
        forcedCleanup.value = false;
      }
    }
  },
);

/**
 * Clean up on unmount
 */
onBeforeUnmount(() => {
  // Cancel any pending throttled calls to prevent memory leaks
  mouseMoveThrottle.cancel();

  if (dragState.value) {
    document.removeEventListener('mousemove', onDocumentMouseMove);
    document.removeEventListener('mouseup', onDocumentMouseUp);
    document.removeEventListener('keydown', onEscapeKey);

    // Re-enable PM pointer events
    if (props.editor?.view?.dom) {
      props.editor.view.dom.style.pointerEvents = 'auto';
    }
  }
});
</script>

<style scoped>
.superdoc-image-resize-overlay {
  position: absolute;
  pointer-events: none;
  user-select: none;
  overflow: visible;
}

.resize-handle {
  position: absolute;
  width: v-bind('RESIZE_HANDLE_SIZE_PX + "px"');
  height: v-bind('RESIZE_HANDLE_SIZE_PX + "px"');
  background-color: #ffffff;
  border: 2px solid #4a90e2;
  border-radius: 50%;
  user-select: none;
  z-index: v-bind('Z_INDEX_HANDLE');
  pointer-events: auto;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.resize-handle:hover {
  transform: scale(1.2);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
  background-color: #4a90e2;
  border-color: #ffffff;
}

.resize-handle--active {
  transform: scale(1.2);
  background-color: #4a90e2;
  border-color: #ffffff;
}

.resize-guideline {
  position: absolute;
  background-color: rgba(74, 144, 226, 0.1);
  pointer-events: none;
  box-shadow: 0 0 4px rgba(74, 144, 226, 0.5);
}
</style>
