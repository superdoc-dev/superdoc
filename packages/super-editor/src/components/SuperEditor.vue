<script setup lang="ts">
import { NSkeleton, useMessage } from 'naive-ui';
import 'tippy.js/dist/tippy.css';
import { ref, onMounted, onBeforeUnmount, shallowRef, reactive, markRaw, computed, watch, nextTick } from 'vue';
import { Editor } from '@superdoc/super-editor';
import { PresentationEditor } from '@core/presentation-editor/index.js';
import { getStarterExtensions } from '@extensions/index.js';
import SlashMenu from './slash-menu/SlashMenu.vue';
import { onMarginClickCursorChange } from './cursor-helpers.js';
import Ruler from './rulers/Ruler.vue';
import GenericPopover from './popovers/GenericPopover.vue';
import LinkInput from './toolbar/LinkInput.vue';
import TableResizeOverlay from './TableResizeOverlay.vue';
import ImageResizeOverlay from './ImageResizeOverlay.vue';
import LinkClickHandler from './link-click/LinkClickHandler.vue';
import { checkNodeSpecificClicks } from './cursor-helpers.js';
import { adjustPaginationBreaks } from './pagination-helpers.js';
import { getFileObject } from '@superdoc/common';
import BlankDOCX from '@superdoc/common/data/blank.docx?url';
import { isHeadless } from '@utils/headless-helpers.js';
import { isMacOS } from '@core/utilities/isMacOS.js';
const emit = defineEmits(['editor-ready', 'editor-click', 'editor-keydown', 'comments-loaded', 'selection-update']);

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const props = defineProps({
  documentId: {
    type: String,
    required: false,
  },

  fileSource: {
    type: [File, Blob],
    required: false,
  },

  state: {
    type: Object,
    required: false,
    default: () => null,
  },

  options: {
    type: Object,
    required: false,
    default: () => ({}),
  },
});

const editorReady = ref(false);
const editor = shallowRef(null);
const activeEditor = computed(() => {
  if (editor.value && 'editor' in editor.value && editor.value.editor) {
    return editor.value.editor;
  }
  return editor.value;
});

const contextMenuDisabled = computed(() => {
  const active = activeEditor.value;
  return active?.options ? Boolean(active.options.disableContextMenu) : Boolean(props.options.disableContextMenu);
});

/**
 * Reactive ruler visibility state.
 * Uses a ref with a deep watcher to ensure proper reactivity when options.rulers changes.
 */
const rulersVisible = ref(Boolean(props.options.rulers));

/**
 * Current zoom level from PresentationEditor.
 * Used to scale the container min-width to accommodate zoomed content.
 */
const currentZoom = ref(1);

/**
 * Reference to the zoomChange event handler for cleanup.
 * Stored to ensure proper removal in onBeforeUnmount to prevent memory leaks.
 */
let zoomChangeHandler = null;

// Watch for changes in options.rulers with deep option to catch nested changes
watch(
  () => props.options,
  (newOptions) => {
    const rulers = newOptions?.rulers;
    // Handle both ref and plain boolean
    if (rulers && typeof rulers === 'object' && 'value' in rulers) {
      rulersVisible.value = Boolean(rulers.value);
    } else {
      rulersVisible.value = Boolean(rulers);
    }
  },
  { immediate: true, deep: true },
);

watch(
  () => props.options?.rulerContainer,
  () => {
    nextTick(() => {
      syncRulerOffset();
      setupRulerObservers();
    });
  },
  { immediate: true },
);

watch(
  rulersVisible,
  (visible) => {
    nextTick(() => {
      if (visible) {
        syncRulerOffset();
        setupRulerObservers();
      } else {
        rulerHostStyle.value = {};
        cleanupRulerObservers();
      }
    });
  },
  { immediate: true },
);

/**
 * Computed style for the container that scales min-width based on zoom.
 * Uses the maximum page width across all pages (for multi-section docs with landscape pages),
 * falling back to 8.5in (letter size).
 */
const containerStyle = computed(() => {
  // Default: 8.5 inches at 96 DPI = 816px (letter size)
  let maxWidth = 8.5 * 96;

  const ed = editor.value;

  // First, try to get per-page sizes from layout (handles landscape/multi-section docs)
  if (ed && 'getPages' in ed && typeof ed.getPages === 'function') {
    const pages = ed.getPages();
    if (Array.isArray(pages) && pages.length > 0) {
      // Find the maximum width across all pages (some may be landscape)
      for (const page of pages) {
        if (page.size && typeof page.size.w === 'number' && page.size.w > 0) {
          maxWidth = Math.max(maxWidth, page.size.w);
        }
      }
    }
  }

  // Fallback: use first section's page width from pageStyles if no pages yet
  if (maxWidth === 8.5 * 96 && ed && 'getPageStyles' in ed && typeof ed.getPageStyles === 'function') {
    const styles = ed.getPageStyles();
    if (
      styles &&
      typeof styles === 'object' &&
      styles.pageSize &&
      typeof styles.pageSize === 'object' &&
      typeof styles.pageSize.width === 'number' &&
      styles.pageSize.width > 0
    ) {
      maxWidth = styles.pageSize.width * 96; // width is in inches
    }
  }

  const scaledWidth = maxWidth * currentZoom.value;
  return {
    minWidth: `${scaledWidth}px`,
  };
});

