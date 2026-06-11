<template>
  <div
    v-if="visible && textboxElement"
    class="superdoc-textbox-resize-overlay"
    :style="overlayStyle"
    @pointerdown.stop
    @mousedown="onOverlayMouseDown"
  >
    <div
      v-for="handle in resizeHandles"
      :key="handle.position"
      class="resize-handle"
      :class="{
        'resize-handle--active': dragState && dragState.handle === handle.position,
        [`resize-handle--${handle.position}`]: true,
      }"
      :style="handle.style"
      @mousedown="onHandleMouseDown($event, handle.position)"
    ></div>

    <div v-if="dragState" class="resize-guideline" :style="guidelineStyle"></div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { measureCache, invalidateHeaderFooterMeasureCache } from '@superdoc/layout-bridge';
import { nodeAllowsSdBlockRevAttr } from '../extensions/block-node/block-node.js';

const OVERLAY_EXPANSION_PX = 2000;
const RESIZE_HANDLE_SIZE_PX = 12;
const DIMENSION_CHANGE_THRESHOLD_PX = 1;
const Z_INDEX_OVERLAY = 10;
const Z_INDEX_GUIDELINE = 20;

const props = defineProps({
  editor: {
    type: Object,
    required: true,
  },
  visible: {
    type: Boolean,
    default: false,
  },
  textboxElement: {
    type: Object,
    default: null,
  },
});

// Always evaluated fresh — getActiveEditor() is not reactive, so computed() would
// cache a stale body editor and never update when header/footer mode activates.
function getResizeEditor() {
  const editor = props.editor;
  return typeof editor?.getActiveEditor === 'function' ? editor.getActiveEditor() : editor;
}

const isResizeDisabled = computed(
  () => getResizeEditor()?.options?.documentMode === 'viewing' || !getResizeEditor()?.isEditable,
);

const dragState = ref(null);
const moveState = ref(null);
const forcedCleanup = ref(false);

function resolveEditorState(editor) {
  return editor?.view?.state ?? editor?.state ?? null;
}

function resolveTextboxBlockId(textboxElement) {
  return (
    textboxElement?.dataset?.blockId ??
    textboxElement?.getAttribute?.('data-block-id') ??
    textboxElement?.closest?.('[data-block-id]')?.getAttribute?.('data-block-id') ??
    null
  );
}

function resolveShapeContainerAtSelection(editor) {
  const state = resolveEditorState(editor);
  const selection = state?.selection;
  const node = selection?.node;
  const pos = selection?.from;
  if (node?.type?.name !== 'shapeContainer' || !Number.isFinite(pos)) {
    return null;
  }

  return { state, node, pos };
}

function resolveShapeContainerFromTextboxElement(editor, textboxElement) {
  const state = resolveEditorState(editor);
  const pmStart = textboxElement?.querySelector?.('[data-pm-start]')?.getAttribute?.('data-pm-start');
  const contentPos = Number.parseInt(pmStart ?? '', 10);
  if (!state?.doc || !Number.isFinite(contentPos) || contentPos < 0) {
    return null;
  }

  const $contentPos = state.doc.resolve(contentPos);
  for (let depth = $contentPos.depth; depth > 0; depth -= 1) {
    const ancestor = $contentPos.node(depth);
    if (ancestor?.type?.name !== 'shapeContainer') continue;

    const pos = $contentPos.before(depth);
    return { state, node: ancestor, pos };
  }

  return null;
}

function resolveShapeContainer(editor, textboxElement) {
  return (
    resolveShapeContainerAtSelection(editor) ?? resolveShapeContainerFromTextboxElement(editor, textboxElement) ?? null
  );
}

