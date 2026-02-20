<script setup>
import { ref, onMounted, onUnmounted, computed, reactive, watch } from 'vue';
import { generateRulerDefinition, clampHandlePosition, calculateMarginFromHandle } from '@superdoc/painter-dom';

/**
 * @emits margin-change - Emitted when user drags a margin handle
 * @param {Object} payload - The margin change payload
 * @param {'left'|'right'} payload.side - Which margin was changed
 * @param {number} payload.value - The new margin value in inches
 * @param {number} payload.sectionIndex - The section index this margin applies to
 */
const emit = defineEmits(['margin-change']);
const props = defineProps({
  orientation: {
    type: String,
    default: 'horizontal',
  },
  length: {
    type: Number,
    default: 0,
  },
  editor: {
    type: Object,
    required: true,
  },
});

/** Minimum content width in pixels to prevent margins from overlapping completely. */
const MIN_WIDTH = 200;
const PPI = 96;
const ruler = ref(null);
const rulerDefinition = ref(null);
const alignment = 'flex-end';

const rulerHandleOriginalColor = ref('#CCCCCC');
const rulerHandleActiveColor = ref('#2563EB66');
const pageSize = ref(null);
const pageMargins = ref(null);
const currentSectionIndex = ref(0);

const isDragging = ref(false);
const currentHandle = ref(null);
const leftHandle = reactive({ side: 'left', x: 0 });
const rightHandle = reactive({ side: 'right', x: 0 });
const showVerticalIndicator = ref(false);
const initialX = ref(0);
let offsetX = 0;

let selectionUpdateHandler = null;
let zoomChangeHandler = null;

/**
 * Current zoom level from the editor.
 * Used to scale the ruler to match the document's zoom level.
 */
const currentZoom = ref(1);

/**
 * Get the PresentationEditor instance if available.
 * Handles both cases:
 * 1. props.editor IS a PresentationEditor (has zoom property and setZoom method)
 * 2. props.editor is an inner Editor with a presentationEditor reference
 */
const getPresentationEditor = () => {
  const editor = props.editor;
  if (!editor) return null;

  // Check if the editor IS a PresentationEditor (has zoom getter and setZoom method)
  if (typeof editor.zoom === 'number' && typeof editor.setZoom === 'function') {
    return editor;
  }

  // Check if the editor has a presentationEditor reference
  if (editor.presentationEditor) {
    return editor.presentationEditor;
  }

  return null;
};

/**
 * Update ruler to reflect the current section's page styles.
 * Called on mount and when selection changes to a different section.
 */
const updateRulerForCurrentSection = () => {
  // Ruler section-awareness is only relevant for paginated docx mode
  if (!props.editor || props.editor.options?.mode !== 'docx') {
    return;
  }

  const presentationEditor = getPresentationEditor();

  let docSize, docMargins, sectionIndex;

  if (presentationEditor && typeof presentationEditor.getCurrentSectionPageStyles === 'function') {
    const sectionStyles = presentationEditor.getCurrentSectionPageStyles();
    docSize = sectionStyles.pageSize;
    docMargins = sectionStyles.pageMargins;
    sectionIndex = sectionStyles.sectionIndex;
  } else {
    const styles = props.editor.getPageStyles();
    docSize = styles.pageSize ?? { width: 8.5, height: 11 };
    docMargins = styles.pageMargins ?? { left: 1, right: 1, top: 1, bottom: 1 };
    sectionIndex = 0;
  }

  // Only update if section changed or on initial load
  if (pageSize.value && currentSectionIndex.value === sectionIndex) {
    return;
  }

  currentSectionIndex.value = sectionIndex;
  pageSize.value = docSize;
  pageMargins.value = docMargins;

  const definition = generateRulerDefinition({
    pageSize: { width: docSize.width, height: docSize.height },
    pageMargins: {
      left: docMargins.left,
      right: docMargins.right,
      top: docMargins.top ?? 1,
      bottom: docMargins.bottom ?? 1,
    },
  });

  leftHandle.x = definition.leftMarginPx;
  rightHandle.x = definition.rightMarginPx;
  rulerDefinition.value = definition;
};