/**
 * Inline style applied to the teleported ruler wrapper so it stays horizontally
 * aligned with the visible document area (even when sidebars open/close).
 */
const rulerHostStyle = ref<Record<string, string>>({});
const rulerContainerEl = ref<HTMLElement | null>(null);
let editorResizeObserver: ResizeObserver | null = null;
let rulerContainerResizeObserver: ResizeObserver | null = null;
let layoutUpdatedHandler: (() => void) | null = null;

const resolveRulerContainer = (): HTMLElement | null => {
  const container = props.options?.rulerContainer;
  if (!container) return null;

  if (typeof container === 'string') {
    const doc = editorWrapper.value?.ownerDocument ?? document;
    return doc.querySelector(container);
  }

  return container instanceof HTMLElement ? container : null;
};

const getViewportRect = (): DOMRect | null => {
  const host = editorWrapper.value;
  if (!host) return null;
  const viewport = host.querySelector('.presentation-editor__viewport') as HTMLElement | null;
  const target = viewport ?? host;
  return target.getBoundingClientRect();
};

const syncRulerOffset = () => {
  if (!rulersVisible.value) {
    rulerHostStyle.value = {};
    return;
  }

  rulerContainerEl.value = resolveRulerContainer();
  if (!rulerContainerEl.value) {
    rulerHostStyle.value = {};
    return;
  }

  const viewportRect = getViewportRect();
  if (!viewportRect) return;

  const hostRect = rulerContainerEl.value.getBoundingClientRect();
  const paddingLeft = Math.max(0, viewportRect.left - hostRect.left);
  const paddingRight = Math.max(0, hostRect.right - viewportRect.right);

  rulerHostStyle.value = {
    paddingLeft: `${paddingLeft}px`,
    paddingRight: `${paddingRight}px`,
  };
};

const cleanupRulerObservers = () => {
  if (editorResizeObserver) {
    editorResizeObserver.disconnect();
    editorResizeObserver = null;
  }

  if (rulerContainerResizeObserver) {
    rulerContainerResizeObserver.disconnect();
    rulerContainerResizeObserver = null;
  }
};

const setupRulerObservers = () => {
  cleanupRulerObservers();
  if (typeof ResizeObserver === 'undefined') return;

  const viewportHost = editorWrapper.value;
  const rulerHost = resolveRulerContainer();

  if (viewportHost) {
    editorResizeObserver = new ResizeObserver(() => syncRulerOffset());
    editorResizeObserver.observe(viewportHost);
  }

  if (rulerHost) {
    rulerContainerResizeObserver = new ResizeObserver(() => syncRulerOffset());
    rulerContainerResizeObserver.observe(rulerHost);
  }
};

const message = useMessage();

const editorWrapper = ref(null);
const editorElem = ref(null);

const fileSource = ref(null);

/**
 * Generic popover controls including state, open and close functions
 */
const popoverControls = reactive({
  visible: false,
  position: { left: '0px', top: '0px' },
  component: null,
  props: {},
});

const closePopover = () => {
  popoverControls.visible = false;
  popoverControls.component = null;
  popoverControls.props = {};
  activeEditor.value?.view?.focus();
};

const openPopover = (component, props, position) => {
  popoverControls.component = component;
  popoverControls.props = props;
  popoverControls.position = position;
  popoverControls.visible = true;
};

/**
 * Table resize overlay state management
 */
const tableResizeState = reactive({
  visible: false,
  tableElement: null,
});

/**
 * Image resize overlay state management
 */
interface ImageResizeState {
  visible: boolean;
  imageElement: HTMLElement | null;
  blockId: string | null;
}

const imageResizeState: ImageResizeState = reactive({
  visible: false,
  imageElement: null,
  blockId: null,
});

/**
 * Image selection state (for layout-engine rendered images)
 * @type {{element: HTMLElement | null, blockId: string | null, pmStart: number | null}}
 */
const selectedImageState = reactive({
  element: null,
  blockId: null,
  pmStart: null,
});