const overlayStyle = computed(() => {
  if (!props.textboxElement || !props.textboxElement.isConnected) return {};

  const textboxRect = props.textboxElement.getBoundingClientRect();
  const wrapper = props.textboxElement.closest('.super-editor');
  if (!wrapper) {
    return {
      position: 'absolute',
      left: `${props.textboxElement.offsetLeft}px`,
      top: `${props.textboxElement.offsetTop}px`,
      width: `${textboxRect.width}px`,
      height: `${textboxRect.height}px`,
      pointerEvents: 'auto',
      zIndex: Z_INDEX_OVERLAY,
    };
  }

  const wrapperRect = wrapper.getBoundingClientRect();
  const scrollLeft = wrapper.scrollLeft || 0;
  const scrollTop = wrapper.scrollTop || 0;
  const relativeLeft = textboxRect.left - wrapperRect.left + scrollLeft;
  const relativeTop = textboxRect.top - wrapperRect.top + scrollTop;

  let overlayWidth = textboxRect.width;
  let overlayHeight = textboxRect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (dragState.value) {
    overlayWidth = textboxRect.width + OVERLAY_EXPANSION_PX * 2;
    overlayHeight = textboxRect.height + OVERLAY_EXPANSION_PX * 2;
    offsetX = -OVERLAY_EXPANSION_PX;
    offsetY = -OVERLAY_EXPANSION_PX;
  }

  // Read delta properties so the computed re-runs on each mousemove tick.
  // getBoundingClientRect() includes CSS transforms, so once these deps fire
  // the overlay and handles follow the element as it translates.
  void moveState.value?.deltaX;
  void moveState.value?.deltaY;

  return {
    position: 'absolute',
    left: `${relativeLeft + offsetX}px`,
    top: `${relativeTop + offsetY}px`,
    width: `${overlayWidth}px`,
    height: `${overlayHeight}px`,
    pointerEvents: 'auto',
    zIndex: Z_INDEX_OVERLAY,
  };
});

const resizeHandles = computed(() => {
  if (!props.textboxElement) return [];

  const rect = props.textboxElement.getBoundingClientRect();
  const offset = RESIZE_HANDLE_SIZE_PX / 2;
  const expansion = dragState.value ? OVERLAY_EXPANSION_PX : 0;
  void moveState.value; // re-run when move delta changes so handles follow the textbox

  return [
    {
      position: 'nw',
      style: { left: `${expansion - offset}px`, top: `${expansion - offset}px`, cursor: 'nwse-resize' },
    },
    {
      position: 'ne',
      style: { left: `${expansion + rect.width - offset}px`, top: `${expansion - offset}px`, cursor: 'nesw-resize' },
    },
    {
      position: 'sw',
      style: { left: `${expansion - offset}px`, top: `${expansion + rect.height - offset}px`, cursor: 'nesw-resize' },
    },
    {
      position: 'se',
      style: {
        left: `${expansion + rect.width - offset}px`,
        top: `${expansion + rect.height - offset}px`,
        cursor: 'nwse-resize',
      },
    },
  ];
});

const guidelineStyle = computed(() => {
  if (!dragState.value) return { display: 'none' };

  const { handle, initialWidth, initialHeight, width, height } = dragState.value;
  // For handles that anchor the bottom-right corner (NW, NE, SW), offset the
  // guideline so the fixed corner stays visually pinned during drag.
  const left = OVERLAY_EXPANSION_PX + (handle === 'nw' || handle === 'sw' ? initialWidth - width : 0);
  const top = OVERLAY_EXPANSION_PX + (handle === 'nw' || handle === 'ne' ? initialHeight - height : 0);

  return {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    border: '2px solid #4A90E2',
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    pointerEvents: 'none',
    zIndex: Z_INDEX_GUIDELINE,
    boxSizing: 'border-box',
  };
});

function onHandleMouseDown(event, handlePosition) {
  event.preventDefault();
  event.stopPropagation();

  if (isResizeDisabled.value || !props.textboxElement) return;

  const editor = getResizeEditor();
  const resolvedShape = resolveShapeContainer(editor, props.textboxElement);
  if (!editor?.view || !resolvedShape) {
    return;
  }

  const rect = props.textboxElement.getBoundingClientRect();
  const initialMarginOffset = resolvedShape.node.attrs?.marginOffset ?? null;
  dragState.value = {
    handle: handlePosition,
    initialX: event.clientX,
    initialY: event.clientY,
    initialWidth: rect.width,
    initialHeight: rect.height,
    width: rect.width,
    height: rect.height,
    initialMarginOffset,
  };

  editor.view.dom.style.pointerEvents = 'none';
  document.addEventListener('mousemove', onDocumentMouseMove);
  document.addEventListener('mouseup', onDocumentMouseUp);
  document.addEventListener('keydown', onEscapeKey);
}

function onDocumentMouseMove(event) {
  if (!dragState.value) return;

  let deltaX = event.clientX - dragState.value.initialX;
  let deltaY = event.clientY - dragState.value.initialY;
  const handle = dragState.value.handle;

  if (handle === 'nw') {
    deltaX = -deltaX;
    deltaY = -deltaY;
  } else if (handle === 'ne') {
    deltaY = -deltaY;
  } else if (handle === 'sw') {
    deltaX = -deltaX;
  }

  dragState.value.width = Math.max(20, dragState.value.initialWidth + deltaX);
  dragState.value.height = Math.max(20, dragState.value.initialHeight + deltaY);
}