/**
 * Get the style for a ruler tick element.
 * Positions are multiplied by zoom to space ticks according to zoomed page width.
 * The tick marks themselves stay the same visual size (no CSS transform).
 */
const getTickStyle = computed(() => (tick) => {
  const zoom = currentZoom.value;
  return {
    position: 'absolute',
    left: `${tick.x * zoom}px`,
    bottom: '0',
    width: '1px',
    height: tick.height,
    backgroundColor: '#666',
    pointerEvents: 'none',
  };
});

/**
 * Get the position of the margin handles.
 * Internal handle.x is in base coordinates; display position is multiplied by zoom.
 */
const getHandlePosition = computed(() => (side) => {
  const handle = side === 'left' ? leftHandle : rightHandle;
  const zoom = currentZoom.value;
  return {
    left: `${handle.x * zoom}px`,
  };
});

/**
 * Get the style for the vertical indicator.
 * Position is multiplied by zoom to match handle position.
 * Returns a safe default object if ruler is not yet mounted.
 */
const getVerticalIndicatorStyle = computed(() => {
  if (!ruler.value) {
    // Return safe default when ruler is not yet mounted
    return { left: '0px', minHeight: '100%' };
  }

  const zoom = currentZoom.value;
  const parentElement = ruler.value.parentElement;
  const editor = parentElement?.querySelector('.super-editor') ?? document.querySelector('.super-editor');
  if (!editor) return { left: `${currentHandle.value.x * zoom}px`, minHeight: '100%' };
  const editorBounds = editor.getBoundingClientRect();
  return {
    left: `${currentHandle.value.x * zoom}px`,
    minHeight: `${editorBounds.height}px`,
  };
});

/**
 * Convert screen X coordinate to base (unscaled) coordinate space.
 * The ruler displays at zoomed width, so we divide by zoom to get base coordinates.
 */
const screenToLocalX = (screenX) => {
  if (!ruler.value) return screenX;
  const rulerRect = ruler.value.getBoundingClientRect();
  const zoom = currentZoom.value;
  // Ruler is displayed at zoomed width, convert screen position to base coordinates
  return (screenX - rulerRect.left) / zoom;
};

/**
 * On mouse down, prepare to drag a margin handle and show the vertical indicator.
 */
const handleMouseDown = (event) => {
  isDragging.value = true;
  setRulerHandleActive();

  const itemId = event.currentTarget.id;
  currentHandle.value = itemId === 'left-margin-handle' ? leftHandle : rightHandle;
  initialX.value = currentHandle.value.x;

  // Calculate offset in local coordinates
  const localX = screenToLocalX(event.clientX);
  offsetX = localX - currentHandle.value.x;

  showVerticalIndicator.value = true;
};

/**
 * On mouse move, update the position of the margin handle.
 */
const handleMouseMove = (event) => {
  if (!isDragging.value || !pageSize.value) return;

  // Convert screen coordinates to local coordinates
  const localX = screenToLocalX(event.clientX);
  const newLeft = localX - offsetX;
  const pageWidthPx = pageSize.value.width * PPI;
  const otherHandleX = currentHandle.value.side === 'left' ? rightHandle.x : leftHandle.x;

  currentHandle.value.x = clampHandlePosition(newLeft, currentHandle.value.side, otherHandleX, pageWidthPx, MIN_WIDTH);
};

/**
 * On mouse up, stop dragging the margin handle and emit the new margin value.
 */
const handleMouseUp = () => {
  isDragging.value = false;
  showVerticalIndicator.value = false;
  setRulerHandleInactive();

  if (currentHandle.value && currentHandle.value.x !== initialX.value) {
    const marginValue = getNewMarginValue();
    emit('margin-change', {
      side: currentHandle.value.side,
      value: marginValue,
      sectionIndex: currentSectionIndex.value,
    });
  }
};