/**
 * Threshold in pixels for showing table resize handles.
 * Handles only appear when mouse is within this distance of a column boundary.
 *
 * COORDINATE SPACE: This threshold is in SCREEN SPACE (zoomed pixels).
 * - When comparing mouse position to column boundaries, both are converted to screen space
 * - Column boundaries (from layout engine) are multiplied by zoom to get screen coordinates
 * - Mouse coordinates (from getBoundingClientRect) are already in screen space
 * - This ensures the hover threshold feels consistent regardless of zoom level
 *
 * Example at different zoom levels:
 * - At zoom 1.0: 8 screen pixels = 8 layout pixels (threshold feels normal)
 * - At zoom 2.0: 8 screen pixels = 4 layout pixels (threshold stays same visual size)
 * - At zoom 0.5: 8 screen pixels = 16 layout pixels (threshold stays same visual size)
 */
const TABLE_RESIZE_HOVER_THRESHOLD = 8;

/**
 * Throttle interval in milliseconds for updateTableResizeOverlay.
 * Limits how frequently the overlay visibility is recalculated during mousemove.
 */
const TABLE_RESIZE_THROTTLE_MS = 16; // ~60fps

/**
 * Get the editor's zoom level.
 *
 * Retrieves the current zoom multiplier from the editor instance. Zoom is centrally
 * controlled by PresentationEditor via transform: scale() on the viewport host.
 * This function handles both direct PresentationEditor instances and wrapped Editor
 * instances that contain a presentationEditor property.
 *
 * The zoom level is a multiplier where:
 * - 1 = 100% (default, no scaling)
 * - 0.5 = 50% (zoomed out)
 * - 2 = 200% (zoomed in)
 *
 * This zoom value is used to convert between layout coordinates (which are in
 * unscaled logical pixels) and screen coordinates (which are affected by the
 * CSS transform: scale()).
 *
 * @returns {number} The zoom level multiplier. Returns 1 (100%) as a safe fallback
 *                   if zoom cannot be retrieved from the editor instance.
 *
 * @example
 * ```javascript
 * const zoom = getEditorZoom();
 * // Convert layout coordinates to screen coordinates
 * const screenX = layoutX * zoom;
 * const screenY = layoutY * zoom;
 * ```
 */
const getEditorZoom = () => {
  const active = activeEditor.value;
  if (active && typeof active.zoom === 'number') {
    return active.zoom;
  }
  if (active?.presentationEditor && typeof active.presentationEditor.zoom === 'number') {
    return active.presentationEditor.zoom;
  }
  // Fallback to default zoom when editor instance doesn't have zoom configured
  console.warn(
    '[SuperEditor] getEditorZoom: Unable to retrieve zoom from editor instance, using fallback value of 1. ' +
      'This may indicate the editor is not fully initialized or is not a PresentationEditor instance.',
  );
  return 1;
};

/**
 * Timestamp of last updateTableResizeOverlay execution for throttling.
 */
let lastUpdateTableResizeTimestamp = 0;

/**
 * Check if mouse position is near any column boundary in the table.
 * Returns true if within threshold of a boundary that has segments at the mouse Y position.
 *
 * @param {MouseEvent} event - The mouse event containing clientX and clientY coordinates
 * @param {HTMLElement} tableElement - The table DOM element with data-table-boundaries attribute
 * @returns {boolean} True if the mouse is near a column boundary, false otherwise
 */