function onEscapeKey(event) {
  if (event.key !== 'Escape' || !dragState.value) return;
  forcedCleanup.value = true;
  onDocumentMouseUp();
  forcedCleanup.value = false;
}

function onDocumentMouseUp() {
  if (!dragState.value) return;

  const editor = getResizeEditor();
  if (editor?.view?.dom) {
    editor.view.dom.style.pointerEvents = 'auto';
  }

  document.removeEventListener('mousemove', onDocumentMouseMove);
  document.removeEventListener('mouseup', onDocumentMouseUp);
  document.removeEventListener('keydown', onEscapeKey);

  const widthDelta = Math.abs(dragState.value.width - dragState.value.initialWidth);
  const heightDelta = Math.abs(dragState.value.height - dragState.value.initialHeight);

  if (
    !forcedCleanup.value &&
    (widthDelta > DIMENSION_CHANGE_THRESHOLD_PX || heightDelta > DIMENSION_CHANGE_THRESHOLD_PX)
  ) {
    dispatchResizeTransaction(Math.round(dragState.value.width), Math.round(dragState.value.height));
  }

  dragState.value = null;
}

function onOverlayMouseDown(event) {
  event.stopPropagation();
  // Resize handles call stopPropagation themselves, so this fires only on the overlay body.
  if (event.target.closest('.resize-handle')) return;
  if (isResizeDisabled.value || !props.textboxElement) return;

  event.preventDefault();

  const editor = getResizeEditor();
  const resolvedShape = resolveShapeContainer(editor, props.textboxElement);
  if (!editor?.view || !resolvedShape) return;

  const existingOffset = resolvedShape.node.attrs?.marginOffset;
  if (!existingOffset || (existingOffset.horizontal == null && existingOffset.top == null)) return;

  moveState.value = {
    initialX: event.clientX,
    initialY: event.clientY,
    initialHorizontal: existingOffset.horizontal ?? 0,
    initialTop: existingOffset.top ?? 0,
    deltaX: 0,
    deltaY: 0,
  };

  document.addEventListener('mousemove', onDocumentMouseMoveForMove);
  document.addEventListener('mouseup', onDocumentMouseUpForMove);
  document.addEventListener('keydown', onEscapeKeyForMove);
}

function onDocumentMouseMoveForMove(event) {
  if (!moveState.value) return;
  moveState.value.deltaX = event.clientX - moveState.value.initialX;
  moveState.value.deltaY = event.clientY - moveState.value.initialY;
  if (props.textboxElement) {
    props.textboxElement.style.transform = `translate(${moveState.value.deltaX}px, ${moveState.value.deltaY}px)`;
  }
}

function onEscapeKeyForMove(event) {
  if (event.key !== 'Escape' || !moveState.value) return;
  if (props.textboxElement) props.textboxElement.style.transform = '';
  cleanupMoveListeners();
}

function cleanupMoveListeners() {
  document.removeEventListener('mousemove', onDocumentMouseMoveForMove);
  document.removeEventListener('mouseup', onDocumentMouseUpForMove);
  document.removeEventListener('keydown', onEscapeKeyForMove);
  moveState.value = null;
}

function onDocumentMouseUpForMove() {
  if (!moveState.value) return;

  const { deltaX, deltaY, initialHorizontal, initialTop } = moveState.value;

  if (props.textboxElement) props.textboxElement.style.transform = '';

  const MOVE_THRESHOLD_PX = 2;
  if (Math.abs(deltaX) > MOVE_THRESHOLD_PX || Math.abs(deltaY) > MOVE_THRESHOLD_PX) {
    dispatchMoveTransaction(Math.round(initialHorizontal + deltaX), Math.round(initialTop + deltaY));
  }

  cleanupMoveListeners();
}

function dispatchMoveTransaction(newHorizontal, newTop) {
  const editor = getResizeEditor();
  const resolvedShape = resolveShapeContainer(editor, props.textboxElement);
  if (!editor?.view || !resolvedShape) return;

  const { state, node, pos } = resolvedShape;
  const tr = state.tr;
  tr.setNodeAttribute(pos, 'marginOffset', {
    ...node.attrs.marginOffset,
    horizontal: newHorizontal,
    top: newTop,
  });

  const $shapePos = state.doc.resolve(pos);
  for (let depth = $shapePos.depth; depth > 0; depth -= 1) {
    const ancestor = $shapePos.node(depth);
    if (!nodeAllowsSdBlockRevAttr(ancestor)) continue;
    const currentRev = Number.parseInt(ancestor.attrs?.sdBlockRev, 10);
    if (!Number.isFinite(currentRev)) continue;
    tr.setNodeAttribute($shapePos.before(depth), 'sdBlockRev', currentRev + 1);
  }

  editor.view.dispatch(tr);

  const blockId = resolveTextboxBlockId(props.textboxElement);
  if (blockId) {
    measureCache.invalidate([blockId]);
    invalidateHeaderFooterMeasureCache([blockId]);
  }
}