/**
 * Set the ruler handle to active state (visually highlight).
 * Changes the handle color to the active color to provide visual feedback during dragging.
 */
const setRulerHandleActive = () => {
  rulerHandleOriginalColor.value = rulerHandleActiveColor.value;
};

/**
 * Set the ruler handle to inactive state (normal appearance).
 * Resets the handle color to the default state when dragging completes.
 */
const setRulerHandleInactive = () => {
  rulerHandleOriginalColor.value = '#CCC';
};

/**
 * Get the new margin value based on the current handle position.
 */
const getNewMarginValue = () => {
  if (!pageSize.value) return 0;
  const pageWidthPx = pageSize.value.width * PPI;
  return calculateMarginFromHandle(currentHandle.value.x, currentHandle.value.side, pageWidthPx, PPI);
};

/**
 * Computed style for the ruler wrapper (scaled dimensions for layout).
 */
const wrapperStyle = computed(() => {
  const width = rulerDefinition.value?.widthPx ?? pageSize.value?.width * PPI ?? 816;
  const zoom = currentZoom.value;
  const scaledWidth = width * zoom;
  return {
    width: `${scaledWidth}px`,
    minWidth: `${scaledWidth}px`,
    height: '25px',
    overflow: 'visible',
    flexShrink: 0,
  };
});

/**
 * Computed style for the inner ruler.
 * Uses scaled width directly - tick positions are spaced by zoom, no CSS transform needed.
 */
const rulerStyle = computed(() => {
  const width = rulerDefinition.value?.widthPx ?? pageSize.value?.width * PPI ?? 816;
  const zoom = currentZoom.value;
  const scaledWidth = width * zoom;
  return {
    width: `${scaledWidth}px`,
    height: '25px',
  };
});

/**
 * CSS variables for colors and alignment.
 */
const getStyleVars = computed(() => {
  return {
    '--alignment': alignment,
    '--ruler-handle-color': rulerHandleOriginalColor.value,
    '--ruler-handle-active-color': rulerHandleActiveColor.value,
  };
});

/**
 * Handle selection update events from the editor.
 * Updates the ruler when the user's cursor moves to a different section.
 * Skips updates during active dragging to avoid interference with user interaction.
 */
const handleSelectionUpdate = () => {
  if (isDragging.value) return;
  updateRulerForCurrentSection();
};

/**
 * Handle zoom change events from the PresentationEditor.
 * Updates tick spacing to match the document's zoom level.
 */
const handleZoomChange = ({ zoom }) => {
  currentZoom.value = zoom;
};

/**
 * Initialize zoom from the current editor state.
 * Called on mount and when the editor instance changes.
 */
const initializeZoom = () => {
  const presentationEditor = getPresentationEditor();
  if (presentationEditor && typeof presentationEditor.zoom === 'number') {
    currentZoom.value = presentationEditor.zoom;
  } else {
    currentZoom.value = 1;
  }
};

/**
 * Set up event listeners on the editor instance.
 * Registers a handler for 'selectionUpdate' events to keep the ruler synchronized
 * with the current section's page styles as the user navigates the document.
 * Also listens for 'zoomChange' events to scale the ruler appropriately.
 */
const setupEditorListeners = () => {
  if (!props.editor) return;
  selectionUpdateHandler = handleSelectionUpdate;
  props.editor.on('selectionUpdate', selectionUpdateHandler);

  // Listen for zoom changes on the PresentationEditor
  const presentationEditor = getPresentationEditor();
  if (presentationEditor) {
    zoomChangeHandler = handleZoomChange;
    presentationEditor.on('zoomChange', zoomChangeHandler);
    initializeZoom();
  }
};

/**
 * Clean up event listeners from the editor instance.
 * Removes the 'selectionUpdate' and 'zoomChange' handlers and clears the references to prevent memory leaks.
 * Should be called when the component is unmounted or the editor instance changes.
 */