const isNearColumnBoundary = (event, tableElement) => {
  // Input validation: event must have clientX and clientY properties
  if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') {
    console.warn('[isNearColumnBoundary] Invalid event: missing clientX or clientY', event);
    return false;
  }

  // Input validation: tableElement must be a valid DOM element
  if (!tableElement || !(tableElement instanceof HTMLElement)) {
    console.warn('[isNearColumnBoundary] Invalid tableElement: not an HTMLElement', tableElement);
    return false;
  }

  const boundariesAttr = tableElement.getAttribute('data-table-boundaries');
  if (!boundariesAttr) return false;

  try {
    const metadata = JSON.parse(boundariesAttr);
    if (!metadata.columns || !Array.isArray(metadata.columns)) return false;

    // Get zoom factor to properly compare screen coordinates with layout coordinates
    const zoom = getEditorZoom();

    const tableRect = tableElement.getBoundingClientRect();
    // Mouse coordinates relative to table are in screen space (zoomed)
    const mouseXScreen = event.clientX - tableRect.left;
    const mouseYScreen = event.clientY - tableRect.top;

    // Check each column boundary
    for (let i = 0; i < metadata.columns.length; i++) {
      const col = metadata.columns[i];

      // Validate column data structure before using col.x and col.w
      if (!col || typeof col !== 'object') {
        console.warn(`[isNearColumnBoundary] Invalid column at index ${i}: not an object`, col);
        continue;
      }
      if (typeof col.x !== 'number' || !Number.isFinite(col.x)) {
        console.warn(`[isNearColumnBoundary] Invalid column.x at index ${i}:`, col.x);
        continue;
      }
      if (typeof col.w !== 'number' || !Number.isFinite(col.w) || col.w <= 0) {
        console.warn(`[isNearColumnBoundary] Invalid column.w at index ${i}:`, col.w);
        continue;
      }

      // The boundary x position is at (col.x + col.w) - the right edge of the column
      // This is in layout coordinates, so multiply by zoom to convert to screen space
      const boundaryXScreen = (col.x + col.w) * zoom;

      // Check if mouse is horizontally near this boundary (both in screen space now)
      if (Math.abs(mouseXScreen - boundaryXScreen) <= TABLE_RESIZE_HOVER_THRESHOLD) {
        // Check if there's a segment at this Y position (boundary exists here, not merged)
        const segmentColIndex = i + 1; // segments are indexed by boundary, not column
        const segments = metadata.segments?.[segmentColIndex];

        // If no segments data, assume boundary exists everywhere
        if (!segments || segments.length === 0) {
          // For right-edge (last column), always show
          if (i === metadata.columns.length - 1) return true;
          // For interior boundaries with no segments, boundary is fully merged - skip
          continue;
        }

        // Check if mouse Y is within any segment
        // Segment coordinates are in layout space, convert to screen space
        for (const seg of segments) {
          const segTopScreen = (seg.y || 0) * zoom;
          const segBottomScreen = seg.h != null ? segTopScreen + seg.h * zoom : tableRect.height;
          if (mouseYScreen >= segTopScreen && mouseYScreen <= segBottomScreen) {
            return true;
          }
        }
      }
    }

    // Also check left edge of table (x = 0)
    if (Math.abs(mouseXScreen) <= TABLE_RESIZE_HOVER_THRESHOLD) {
      return true;
    }

    return false;
  } catch (e) {
    // Log parsing errors for debugging while falling back to safe default
    console.warn('[isNearColumnBoundary] Failed to parse table boundary metadata:', e);
    return false;
  }
};

/**
 * Update table resize overlay visibility based on mouse position.
 * Shows overlay only when hovering near column boundaries, not anywhere in the table.
 * Throttled to run at most once per TABLE_RESIZE_THROTTLE_MS milliseconds.
 *
 * @param {MouseEvent} event - The mouse event containing target and coordinates
 * @returns {void}
 */
const updateTableResizeOverlay = (event) => {
  // Throttle: skip if called too frequently
  const now = Date.now();
  if (now - lastUpdateTableResizeTimestamp < TABLE_RESIZE_THROTTLE_MS) {
    return;
  }
  lastUpdateTableResizeTimestamp = now;

  if (!editorElem.value) return;

  let target = event.target;
  // Walk up DOM tree to find table fragment or overlay
  while (target && target !== editorElem.value) {
    // Check if we're over the table resize overlay itself
    if (target.classList?.contains('superdoc-table-resize-overlay')) {
      // Keep overlay visible, don't change tableElement
      return;
    }

    if (target.classList?.contains('superdoc-table-fragment') && target.hasAttribute('data-table-boundaries')) {
      // Only show overlay if mouse is near a column boundary
      if (isNearColumnBoundary(event, target)) {
        tableResizeState.visible = true;
        tableResizeState.tableElement = target;
      } else {
        tableResizeState.visible = false;
        tableResizeState.tableElement = null;
      }
      return;
    }
    target = target.parentElement;
  }

  // No table or overlay found - hide overlay
  tableResizeState.visible = false;
  tableResizeState.tableElement = null;
};

/**
 * Hide table resize overlay (on mouse leave)
 */
const hideTableResizeOverlay = () => {
  tableResizeState.visible = false;
  tableResizeState.tableElement = null;
};

/**
 * Update image resize overlay visibility based on mouse position.
 * Shows overlay when hovering over images with data-image-metadata attribute.
 * Supports both standalone image fragments (ImageBlock) and inline images (ImageRun).
 *
 * Edge Cases:
 * - If editorElem is not mounted, returns early without modifying overlay state
 * - If event.target is not an Element (e.g., text node), hides overlay and returns
 * - When hovering over the overlay itself, preserves visibility without changing imageElement
 * - Ignores images without data-image-metadata attribute (non-resizable images)
 *
 * @param {MouseEvent} event - The mouse event containing target and coordinates
 * @returns {void}
 */