function dispatchResizeTransaction(newWidth, newHeight) {
  const editor = getResizeEditor();
  const resolvedShape = resolveShapeContainer(editor, props.textboxElement);
  if (!editor?.view || !resolvedShape) {
    return;
  }

  const { state, pos } = resolvedShape;
  const tr = state.tr;
  tr.setNodeAttribute(pos, 'width', newWidth);
  tr.setNodeAttribute(pos, 'height', newHeight);

  // NW/SW handles anchor the bottom-right corner: the origin must shift by the
  // same amount the dimension grew, so the opposite corner stays fixed.
  const handle = dragState.value?.handle;
  const initialMarginOffset = dragState.value?.initialMarginOffset;
  // NW/SW handles anchor the bottom-right corner; NE anchors the bottom-left.
  // The origin must shift by the same amount the leading edge grew.
  if (initialMarginOffset && (handle === 'nw' || handle === 'sw' || handle === 'ne')) {
    const effectiveDeltaX = newWidth - (dragState.value?.initialWidth ?? newWidth);
    const effectiveDeltaY = newHeight - (dragState.value?.initialHeight ?? newHeight);
    tr.setNodeAttribute(pos, 'marginOffset', {
      ...initialMarginOffset,
      horizontal:
        handle === 'nw' || handle === 'sw'
          ? (initialMarginOffset.horizontal ?? 0) - effectiveDeltaX
          : (initialMarginOffset.horizontal ?? 0),
      top:
        handle === 'nw' || handle === 'ne'
          ? (initialMarginOffset.top ?? 0) - effectiveDeltaY
          : (initialMarginOffset.top ?? 0),
    });
  }

  const $shapePos = state.doc.resolve(pos);
  for (let depth = $shapePos.depth; depth > 0; depth -= 1) {
    const ancestor = $shapePos.node(depth);
    if (!nodeAllowsSdBlockRevAttr(ancestor)) continue;

    const currentRev = Number.parseInt(ancestor.attrs?.sdBlockRev, 10);
    if (!Number.isFinite(currentRev)) continue;
    tr.setNodeAttribute($shapePos.before(depth), 'sdBlockRev', currentRev + 1);
  }

  editor.view.dispatch(tr);

  const blockId = resolveTextboxBlockId(props.textboxElement);
  if (blockId) {
    measureCache.invalidate([blockId]);
    invalidateHeaderFooterMeasureCache([blockId]);
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      if (dragState.value) {
        forcedCleanup.value = true;
        onDocumentMouseUp();
        forcedCleanup.value = false;
      }
      if (moveState.value) {
        if (props.textboxElement) props.textboxElement.style.transform = '';
        cleanupMoveListeners();
      }
    }
  },
);

onBeforeUnmount(() => {
  if (dragState.value) {
    document.removeEventListener('mousemove', onDocumentMouseMove);
    document.removeEventListener('mouseup', onDocumentMouseUp);
    document.removeEventListener('keydown', onEscapeKey);
    const editor = getResizeEditor();
    if (editor?.view?.dom) {
      editor.view.dom.style.pointerEvents = 'auto';
    }
  }
  if (moveState.value) {
    document.removeEventListener('mousemove', onDocumentMouseMoveForMove);
    document.removeEventListener('mouseup', onDocumentMouseUpForMove);
    document.removeEventListener('keydown', onEscapeKeyForMove);
    moveState.value = null;
  }
});
</script>

<style scoped>
.superdoc-textbox-resize-overlay {
  position: absolute;
  pointer-events: auto;
  user-select: none;
  overflow: visible;
  cursor: move;
}

.resize-handle {
  position: absolute;
  width: v-bind('RESIZE_HANDLE_SIZE_PX + "px"');
  height: v-bind('RESIZE_HANDLE_SIZE_PX + "px"');
  background-color: #ffffff;
  border: 2px solid #4a90e2;
  border-radius: 50%;
  user-select: none;
  pointer-events: auto;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.resize-handle--active {
  background-color: #4a90e2;
  border-color: #ffffff;
}

.resize-guideline {
  position: absolute;
  pointer-events: none;
  box-shadow: 0 0 4px rgba(74, 144, 226, 0.5);
}
</style>