const cleanupEditorListeners = () => {
  if (props.editor && selectionUpdateHandler) {
    props.editor.off('selectionUpdate', selectionUpdateHandler);
    selectionUpdateHandler = null;
  }

  // Clean up zoom listener from PresentationEditor
  const presentationEditor = getPresentationEditor();
  if (presentationEditor && zoomChangeHandler) {
    presentationEditor.off('zoomChange', zoomChangeHandler);
    zoomChangeHandler = null;
  }
};

/**
 * Get PresentationEditor from an editor instance (helper for cleanup).
 */
const getPresentationEditorFrom = (editor) => {
  if (!editor) return null;
  if (typeof editor.zoom === 'number' && typeof editor.setZoom === 'function') {
    return editor;
  }
  return editor.presentationEditor ?? null;
};

watch(
  () => props.editor,
  (newEditor, oldEditor) => {
    // Clean up old editor listeners
    if (oldEditor) {
      if (selectionUpdateHandler) {
        oldEditor.off('selectionUpdate', selectionUpdateHandler);
      }
      // Clean up zoom listener from old PresentationEditor
      const oldPresentationEditor = getPresentationEditorFrom(oldEditor);
      if (oldPresentationEditor && zoomChangeHandler) {
        oldPresentationEditor.off('zoomChange', zoomChangeHandler);
      }
    }

    // If zoomChangeHandler exists but oldEditor was null or didn't have a PresentationEditor,
    // we still need to clear the handler reference to prevent stale references
    if (zoomChangeHandler && !oldEditor) {
      zoomChangeHandler = null;
    }

    if (newEditor) {
      setupEditorListeners();
      updateRulerForCurrentSection();
    }
  },
);

onMounted(() => {
  updateRulerForCurrentSection();
  setupEditorListeners();
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
});

onUnmounted(() => {
  cleanupEditorListeners();
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div class="ruler-wrapper" :style="[wrapperStyle, getStyleVars]">
    <div class="ruler" ref="ruler" :style="rulerStyle">
      <!-- Margin handles -->
      <div
        class="margin-handle handle-left"
        id="left-margin-handle"
        @mousedown="handleMouseDown"
        :style="getHandlePosition('left')"
      ></div>
      <div
        class="margin-handle handle-right"
        id="right-margin-handle"
        @mousedown="handleMouseDown"
        :style="getHandlePosition('right')"
      ></div>

      <div v-if="showVerticalIndicator" class="vertical-indicator" :style="getVerticalIndicatorStyle"></div>

      <!-- Ruler tick marks -->
      <template v-if="rulerDefinition">
        <div
          v-for="(tick, index) in rulerDefinition.ticks"
          :key="index"
          :class="['ruler-tick', `ruler-tick--${tick.size}`]"
          :style="getTickStyle(tick)"
        >
          <span v-if="tick.label !== undefined" class="numbering">{{ tick.label }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/**
 * Wrapper provides the scaled layout width so the container sizes correctly.
 * Width is set via inline style (wrapperStyle computed).
 */
.ruler-wrapper {
  /* width set via inline style */
  /* height set via inline style */
  /* overflow set via inline style */
}

/**
 * Inner ruler uses scaled width with zoom-spaced tick positions.
 * Width is set via inline style (rulerStyle computed).
 */
.ruler {
  /* width set via inline style */
  /* height set via inline style */
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  color: #666;
}

.vertical-indicator {
  position: absolute;
  height: 0px;
  min-width: 1px;
  background-color: #aaa;
  top: 20px;
  z-index: 100;
}

.margin-handle {
  width: 56px;
  min-width: 5px;
  max-width: 5px;
  background-color: var(--ruler-handle-color);
  height: 20px;
  cursor: grab;
  position: absolute;
  margin-left: -2px;
  border-radius: 4px 4px 0 0;
  transition: background-color 250ms ease;
  z-index: 10;
}

.margin-handle:hover {
  background-color: var(--ruler-handle-active-color);
}

.ruler-tick {
  pointer-events: none;
  user-select: none;
}

.numbering {
  position: absolute;
  top: -16px;
  left: -2px;
  font-size: 10px;
  pointer-events: none;
  user-select: none;
}
</style>