const updateImageResizeOverlay = (event: MouseEvent): void => {
  if (!editorElem.value) return;

  // Type guard: ensure event target is an Element
  if (!(event.target instanceof Element)) {
    imageResizeState.visible = false;
    imageResizeState.imageElement = null;
    imageResizeState.blockId = null;
    return;
  }

  let target: Element | null = event.target;
  // Walk up DOM tree to find image fragment or overlay
  while (target && target !== document.body) {
    // Check if we're over the image resize overlay or any of its children (handles, guideline)
    if (
      target.classList?.contains('superdoc-image-resize-overlay') ||
      target.closest?.('.superdoc-image-resize-overlay')
    ) {
      // Keep overlay visible, don't change imageElement
      return;
    }

    // Check for standalone image fragments (ImageBlock)
    if (target.classList?.contains('superdoc-image-fragment') && target.hasAttribute('data-image-metadata')) {
      imageResizeState.visible = true;
      imageResizeState.imageElement = target as HTMLElement;
      imageResizeState.blockId = target.getAttribute('data-sd-block-id');
      return;
    }

    // Check for inline images (ImageRun inside paragraphs)
    if (target.classList?.contains('superdoc-inline-image') && target.hasAttribute('data-image-metadata')) {
      imageResizeState.visible = true;
      imageResizeState.imageElement = target as HTMLElement;
      // Inline images don't have block IDs, use pmStart as identifier
      imageResizeState.blockId = target.getAttribute('data-pm-start');
      return;
    }
    target = target.parentElement;
  }

  // No image or overlay found - hide overlay
  imageResizeState.visible = false;
  imageResizeState.imageElement = null;
  imageResizeState.blockId = null;
};

/**
 * Hide image resize overlay (on mouse leave)
 */
const hideImageResizeOverlay = () => {
  imageResizeState.visible = false;
  imageResizeState.imageElement = null;
  imageResizeState.blockId = null;
};

/**
 * Clear visual selection on the currently selected image fragment.
 * Removes the 'superdoc-image-selected' CSS class and resets selection state.
 * Safe to call when no image is selected (no-op).
 * @returns {void}
 */
const clearSelectedImage = () => {
  if (selectedImageState.element?.classList?.contains('superdoc-image-selected')) {
    selectedImageState.element.classList.remove('superdoc-image-selected');
  }
  selectedImageState.element = null;
  selectedImageState.blockId = null;
  selectedImageState.pmStart = null;
};

/**
 * Apply visual selection to the provided image fragment element
 * @param {HTMLElement | null} element - DOM element for the image fragment
 * @param {string | null} blockId - Layout-engine block id for the image
 * @param {number | null} pmStart - ProseMirror document position of the image node
 * @returns {void}
 */
const setSelectedImage = (element, blockId, pmStart) => {
  // Remove selection from the previously selected element
  if (selectedImageState.element && selectedImageState.element !== element) {
    selectedImageState.element.classList.remove('superdoc-image-selected');
  }

  if (element && element.classList) {
    element.classList.add('superdoc-image-selected');
    selectedImageState.element = element;
    selectedImageState.blockId = blockId ?? null;
    selectedImageState.pmStart = typeof pmStart === 'number' ? pmStart : null;
  } else {
    clearSelectedImage();
  }
};

/**
 * Combined handler to update both table and image resize overlays
 */
const handleOverlayUpdates = (event) => {
  updateTableResizeOverlay(event);
  updateImageResizeOverlay(event);
};

/**
 * Combined handler to hide both overlays
 */
const handleOverlayHide = () => {
  hideTableResizeOverlay();
  hideImageResizeOverlay();
};

let dataPollTimeout;

const stopPolling = () => {
  clearTimeout(dataPollTimeout);
};

const pollForMetaMapData = (ydoc, retries = 10, interval = 500) => {
  const metaMap = ydoc.getMap('meta');

  const checkData = () => {
    const docx = metaMap.get('docx');
    if (docx) {
      stopPolling();
      initEditor({ content: docx });
    } else if (retries > 0) {
      dataPollTimeout = setTimeout(checkData, interval);
      retries--;
    } else {
      console.warn('Failed to load docx data from meta map.');
    }
  };

  checkData();
};

const setDefaultBlankFile = async () => {
  fileSource.value = await getFileObject(BlankDOCX, 'blank.docx', DOCX);
};

const loadNewFileData = async () => {
  if (!fileSource.value) {
    fileSource.value = props.fileSource;
  }
  if (!fileSource.value || fileSource.value.type !== DOCX) {
    await setDefaultBlankFile();
  }

  try {
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(fileSource.value);
    return { content: docx, media, mediaFiles, fonts };
  } catch (err) {
    console.debug('[SuperDoc] Error loading file:', err);
    if (typeof props.options.onException === 'function') {
      props.options.onException({ error: err, editor: null });
    }
  }
};

const initializeData = async () => {
  // If we have the file, initialize immediately from file
  if (props.fileSource) {
    let fileData = await loadNewFileData();
    if (!fileData) {
      message.error('Unable to load the file. Please verify the .docx is valid and not password protected.');
      await setDefaultBlankFile();
      fileData = await loadNewFileData();
    }
    return initEditor(fileData);
  }

  // If we are in collaboration mode, wait for sync then initialize
  else if (props.options.ydoc && props.options.collaborationProvider) {
    delete props.options.content;
    const ydoc = props.options.ydoc;
    const provider = props.options.collaborationProvider;

    // Wait for provider sync (handles different provider APIs)
    const waitForSync = () => {
      if (provider.isSynced || provider.synced) return Promise.resolve();

      return new Promise((resolve) => {
        const onSync = (synced) => {
          if (synced === false) return; // Liveblocks fires sync(false) first
          provider.off('synced', onSync);
          provider.off('sync', onSync);
          resolve();
        };
        provider.on('synced', onSync);
        provider.on('sync', onSync);
      });
    };

    waitForSync().then(async () => {
      const metaMap = ydoc.getMap('meta');

      if (metaMap.has('docx')) {
        // Existing content - poll for it
        pollForMetaMapData(ydoc);
      } else {
        // First client - load blank document
        props.options.isNewFile = true;
        const fileData = await loadNewFileData();
        if (fileData) initEditor(fileData);
      }
    });
  }
};

const getExtensions = () => getStarterExtensions();

const initEditor = async ({ content, media = {}, mediaFiles = {}, fonts = {} } = {}) => {
  // component may have unmounted during async init
  if (!editorElem.value) return;

  const { editorCtor, ...editorOptions } = props.options || {};
  const EditorCtor = editorCtor ?? Editor;
  clearSelectedImage();
  editor.value = new EditorCtor({
    mode: 'docx',
    element: editorElem.value,
    fileSource: fileSource.value,
    extensions: getExtensions(),
    documentId: props.documentId,
    content,
    media,
    mediaFiles,
    fonts,
    ...editorOptions,
  });

  emit('editor-ready', {
    editor: activeEditor.value,
    presentationEditor: editor.value instanceof PresentationEditor ? editor.value : null,
  });

  // Attach layout-engine specific image selection listeners
  if (editor.value instanceof PresentationEditor) {
    const presentationEditor = editor.value;
    presentationEditor.on('imageSelected', ({ element, blockId, pmStart }) => {
      setSelectedImage(element, blockId ?? null, pmStart);
    });
    presentationEditor.on('imageDeselected', () => {
      clearSelectedImage();
    });

    layoutUpdatedHandler = () => {
      if (imageResizeState.visible && imageResizeState.blockId) {
        // Re-acquire element reference (may have been recreated after re-render)
        const escapedBlockId = CSS.escape(imageResizeState.blockId);
        const newElement = editorElem.value?.querySelector(
          `.superdoc-image-fragment[data-sd-block-id="${escapedBlockId}"]`,
        );
        if (newElement) {
          imageResizeState.imageElement = newElement;
        } else {
          // Image virtualized away - hide overlay
          imageResizeState.visible = false;
          imageResizeState.imageElement = null;
          imageResizeState.blockId = null;
        }
      }

      if (selectedImageState.blockId) {
        const escapedBlockId = CSS.escape(selectedImageState.blockId);
        const refreshed = editorElem.value?.querySelector(
          `.superdoc-image-fragment[data-sd-block-id="${escapedBlockId}"]`,
        );
        if (refreshed) {
          setSelectedImage(refreshed, selectedImageState.blockId, selectedImageState.pmStart);
        } else {
          // Try pmStart-based re-acquisition (inline images)
          if (selectedImageState.pmStart != null) {
            const pmSelector = `.superdoc-image-fragment[data-pm-start="${selectedImageState.pmStart}"], .superdoc-inline-image[data-pm-start="${selectedImageState.pmStart}"]`;
            const pmElement = editorElem.value?.querySelector(pmSelector);
            if (pmElement) {
              setSelectedImage(pmElement, selectedImageState.blockId, selectedImageState.pmStart);
              return;
            }
          }

          clearSelectedImage();
        }
      }

      nextTick(() => syncRulerOffset());
    };
    presentationEditor.on('layoutUpdated', layoutUpdatedHandler);

    // Listen for zoom changes to update container sizing
    zoomChangeHandler = ({ zoom }) => {
      currentZoom.value = zoom;
      nextTick(() => syncRulerOffset());
    };
    presentationEditor.on('zoomChange', zoomChangeHandler);

    // Initialize zoom from current state
    if (typeof presentationEditor.zoom === 'number') {
      currentZoom.value = presentationEditor.zoom;
      nextTick(() => syncRulerOffset());
    }
  }

  editor.value.on('paginationUpdate', () => {
    const base = activeEditor.value;
    if (isHeadless(base)) return;
    const paginationTarget = editor.value?.editor ? { value: base } : editor;
    adjustPaginationBreaks(editorElem, paginationTarget);
  });

  editor.value.on('collaborationReady', () => {
    setTimeout(() => {
      editorReady.value = true;
    }, 150);
  });
};

const handleSuperEditorKeydown = (event) => {
  // cmd/ctrl + opt/alt + shift + M
  if ((event.metaKey || event.ctrlKey) && event.altKey && event.shiftKey) {
    if (event.code === 'KeyM') {
      const toolbar = document.querySelector('.superdoc-toolbar');
      if (toolbar) {
        toolbar.setAttribute('tabindex', '0');
        toolbar.focus();
      }
    }
  }

  // cmd/ctrl + K → Open LinkInput popover
  if (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    (event.key === 'k' || event.key === 'K')
  ) {
    event.preventDefault();

    const base = activeEditor.value;
    if (!base) return;

    const view = base.view;
    const { state } = view;

    // Compute cursor position relative to the super-editor container
    const container = editorWrapper.value;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const cursorCoords = view.coordsAtPos(state.selection.head);

    const left = `${cursorCoords.left - containerRect.left}px`;
    const top = `${cursorCoords.bottom - containerRect.top + 6}px`; // small offset below selection

    openPopover(markRaw(LinkInput), {}, { left, top });
  }

  emit('editor-keydown', { editor: activeEditor.value });
};

const handleSuperEditorClick = (event) => {
  emit('editor-click', { editor: activeEditor.value });
  let pmElement = editorElem.value?.querySelector('.ProseMirror');

  const base = activeEditor.value;
  if (!pmElement || !base) {
    return;
  }

  let isInsideEditor = pmElement.contains(event.target);

  if (!isInsideEditor && base.isEditable) {
    base.view?.focus();
  }

  if (isInsideEditor && base.isEditable) {
    checkNodeSpecificClicks(base, event, popoverControls);
  }

  // Update table resize overlay on click
  updateTableResizeOverlay(event);
};

onMounted(() => {
  initializeData();
  if (props.options?.suppressSkeletonLoader || !props.options?.collaborationProvider) editorReady.value = true;
  window.addEventListener('resize', syncRulerOffset, { passive: true });
  nextTick(() => {
    syncRulerOffset();
    setupRulerObservers();
  });
});

/**
 * Handle mouse down events in the editor margin area.
 * Moves the cursor to the clicked location for normal left-clicks, but preserves
 * the current selection for right-clicks and context menu triggers.
 *
 * This prevents unwanted cursor movement when the user is trying to open a context menu:
 * - Right-clicks (button !== 0) are ignored because they open the context menu
 * - Ctrl+Click on Mac is ignored because it triggers the context menu (even though button === 0)
 * - Clicks directly on the ProseMirror content area are ignored (handled by ProseMirror itself)
 *
 * For normal left-clicks on margin areas, delegates to onMarginClickCursorChange which
 * positions the cursor at the appropriate location based on the click coordinates.
 *
 * @param {MouseEvent} event - The mousedown event from the margin click
 * @returns {void}
 */
const handleMarginClick = (event) => {
  // Skip right-clicks - don't move cursor when user is trying to open context menu
  if (event.button !== 0) {
    return;
  }
  // On Mac, Ctrl+Click triggers context menu but reports button=0
  if (event.ctrlKey && isMacOS()) {
    return;
  }
  const target = event.target;
  if (target?.classList?.contains('ProseMirror')) return;

  // Causes issues with node selection.
  if (target?.closest?.('.presentation-editor, .superdoc-layout')) {
    return;
  }

  onMarginClickCursorChange(event, activeEditor.value);
};

/**
 * Triggered when the user changes the margin value from the ruler
 *
 * @param {Object} param0
 * @param {String} param0.side - The side of the margin being changed
 * @param {Number} param0.value - The new value of the margin in inches
 * @returns {void}
 */
const handleMarginChange = ({ side, value }) => {
  const base = activeEditor.value;
  if (!base) return;

  const payload =
    side === 'left'
      ? { leftInches: value }
      : side === 'right'
        ? { rightInches: value }
        : side === 'top'
          ? { topInches: value }
          : side === 'bottom'
            ? { bottomInches: value }
            : {};

  const didUpdateSection =
    typeof base.commands?.setSectionPageMarginsAtSelection === 'function'
      ? base.commands.setSectionPageMarginsAtSelection(payload)
      : false;

  // Fallback to legacy behavior if section-aware command is unavailable or failed
  if (!didUpdateSection) {
    const pageStyles = base.getPageStyles();
    const { pageMargins } = pageStyles;
    const update = { ...pageMargins, [side]: value };
    base?.updatePageStyle({ pageMargins: update });
  }
};

onBeforeUnmount(() => {
  stopPolling();
  clearSelectedImage();

  // Clean up zoomChange listener if it exists
  if (editor.value instanceof PresentationEditor && zoomChangeHandler) {
    editor.value.off('zoomChange', zoomChangeHandler);
    zoomChangeHandler = null;
  }
  if (editor.value instanceof PresentationEditor && layoutUpdatedHandler) {
    editor.value.off('layoutUpdated', layoutUpdatedHandler);
    layoutUpdatedHandler = null;
  }

  cleanupRulerObservers();
  window.removeEventListener('resize', syncRulerOffset);

  editor.value?.destroy();
  editor.value = null;
});
</script>

<template>
  <div class="super-editor-container" :style="containerStyle">
    <!-- Ruler: teleport to external container if specified, otherwise render inline -->
    <Teleport v-if="options.rulerContainer && rulersVisible && !!activeEditor" :to="options.rulerContainer">
      <div class="ruler-host" :style="rulerHostStyle">
        <Ruler class="ruler superdoc-ruler" :editor="activeEditor" @margin-change="handleMarginChange" />
      </div>
    </Teleport>
    <div v-else-if="rulersVisible && !!activeEditor" class="ruler-host" :style="rulerHostStyle">
      <Ruler class="ruler" :editor="activeEditor" @margin-change="handleMarginChange" />
    </div>

    <div
      class="super-editor"
      ref="editorWrapper"
      @keydown="handleSuperEditorKeydown"
      @click="handleSuperEditorClick"
      @mousedown="handleMarginClick"
      @mousemove="handleOverlayUpdates"
      @mouseleave="handleOverlayHide"
    >
      <div ref="editorElem" class="editor-element super-editor__element" role="presentation"></div>
      <!-- Single SlashMenu component, no Teleport needed -->
      <SlashMenu
        v-if="!contextMenuDisabled && editorReady && activeEditor"
        :editor="activeEditor"
        :popoverControls="popoverControls"
        :openPopover="openPopover"
        :closePopover="closePopover"
      />
      <!-- Link click handler for layout-engine rendered links -->
      <LinkClickHandler
        v-if="editorReady && activeEditor"
        :editor="activeEditor"
        :openPopover="openPopover"
        :closePopover="closePopover"
        :popoverVisible="popoverControls.visible"
      />
      <!-- Table resize overlay for interactive column resizing -->
      <TableResizeOverlay
        v-if="editorReady && activeEditor"
        :editor="activeEditor"
        :visible="tableResizeState.visible"
        :tableElement="tableResizeState.tableElement"
      />
      <!-- Image resize overlay for interactive image resizing -->
      <ImageResizeOverlay
        v-if="editorReady && activeEditor"
        :editor="activeEditor"
        :visible="imageResizeState.visible"
        :imageElement="imageResizeState.imageElement"
      />
    </div>

    <div class="placeholder-editor" v-if="!editorReady">
      <div class="placeholder-title">
        <n-skeleton text style="width: 60%" />
      </div>

      <n-skeleton text :repeat="6" />
      <n-skeleton text style="width: 60%" />

      <n-skeleton text :repeat="6" style="width: 30%; display: block; margin: 20px" />
      <n-skeleton text style="width: 60%" />
      <n-skeleton text :repeat="5" />
      <n-skeleton text style="width: 30%" />

      <n-skeleton text style="margin-top: 50px" />
      <n-skeleton text :repeat="6" />
      <n-skeleton text style="width: 70%" />
    </div>

    <GenericPopover
      v-if="activeEditor"
      :editor="activeEditor"
      :visible="popoverControls.visible"
      :position="popoverControls.position"
      @close="closePopover"
    >
      <component
        :is="popoverControls.component"
        v-bind="{ ...popoverControls.props, editor: activeEditor, closePopover }"
      />
    </GenericPopover>
  </div>
</template>

<style scoped>
.editor-element {
  position: relative;
}

.super-editor-container {
  width: auto;
  height: auto;
  /* min-width is controlled via inline style (containerStyle) to scale with zoom */
  min-height: 11in;
  position: relative;
  display: flex;
  flex-direction: column;
}

.ruler-host {
  display: flex;
  justify-content: center;
  width: 100%;
  box-sizing: border-box;
}

.ruler {
  margin-bottom: 2px;
}

.super-editor {
  color: initial;
  overflow: hidden;
}

.placeholder-editor {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 8px;
  padding: 1in;
  z-index: 5;
  background-color: white;
  box-sizing: border-box;
}

.placeholder-title {
  display: flex;
  justify-content: center;
  margin-bottom: 40px;
}
</style>
